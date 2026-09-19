import { getSession } from '../session.js';
import { json, uuid } from '../util.js';
import { PushError, notificationPayload, pushError, readPushJson, readVapid } from './security.js';
import { createNotification, DAY, deadlineDue, rateLimit, receiveReceipt, registerSubscription, SAVED_SELECT, sendDelivery } from './service.js';
import { anonymousOwner, publicRateLimit, registerPublicSubscription, visitorCookie } from './public.js';
import { entitlement } from '../billing/entitlement.js';

const reply=(data,status=200,headers={})=>json(data,status,{'cache-control':'no-store','x-content-type-options':'nosniff',...headers});
export function pushSameOrigin(request,env,url) {
  try {
    const origin=request.headers.get('origin');
    const source=origin ? new URL(origin).origin : new URL(request.headers.get('referer')).origin;
    return source===new URL(env.APP_URL || url.origin).origin && request.headers.get('sec-fetch-site')!=='cross-site';
  } catch { return false; }
}

export async function handleNotifications(request,env,url,{sessionGetter=getSession,fetchImpl=fetch}={}) {
  if (!url.pathname.startsWith('/api/notifications/')) return null;
  try {
    const path=url.pathname.slice('/api/notifications/'.length);
    if (path==='config' && request.method==='GET') {
      try { const config=await readVapid(env); return reply({ok:true,configured:true,publicKey:config.publicKey}); }
      catch { return reply({ok:true,configured:false}); }
    }
    const session=await sessionGetter(env,request);
    if (request.method!=='GET' && !pushSameOrigin(request,env,url)) throw pushError('csrf',403);
    const owner=await anonymousOwner(request);
    if(path==='visitor' && request.method==='POST'){
      await publicRateLimit(env,'visitor:global',200);
      return reply({ok:true},200,owner?{}:{'set-cookie':visitorCookie()});
    }
    if(path==='receipt' && request.method==='POST')return reply({ok:true,...await receiveReceipt(env,session,await readPushJson(request),owner)});
    if(!session?.user || !session.session){
      if(!owner)throw pushError('unauthorized',401);
      if(path==='subscription' && request.method==='POST')return reply({ok:true,...await registerPublicSubscription(env,await readPushJson(request),await readVapid(env),owner)});
      if((path==='subscription/status' && request.method==='POST') || (path==='subscription' && request.method==='DELETE')){
        const body=await readPushJson(request);if(!/^[a-f0-9]{64}$/.test(body?.endpointHash||''))throw pushError('invalid_subscription');
        await publicRateLimit(env,'manage:'+owner,60);
        if(request.method==='DELETE'){
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint_hash=?1 AND scope='public_country' AND anonymous_token_hash=?2").bind(body.endpointHash,owner).run();return reply({ok:true});
        }
        const config=await readVapid(env);
        const row=await env.DB.prepare("SELECT id,country_code,vapid_fingerprint,expiration_time FROM push_subscriptions WHERE endpoint_hash=?1 AND scope='public_country' AND anonymous_token_hash=?2").bind(body.endpointHash,owner).first();
        const active=!!row&&row.vapid_fingerprint===config.fingerprint&&(!row.expiration_time||row.expiration_time>Date.now());
        return reply({ok:true,active,id:active?row.id:null,scope:'public_country',countryCode:active?row.country_code:null});
      }
      throw pushError('unauthorized',401);
    }
    const userId=session.user.id;
    if (path==='subscription' && request.method==='POST') {
      const config=await readVapid(env);
      return reply({ok:true,...await registerSubscription(env,session,await readPushJson(request),config,owner),scope:'authenticated',premium:(await entitlement(env,userId)).premium});
    }
    if (path==='subscription/status' && request.method==='POST') {
      const body=await readPushJson(request);
      if (!/^[a-f0-9]{64}$/.test(body?.endpointHash || '')) throw pushError('invalid_subscription');
      const config=await readVapid(env);
      const row=await env.DB.prepare(`SELECT id,session_id,vapid_fingerprint,expiration_time FROM push_subscriptions WHERE user_id=?1 AND endpoint_hash=?2`)
        .bind(userId,body.endpointHash).first();
      const active=!!row && row.session_id===session.session.id && row.vapid_fingerprint===config.fingerprint && (!row.expiration_time || row.expiration_time>Date.now());
      return reply({ok:true,active,id:active?row.id:null,scope:'authenticated',premium:(await entitlement(env,userId)).premium});
    }
    if (path==='subscription' && request.method==='DELETE') {
      const body=await readPushJson(request);
      if (!/^[a-f0-9]{64}$/.test(body?.endpointHash || '')) throw pushError('invalid_subscription');
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id=?1 AND endpoint_hash=?2').bind(userId,body.endpointHash).run();
      return reply({ok:true});
    }
    if (path==='prompt' && request.method==='POST') {
      const now=Date.now();
      const row=await env.DB.prepare(`UPDATE user_preferences SET notification_prompt_last_shown_at=?2 WHERE user_id=?1
        AND (notification_prompt_last_shown_at IS NULL OR notification_prompt_last_shown_at<=?3) RETURNING notification_prompt_last_shown_at`)
        .bind(userId,now,now-DAY).first();
      return reply({ok:true,claimed:!!row,lastShownAt:row?.notification_prompt_last_shown_at || null});
    }
    if (path==='test' && request.method==='POST') {
      const body=await readPushJson(request);
      if (typeof body?.subscriptionId!=='string') throw pushError('subscription_required');
      const sub=await env.DB.prepare('SELECT id FROM push_subscriptions WHERE id=?1 AND user_id=?2 AND session_id=?3').bind(body.subscriptionId,userId,session.session.id).first();
      if (!sub) throw pushError('subscription_required',404);
      await rateLimit(env,userId,'test',3,60000);
      const config=await readVapid(env);
      const type=body.scenario || 'test';
      if (!['test','change','deadline'].includes(type)) throw pushError('invalid_notification');
      let saved=null;
      if(type!=='test') {
        const {results}=await env.DB.prepare(SAVED_SELECT+' WHERE sp.user_id=?1 AND sp.archived_at IS NULL ORDER BY sp.id').bind(userId).all();
        saved=type==='change' ? results.find(row=>row.change_notifications_enabled) : results.find(row=>deadlineDue(row));
        if(!saved)return reply({ok:true,state:'suppressed',reason:results.length?'preference_or_deadline':'no_saved_procedure'});
      }
      const payload={...notificationPayload(type,{title:type==='test'?'Известията на Euro-Funds работят':type==='change'?'Тест: промяна по запазена процедура':'Тест: напомняне за срок',
        body:saved?`Тест според запазените настройки: ${saved.name}`:'Това е тестово известие от Euro-Funds.',
        url:saved?'/procedures/'+(saved.public_slug || encodeURIComponent(saved.procedure_id)):'/profile'}),isTest:true,...(saved?{deadlineDate:saved.deadline_date}:{})};
      const [deliveryId]=await createNotification(env,{userId,savedId:saved?.saved_id,type,key:'test:'+uuid(),subscriptionId:sub.id,payload});
      if (!deliveryId) throw pushError('subscription_required',404);
      const state=await sendDelivery(env,deliveryId,config,{fetchImpl});
      const ok=['accepted','pending'].includes(state);
      return reply({ok,deliveryId,state,...(!ok?{error:state==='expired'?'subscription_required':'delivery_failed'}:{})},state==='accepted'?200:state==='pending'?202:502);
    }
    if (path.startsWith('delivery/') && request.method==='GET') {
      const id=path.slice('delivery/'.length);
      const row=await env.DB.prepare(`SELECT d.state,d.displayed_at,d.clicked_at,d.error_code FROM push_deliveries d
        JOIN push_notifications n ON n.id=d.notification_id WHERE d.id=?1 AND n.user_id=?2`).bind(id,userId).first();
      if (!row) throw pushError('not_found',404);
      return reply({ok:true,state:row.state,displayed:!!row.displayed_at,clicked:!!row.clicked_at,error:row.error_code});
    }
    throw pushError('not_found',404);
  } catch (error) {
    // No stack, endpoint, JWK, provider response, or subscription key is logged.
    return reply({ok:false,error:error instanceof PushError ? error.code : 'push_unavailable'},error instanceof PushError ? error.status : 503);
  }
}
