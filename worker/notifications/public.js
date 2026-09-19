import { randomToken, sha256hex, uuid } from '../util.js';
import { normalizeCountry, getCountry } from '../../app/lib/country/countries.js';
import { notificationPayload, pushError, validateSubscription } from './security.js';

const DAY=86400000;
export const VISITOR_COOKIE='__Host-evp_push';
export async function anonymousOwner(request) {
  const token=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(VISITOR_COOKIE+'='))?.slice(VISITOR_COOKIE.length+1);
  return /^[A-Za-z0-9_-]{43}$/.test(token||'')?sha256hex(token):null;
}
export function visitorCookie() {
  return `${VISITOR_COOKIE}=${randomToken(32)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
}
export async function publicRateLimit(env,key,max=20,now=Date.now()) {
  const window=Math.floor(now/60000)*60000;
  const row=await env.DB.prepare(`INSERT INTO push_public_rate_limits VALUES(?1,?2,1) ON CONFLICT(key) DO UPDATE SET
    window_start=excluded.window_start,attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END RETURNING attempts`).bind(key,window).first();
  if(!row||row.attempts>max)throw pushError('rate_limited',429);
}
export async function registerPublicSubscription(env,body,config,owner) {
  if(!owner)throw pushError('browser_identity_required',401);
  let country=normalizeCountry(body?.countryCode);
  // Subscription rotation by the existing SW can reuse this browser's single
  // previously selected country. A new browser always needs an explicit choice.
  if(!body?.countryCode){
    const {results}=await env.DB.prepare("SELECT DISTINCT country_code FROM push_subscriptions WHERE scope='public_country' AND anonymous_token_hash=?1 LIMIT 2").bind(owner).all();
    if(results?.length===1)country=normalizeCountry(results[0].country_code);
  }
  if(!country)throw pushError('country_required');
  const sub=await validateSubscription(body),now=Date.now();
  await publicRateLimit(env,'register:'+owner,10);await publicRateLimit(env,'register:global',200);
  if(await env.DB.prepare('SELECT 1 FROM push_expired_endpoints WHERE endpoint_hash=?1 AND expires_at>?2').bind(sub.endpointHash,now).first())throw pushError('subscription_expired',409);
  const existing=await env.DB.prepare('SELECT scope,anonymous_token_hash FROM push_subscriptions WHERE endpoint_hash=?1').bind(sub.endpointHash).first();
  if(existing&&(existing.scope!=='public_country'||existing.anonymous_token_hash!==owner))throw pushError('subscription_owned_elsewhere',409);
  const row=await env.DB.prepare(`INSERT INTO push_subscriptions(id,user_id,session_id,endpoint_hash,endpoint,p256dh,auth,vapid_fingerprint,expiration_time,created_at,updated_at,last_used_at,scope,country_code,anonymous_token_hash)
    SELECT ?1,NULL,NULL,?2,?3,?4,?5,?6,?7,?8,?8,?8,'public_country',?9,?10
    WHERE (SELECT COUNT(*) FROM push_subscriptions WHERE anonymous_token_hash=?10)<5 OR EXISTS(SELECT 1 FROM push_subscriptions WHERE endpoint_hash=?2)
    ON CONFLICT(endpoint_hash) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,vapid_fingerprint=excluded.vapid_fingerprint,
      expiration_time=excluded.expiration_time,country_code=excluded.country_code,updated_at=excluded.updated_at,last_used_at=excluded.last_used_at
    WHERE push_subscriptions.scope='public_country' AND push_subscriptions.anonymous_token_hash=?10 RETURNING id`)
    .bind(uuid(),sub.endpointHash,sub.endpoint,sub.p256dh,sub.auth,config.fingerprint,sub.expiration,now,country,owner).first();
  if(!row)throw pushError('device_limit',409);
  if(body.replacesEndpointHash&&body.replacesEndpointHash!==sub.endpointHash)await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint_hash=?1 AND scope='public_country' AND anonymous_token_hash=?2").bind(body.replacesEndpointHash,owner).run();
  return {id:row.id,scope:'public_country',countryCode:country};
}

// One summary for the previous completed UTC day, after 08:00 UTC. Use canonical
// public_projects counts; no frontend snapshots and no backfill before opt-in.
export async function scanCountries(env,now=Date.now()) {
  const today=new Date(now).toISOString().slice(0,10),start=Date.parse(today+'T00:00:00Z');
  if(now-start<8*3600000)return;
  const day=new Date(start-DAY).toISOString().slice(0,10);
  if(!await env.DB.prepare('SELECT 1 FROM push_country_scans WHERE day=?1').bind(day).first()){
    const {results}=await env.DB.prepare(`SELECT country_code,SUM(substr(first_seen,1,10)=?1) AS new_count,
      SUM(status IN ('open','closing_soon')) AS open_count FROM public_projects
      WHERE country_code IN (SELECT DISTINCT country_code FROM push_subscriptions WHERE scope='public_country' AND created_at<?2)
      GROUP BY country_code`).bind(day,start).all();
    const statements=[];
    for(const row of results||[]){
      const country=normalizeCountry(row.country_code);if(!country||row.new_count<1)continue;
      const id='country:'+country+':'+day,info=getCountry(country);
      const payload=notificationPayload('country',{title:'Нови възможности за европейско финансиране',
        body:`${row.new_count} новооткрити процедури в ${info.nameBg} (${day}). Отворени в момента: ${row.open_count||0}.`,url:'/procedures/countries/'+country.toLowerCase()});
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO push_notifications(id,user_id,type,dedupe_key,payload,created_at,expires_at,country_code) VALUES(?1,NULL,'country',?1,?2,?3,?4,?5)`)
        .bind(id,JSON.stringify(payload),now,start+DAY,country));
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO push_country_batches(country_code,day,notification_id) VALUES(?1,?2,?3)').bind(country,day,id));
    }
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO push_country_scans VALUES(?1,?2)').bind(day,now));
    await env.DB.batch(statements);
  }
  const batch=await env.DB.prepare('SELECT * FROM push_country_batches WHERE day=?1 AND complete=0 ORDER BY country_code LIMIT 1').bind(day).first();
  if(!batch)return;
  const {results}=await env.DB.prepare(`SELECT id FROM push_subscriptions WHERE scope='public_country' AND country_code=?1 AND id>?2
    AND created_at<?3 AND (expiration_time IS NULL OR expiration_time>?4) AND COALESCE(last_used_at,updated_at)>?5 ORDER BY id LIMIT 100`)
    .bind(batch.country_code,batch.cursor,start,now,now-180*DAY).all();
  const subs=results||[];
  const statements=subs.map(s=>env.DB.prepare('INSERT OR IGNORE INTO push_deliveries(id,notification_id,subscription_id,public_summary_day) VALUES(?1,?2,?3,?4)').bind(uuid(),batch.notification_id,s.id,day));
  statements.push(env.DB.prepare('UPDATE push_country_batches SET cursor=?3,complete=?4 WHERE country_code=?1 AND day=?2').bind(batch.country_code,day,subs.at(-1)?.id||batch.cursor,subs.length<100?1:0));
  await env.DB.batch(statements);
}
