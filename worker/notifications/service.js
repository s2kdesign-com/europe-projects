import webPush from 'web-push';
import { randomToken, sha256hex, uuid } from '../util.js';
import { notificationPayload, pushError, readVapid, validateEndpoint, validateSubscription } from './security.js';
import { entitlement } from '../billing/entitlement.js';
import { scanCountries } from './public.js';

export const DAY = 86400000;
const ACTIVE = "s.expiration_time IS NULL OR s.expiration_time > ?1";
export const SAVED_SELECT = `SELECT sp.id AS saved_id, sp.user_id, sp.procedure_id, sp.archived_at,
  sp.reminder_enabled, sp.reminder_days_before, p.name, p.program, p.status, p.deadline_date,
  p.deadline, p.budget, p.eligible, p.notes, p.public_slug,
  pref.change_notifications_enabled, pref.deadline_notifications_enabled, pref.notification_days_before
  FROM saved_procedures sp JOIN public_projects p ON p.id=sp.procedure_id
  JOIN user_preferences pref ON pref.user_id=sp.user_id`;

export async function rateLimit(env, userId, action, max, interval, now=Date.now()) {
  const window=Math.floor(now/interval)*interval;
  const row=await env.DB.prepare(`INSERT INTO push_rate_limits(user_id,action,window_start,attempts) VALUES(?1,?2,?3,1)
    ON CONFLICT(user_id,action) DO UPDATE SET window_start=excluded.window_start,
    attempts=CASE WHEN push_rate_limits.window_start=excluded.window_start THEN push_rate_limits.attempts+1 ELSE 1 END RETURNING attempts`)
    .bind(userId,action,window).first();
  if (!row || row.attempts>max) throw pushError('rate_limited',429);
}

export async function snapshotFingerprint(row) {
  return sha256hex(JSON.stringify(['name','program','status','deadline_date','deadline','budget','eligible','notes'].map(k=>row[k] ?? null)));
}

export async function registerSubscription(env, session, body, config, anonymousHash=null) {
  await rateLimit(env,session.user.id,'register',20,600000);
  const sub=await validateSubscription(body);
  const now=Date.now();
  if (await env.DB.prepare('SELECT 1 FROM push_expired_endpoints WHERE endpoint_hash=?1 AND expires_at>?2').bind(sub.endpointHash,now).first()) throw pushError('subscription_expired',410);
  const owner=await env.DB.prepare('SELECT user_id,scope,anonymous_token_hash FROM push_subscriptions WHERE endpoint_hash=?1').bind(sub.endpointHash).first();
  const promotion=owner?.scope==='public_country' && !!anonymousHash && owner.anonymous_token_hash===anonymousHash;
  if (owner && owner.user_id!==session.user.id && !promotion) throw pushError('subscription_owned_elsewhere',409);
  const row=await env.DB.prepare(`INSERT INTO push_subscriptions
    (id,user_id,session_id,endpoint_hash,endpoint,p256dh,auth,vapid_fingerprint,expiration_time,created_at,updated_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10
    WHERE (SELECT COUNT(*) FROM push_subscriptions WHERE user_id=?2)<10
      OR EXISTS(SELECT 1 FROM push_subscriptions WHERE endpoint_hash=?4 AND user_id=?2)
    ON CONFLICT(endpoint_hash) DO UPDATE SET user_id=excluded.user_id,scope='authenticated',anonymous_token_hash=NULL,session_id=excluded.session_id,p256dh=excluded.p256dh,auth=excluded.auth,
      vapid_fingerprint=excluded.vapid_fingerprint,expiration_time=excluded.expiration_time,updated_at=excluded.updated_at
    WHERE push_subscriptions.user_id=excluded.user_id OR (push_subscriptions.scope='public_country' AND push_subscriptions.anonymous_token_hash=?11) RETURNING id`)
    .bind(uuid(),session.user.id,session.session.id,sub.endpointHash,sub.endpoint,sub.p256dh,sub.auth,config.fingerprint,sub.expiration,now,anonymousHash).first();
  if (!row) throw pushError('device_limit',409);
  if(body.replacesEndpointHash&&body.replacesEndpointHash!==sub.endpointHash)await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint_hash=?1 AND
    ((user_id=?2 AND session_id=?3) OR (scope='public_country' AND anonymous_token_hash=?4))`).bind(body.replacesEndpointHash,session.user.id,session.session.id,anonymousHash).run();
  // Opt-in starts from today's content, never a backlog of historical changes.
  const {results}=await env.DB.prepare(SAVED_SELECT+' WHERE sp.user_id=?1 AND sp.archived_at IS NULL').bind(session.user.id).all();
  for (const saved of results || []) await env.DB.prepare('INSERT OR IGNORE INTO push_saved_state(saved_id,fingerprint,observed_at) VALUES(?1,?2,?3)')
    .bind(saved.saved_id,await snapshotFingerprint(saved),now).run();
  return {id:row.id};
}

export function reminderDays(row) {
  const value=row.reminder_enabled && row.reminder_days_before!=null ? Number(row.reminder_days_before) : Number(row.notification_days_before ?? 7);
  return Number.isInteger(value) && value>=0 && value<=60 ? value : 7;
}
export function deadlineDue(row, now=Date.now()) {
  if (!row.deadline_notifications_enabled || row.archived_at || !['open','closing_soon'].includes(row.status)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.deadline_date || '')) return false;
  const deadline=Date.parse(row.deadline_date+'T00:00:00Z');
  if (!Number.isFinite(deadline) || new Date(deadline).toISOString().slice(0,10)!==row.deadline_date) return false;
  const days=Math.round((deadline-Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z'))/DAY);
  return days>=0 && days<=reminderDays(row);
}

export async function createNotification(env, {userId,savedId=null,reportId=null,type,key,payload,subscriptionId=null}, now=Date.now()) {
  const id=uuid();
  const {results}=await env.DB.prepare(`SELECT s.id FROM push_subscriptions s JOIN sessions sess ON sess.id=s.session_id
    WHERE s.user_id=?2 AND sess.user_id=s.user_id AND julianday(sess.expires_at)>julianday('now') AND (${ACTIVE})
    AND (?3 IS NULL OR s.id=?3)`).bind(now,userId,subscriptionId).all();
  const deliveries=[];
  const statements=[env.DB.prepare(`INSERT OR IGNORE INTO push_notifications(id,user_id,saved_id,type,dedupe_key,payload,created_at,expires_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`)
    .bind(id,userId,savedId,type,key,JSON.stringify(payload),now,now+(type==='test'||payload.isTest?300000:DAY))];
  if(reportId)statements.push(env.DB.prepare('UPDATE push_notifications SET report_id=?2 WHERE id=?1').bind(id,reportId));
  for (const sub of results || []) {
    const deliveryId=uuid();
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO push_deliveries(id,notification_id,subscription_id) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM push_notifications WHERE id=?2)').bind(deliveryId,id,sub.id));
    deliveries.push(deliveryId);
  }
  // Event and fan-out commit together. A duplicate event never targets new devices.
  await env.DB.batch(statements);
  const inserted=await env.DB.prepare('SELECT id FROM push_notifications WHERE id=?1').bind(id).first();
  return inserted ? deliveries : [];
}

async function allowedNow(env, row, now) {
  if (row.expires_at<=now) return false;
  if(row.type==='country')return row.user_id===null && row.subscription_scope==='public_country' && row.subscription_country===row.country_code && !row.report_id && !row.saved_id;
  if(row.subscription_scope==='public_country')return false;
  if(row.report_id){
    if(!(await entitlement(env,row.user_id,now)).premium)return false;
    return !!await env.DB.prepare(`SELECT 1 FROM daily_ai_reports r JOIN user_preferences p ON p.user_id=r.user_id
      WHERE r.id=?1 AND r.user_id=?2 AND r.status='ready' AND p.daily_report_notifications_enabled=1`).bind(row.report_id,row.user_id).first();
  }
  if (row.type==='test') return true;
  const saved=await env.DB.prepare(SAVED_SELECT+' WHERE sp.id=?1 AND sp.user_id=?2').bind(row.saved_id,row.user_id).first();
  if (!saved || saved.archived_at) return false;
  if (row.type==='change') return !!saved.change_notifications_enabled;
  const payload=JSON.parse(row.payload);
  return deadlineDue(saved,now) && payload.deadlineDate===saved.deadline_date;
}

export async function allowNotificationVolume(env,row,now=Date.now()) {
  if(!row.user_id||row.type==='test'||JSON.parse(row.payload).isTest)return true;
  const pref=await env.DB.prepare('SELECT premium_notification_daily_limit AS daily_limit FROM user_preferences WHERE user_id=?1').bind(row.user_id).first();
  if(!pref?.daily_limit||!(await entitlement(env,row.user_id,now)).premium)return true;
  const day=new Date(now).toISOString().slice(0,10);
  await env.DB.prepare(`INSERT OR IGNORE INTO push_notification_allowances(user_id,day,notification_id)
    SELECT ?1,?2,?3 WHERE (SELECT COUNT(*) FROM push_notification_allowances WHERE user_id=?1 AND day=?2)<?4`)
    .bind(row.user_id,day,row.notification_id,pref.daily_limit).run();
  return !!await env.DB.prepare('SELECT 1 FROM push_notification_allowances WHERE user_id=?1 AND day=?2 AND notification_id=?3').bind(row.user_id,day,row.notification_id).first();
}

export async function sendDelivery(env, deliveryId, config, {fetchImpl=fetch,now=Date.now()}={}) {
  const claim=await env.DB.prepare(`UPDATE push_deliveries SET state='sending',lease_until=?2,attempts=attempts+1
    WHERE id=?1 AND attempts<3 AND ((state='pending' AND next_attempt_at<=?3) OR (state='sending' AND lease_until<=?3)) RETURNING attempts`)
    .bind(deliveryId,now+60000,now).first();
  if (!claim) return 'unavailable';
  const row=await env.DB.prepare(`SELECT d.*,n.user_id,n.saved_id,n.report_id,n.country_code,n.type,n.payload,n.expires_at,n.id AS notification_id,
    s.endpoint,s.p256dh,s.auth,s.vapid_fingerprint,s.expiration_time,s.id AS subscription_id,s.scope AS subscription_scope,s.country_code AS subscription_country
    FROM push_deliveries d JOIN push_notifications n ON n.id=d.notification_id
    JOIN push_subscriptions s ON s.id=d.subscription_id LEFT JOIN sessions sess ON sess.id=s.session_id
    WHERE d.id=?1 AND ((s.scope='public_country' AND n.type='country' AND n.user_id IS NULL) OR
      (s.scope='authenticated' AND s.user_id=n.user_id AND sess.user_id=s.user_id AND julianday(sess.expires_at)>julianday('now')))`)
    .bind(deliveryId).first();
  const finish=async(state,code=null)=>{
    await env.DB.prepare('UPDATE push_deliveries SET state=?2,error_code=?3,lease_until=0 WHERE id=?1').bind(deliveryId,state,code).run(); return state;
  };
  if (!row || (row.expiration_time && row.expiration_time<=now) || !await allowedNow(env,row,now)) return finish('cancelled');
  if (row.vapid_fingerprint!==config.fingerprint) return finish('failed','subscription_needs_renewal');
  if(!await allowNotificationVolume(env,row,now)){
    await env.DB.prepare("UPDATE push_deliveries SET state='pending',attempts=attempts-1,lease_until=0,next_attempt_at=?2 WHERE id=?1").bind(deliveryId,Math.floor(now/DAY)*DAY+DAY).run();return 'pending';
  }
  let stage='payload';
  try {
    validateEndpoint(row.endpoint);
    const token=randomToken(32);
    await env.DB.prepare('UPDATE push_deliveries SET receipt_hash=?2 WHERE id=?1').bind(deliveryId,await sha256hex(token)).run();
    const original=JSON.parse(row.payload);
    const payload={...notificationPayload(row.type,original),notificationId:row.notification_id,deliveryId,receiptToken:token};
    stage='encryption';
    const details=webPush.generateRequestDetails({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify(payload),{
      vapidDetails:{subject:config.subject,publicKey:config.publicKey,privateKey:config.privateKey},
      TTL:Math.max(1,Math.floor((row.expires_at-now)/1000)),urgency:row.type==='test'?'high':'normal',contentEncoding:'aes128gcm',
    });
    stage='provider_request';
    // Workers supports manual/follow only. Never follow a push-service redirect;
    // the permanent-failure branch below rejects every 3xx response.
    const response=await fetchImpl(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'manual',signal:AbortSignal.timeout(10000)});
    // Never read/log push provider bodies: they can echo subscription credentials.
    await response.body?.cancel();
    if (response.status===404 || response.status===410) {
      await env.DB.batch([
        env.DB.prepare('INSERT OR REPLACE INTO push_expired_endpoints(endpoint_hash,expires_at) VALUES(?1,?2)').bind(await sha256hex(row.endpoint),now+7*DAY),
        env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?1').bind(row.subscription_id),
      ]);
      return 'expired';
    }
    if (response.status>=200 && response.status<300) {
      await env.DB.batch([
        env.DB.prepare("UPDATE push_deliveries SET state='accepted',accepted_at=?2,error_code=NULL,lease_until=0 WHERE id=?1").bind(deliveryId,now),
        env.DB.prepare('UPDATE push_subscriptions SET last_used_at=?2 WHERE id=?1').bind(row.subscription_id,now),
      ]); return 'accepted';
    }
    if (response.status!==429 && response.status<500) return finish('failed','push_rejected');
    console.error('push_delivery_retry','provider_status',response.status);
  } catch(error) {
    // Only allowlisted stage/type codes, never exception text or request data.
    const kind=['AbortError','TimeoutError','TypeError','RangeError'].includes(error?.name)?error.name:'Error';
    console.error('push_delivery_retry',stage,kind);
  }
  if (claim.attempts>=3) return finish('failed','delivery_failed');
  await env.DB.prepare("UPDATE push_deliveries SET state='pending',lease_until=0,next_attempt_at=?2,error_code='delivery_delayed' WHERE id=?1")
    .bind(deliveryId,now+60000*2**claim.attempts).run();
  return 'pending';
}

export async function scanSaved(env, now=Date.now()) {
  const dispatch=await env.DB.prepare('SELECT cursor FROM push_dispatch_state WHERE id=1').first();
  const {results}=await env.DB.prepare(SAVED_SELECT+` WHERE sp.id>?1 AND EXISTS (
    SELECT 1 FROM push_subscriptions sub JOIN sessions sess ON sess.id=sub.session_id WHERE sub.user_id=sp.user_id
    AND julianday(sess.expires_at)>julianday('now') AND (sub.expiration_time IS NULL OR sub.expiration_time>?2)) ORDER BY sp.id LIMIT 100`)
    .bind(dispatch?.cursor || '',now).all();
  let processed=0;
  for (const row of results || []) {
    const fingerprint=await snapshotFingerprint(row);
    const previous=await env.DB.prepare('SELECT fingerprint,revision FROM push_saved_state WHERE saved_id=?1').bind(row.saved_id).first();
    if (previous && previous.fingerprint!==fingerprint && !row.archived_at && row.change_notifications_enabled) {
      await createNotification(env,{userId:row.user_id,savedId:row.saved_id,type:'change',key:`change:${row.saved_id}:${previous.revision+1}`,
        payload:notificationPayload('change',{title:'Промяна по запазена процедура',body:row.name,url:'/procedures/'+(row.public_slug || encodeURIComponent(row.procedure_id))})},now);
    }
    await env.DB.prepare(`INSERT INTO push_saved_state(saved_id,fingerprint,observed_at) VALUES(?1,?2,?3)
      ON CONFLICT(saved_id) DO UPDATE SET fingerprint=excluded.fingerprint,observed_at=excluded.observed_at,
      revision=push_saved_state.revision+CASE WHEN push_saved_state.fingerprint<>excluded.fingerprint THEN 1 ELSE 0 END`)
      .bind(row.saved_id,fingerprint,now).run();
    if (deadlineDue(row,now)) await createNotification(env,{userId:row.user_id,savedId:row.saved_id,type:'deadline',key:`deadline:${row.saved_id}:${row.deadline_date}`,
      payload:{...notificationPayload('deadline',{title:'Наближава срокът за кандидатстване',body:`${row.name} · ${row.deadline_date}`,url:'/procedures/'+(row.public_slug || encodeURIComponent(row.procedure_id))}),deadlineDate:row.deadline_date}},now);
    processed++;
    if(Date.now()-now>20000)break;
  }
  await env.DB.prepare('UPDATE push_dispatch_state SET cursor=?1 WHERE id=1').bind(processed && (processed===100 || processed<results.length) ? results[processed-1].saved_id : '').run();
}

export async function runPushNotifications(env) {
  // Separate bounded job alongside the existing AI cron, no external scheduler.
  let config;
  try { config=await readVapid(env); } catch { return; }
  const now=Date.now();
  const lock=uuid();
  const lease=await env.DB.prepare('UPDATE push_dispatch_state SET lease_until=?1,lock_token=?3 WHERE id=1 AND lease_until<=?2 RETURNING id').bind(now+90000,now,lock).first();
  if (!lease) return;
  try {
    await scanSaved(env,now);
    await scanCountries(env,now);
    const {results}=await env.DB.prepare(`SELECT id FROM push_deliveries WHERE attempts<3 AND
      ((state='pending' AND next_attempt_at<=?1) OR (state='sending' AND lease_until<=?1)) ORDER BY next_attempt_at LIMIT 12`).bind(now).all();
    for (let i=0;i<(results || []).length;i+=4) await Promise.all(results.slice(i,i+4).map(d=>sendDelivery(env,d.id,config)));
    await env.DB.prepare('DELETE FROM push_notifications WHERE id IN (SELECT id FROM push_notifications WHERE expires_at<?1 LIMIT 500)').bind(now-30*DAY).run();
    await env.DB.prepare('DELETE FROM push_expired_endpoints WHERE expires_at<=?1').bind(now).run();
    await env.DB.prepare("UPDATE push_deliveries SET state='failed',error_code='delivery_failed' WHERE state='sending' AND lease_until<=?1 AND attempts>=3").bind(now).run();
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE (expiration_time IS NOT NULL AND expiration_time<=?1) OR session_id IN (SELECT id FROM sessions WHERE julianday(expires_at)<=julianday('now'))").bind(now).run();
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE scope='public_country' AND COALESCE(last_used_at,updated_at)<?1").bind(now-180*DAY).run();
    await env.DB.prepare('DELETE FROM push_public_rate_limits WHERE window_start<?1').bind(now-DAY).run();
    await env.DB.prepare('DELETE FROM push_country_scans WHERE day<?1').bind(new Date(now-32*DAY).toISOString().slice(0,10)).run();
  } finally { await env.DB.prepare('UPDATE push_dispatch_state SET lease_until=0 WHERE id=1 AND lock_token=?1').bind(lock).run(); }
}

export async function receiveReceipt(env, session, body, anonymousHash=null) {
  if (!body || !['received','displayed','clicked'].includes(body.phase) || !/^[a-f0-9-]{36}$/.test(body.deliveryId || '') || !/^[A-Za-z0-9_-]{43}$/.test(body.token || '')) throw pushError('invalid_receipt');
  const row=await env.DB.prepare(`SELECT d.id,n.user_id,n.saved_id,n.report_id,n.country_code,n.type,n.payload,n.expires_at,s.scope AS subscription_scope,s.country_code AS subscription_country FROM push_deliveries d
    JOIN push_notifications n ON n.id=d.notification_id JOIN push_subscriptions s ON s.id=d.subscription_id
    WHERE d.id=?1 AND d.receipt_hash=?4 AND ((s.scope='authenticated' AND n.user_id=?2 AND s.user_id=?2 AND s.session_id=?3)
      OR (s.scope='public_country' AND n.user_id IS NULL AND n.type='country' AND s.anonymous_token_hash=?5))`)
    .bind(body.deliveryId,session?.user?.id||null,session?.session?.id||null,await sha256hex(body.token),anonymousHash).first();
  if (!row || !await allowedNow(env,row,Date.now())) return {allowed:false};
  const field={displayed:'displayed_at',clicked:'clicked_at'}[body.phase];
  if (field) await env.DB.prepare(`UPDATE push_deliveries SET ${field}=COALESCE(${field},?2) WHERE id=?1`).bind(row.id,Date.now()).run();
  return {allowed:true};
}
