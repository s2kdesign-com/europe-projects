import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createECDH, randomBytes, createPublicKey, verify } from 'node:crypto';
import fs from 'node:fs';
import ece from 'http_ece';
import { readVapid, validateSubscription, safeNotificationUrl, notificationPayload } from '../worker/notifications/security.js';
import { registerSubscription, createNotification, sendDelivery, scanSaved, deadlineDue, reminderDays, receiveReceipt, rateLimit, allowNotificationVolume, DAY } from '../worker/notifications/service.js';
import { scanCountries } from '../worker/notifications/public.js';
import { handleNotifications } from '../worker/notifications/handlers.js';
import { sha256hex } from '../worker/util.js';
import { createPushClient } from '../app/services/push-client.js';

// Ephemeral cryptographic fixtures. No production credentials or endpoints.
const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',vapid.privateKey);
const publicBytes=await crypto.subtle.exportKey('raw',vapid.publicKey);
const configEnv={APP_URL:'https://euro-funds.eu',WEB_PUSH_VAPID_PRIVATE_JWK:JSON.stringify(jwk),WEB_PUSH_VAPID_PUBLIC_KEY:Buffer.from(publicBytes).toString('base64url'),WEB_PUSH_VAPID_SUBJECT:'mailto:test@example.invalid'};
const config=await readVapid(configEnv);
const session={user:{id:'u1'},session:{id:'s1'}};
const other={user:{id:'u2'},session:{id:'s2'}};
function subscription(name='one') {
  const key=createECDH('prime256v1');key.generateKeys();const auth=randomBytes(16);
  return {key,auth,body:{endpoint:'https://fcm.googleapis.com/fcm/send/fixture-'+name,expirationTime:null,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:auth.toString('base64url')}}};
}
function fixture(migratePublic=true) {
  const db=new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT DEFAULT 'user');
    CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT);
    CREATE TABLE user_preferences(user_id TEXT PRIMARY KEY,change_notifications_enabled INTEGER DEFAULT 1,deadline_notifications_enabled INTEGER DEFAULT 1,email_notifications_enabled INTEGER DEFAULT 0,notification_days_before INTEGER DEFAULT 7);
    CREATE TABLE saved_procedures(id TEXT PRIMARY KEY,user_id TEXT,procedure_id TEXT,archived_at TEXT,reminder_enabled INTEGER DEFAULT 0,reminder_days_before INTEGER);
    CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,program TEXT,status TEXT,deadline_date TEXT,deadline TEXT,budget TEXT,eligible TEXT,notes TEXT,public_slug TEXT,country_code TEXT,first_seen TEXT);
    CREATE VIEW public_projects AS SELECT * FROM projects;
    INSERT INTO users(id) VALUES('u1'),('u2');
    INSERT INTO sessions VALUES('s1','u1','2099-01-01'),('s2','u2','2099-01-01'),('s3','u1','2099-01-01');
    INSERT INTO user_preferences(user_id) VALUES('u1'),('u2');
    INSERT INTO projects(id,name,status,public_slug) VALUES('p1','Saved call','open','saved-call');
    INSERT INTO saved_procedures(id,user_id,procedure_id) VALUES('saved1','u1','p1');`);
  db.exec(fs.readFileSync(new URL('../migrations/0029_web_push.sql',import.meta.url),'utf8'));
  db.exec(fs.readFileSync(new URL('../migrations/0031_premium_billing.sql',import.meta.url),'utf8'));
  db.exec(fs.readFileSync(new URL('../migrations/0035_notification_hour.sql',import.meta.url),'utf8'));
  if(migratePublic)db.exec(fs.readFileSync(new URL('../migrations/0033_public_country_push.sql',import.meta.url),'utf8'));
  const prepare=sql=>{
    let values=[];
    const stmt={bind(...v){values=v;return stmt;},async all(){const args=[];const q=sql.replace(/\?(\d+)/g,(_,i)=>{args.push(values[Number(i)-1]);return '?';});return {results:db.prepare(q).all(...args)};},async first(){return (await stmt.all()).results[0]||null;},async run(){return stmt.all();}};return stmt;
  };
  const env={...configEnv,DB:{prepare,async batch(qs){db.exec('BEGIN');try{const result=[];for(const q of qs)result.push(await q.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  return {env,db};
}
const test=async(name,fn)=>{await fn();console.log('ok - '+name);};
async function visitor(env){const response=await call(env,'visitor',{}, {who:null});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);return cookie.split(';')[0];}
const queued=(env,id,type='test',savedId=null)=>createNotification(env,{userId:'u1',type,savedId,key:crypto.randomUUID(),subscriptionId:id,payload:notificationPayload(type,{title:'Test',body:'Encrypted content',url:'/profile'})});
function call(env,path,body,{who=session,origin=configEnv.APP_URL,method='POST',cookie='',fetchImpl=async()=>new Response(null,{status:201})}={}) {
  const url=new URL('/api/notifications/'+path,configEnv.APP_URL);
  return handleNotifications(new Request(url,{method,headers:{origin,cookie,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})}),env,url,{sessionGetter:async()=>who,fetchImpl});
}
await test('VAPID validates key pairing and exposes only runtime public configuration',async()=>{
  for(const name of ['WEB_PUSH_VAPID_PRIVATE_JWK','WEB_PUSH_VAPID_PUBLIC_KEY','WEB_PUSH_VAPID_SUBJECT'])await assert.rejects(readVapid({...configEnv,[name]:''}),{code:'push_not_configured'});
  await assert.rejects(readVapid({...configEnv,WEB_PUSH_VAPID_PRIVATE_JWK:'not json'}),{code:'push_not_configured'});
  const normalized=await readVapid({...configEnv,WEB_PUSH_VAPID_PRIVATE_JWK:jwk.d});assert.equal(normalized.fingerprint,config.fingerprint);
  const different=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const otherJwk=await crypto.subtle.exportKey('jwk',different.privateKey);
  await assert.rejects(readVapid({...configEnv,WEB_PUSH_VAPID_PRIVATE_JWK:otherJwk.d}),{code:'push_not_configured'});
  const data=await (await call(configEnv,'config',null,{method:'GET',who:null})).json();
  assert.deepEqual(Object.keys(data).sort(),['configured','ok','publicKey']);assert.ok(data.configured);
  assert.ok(!JSON.stringify(data).includes(jwk.d));
});
await test('Subscription input, SSRF destinations, URL destinations and body size are bounded',async()=>{
  const {env}=fixture();const sub=subscription();
  for(const endpoint of ['https://localhost/push','https://fcm.googleapis.com.evil.test/x','http://fcm.googleapis.com/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x'])await assert.rejects(validateSubscription({...sub.body,endpoint}),{code:'invalid_subscription'});
  await assert.rejects(validateSubscription({...sub.body,keys:{...sub.body.keys,auth:'bad'}}),{code:'invalid_subscription'});
  for(const url of ['https://evil.test','//evil.test','/\\evil.test','/api/auth/logout','/admin'])assert.equal(safeNotificationUrl(url),'/profile');
  assert.equal(safeNotificationUrl('/procedures/call?x=1'),'/procedures/call?x=1');
  assert.equal(notificationPayload('test',{title:'x'.repeat(300)}).title.length,100);
  assert.equal((await call(env,'subscription',{...sub.body,padding:'x'.repeat(9000)})).status,413);
});
await test('Cookie authentication, CSRF and ownership protect registration and test endpoints',async()=>{
  const {env,db}=fixture();const sub=subscription();
  assert.equal((await call(env,'test',{}, {who:null})).status,401);
  assert.equal((await call(env,'subscription',sub.body,{origin:'https://evil.test'})).status,403);
  const first=await registerSubscription(env,session,sub.body,config);
  assert.equal((await registerSubscription(env,session,sub.body,config)).id,first.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,1);
  await assert.rejects(registerSubscription(env,other,sub.body,config),{code:'subscription_owned_elsewhere'});
  assert.equal((await call(env,'test',{subscriptionId:first.id},{who:other})).status,404);
  assert.equal((await call(env,'test',{endpoint:sub.body.endpoint})).status,400);
  assert.equal((await call(env,'test',{subscriptionId:first.id},{who:{user:session.user,session:{id:'s3'}}})).status,404);
  const a=await (await call(env,'prompt',{})).json(), b=await (await call(env,'prompt',{})).json();assert.ok(a.claimed);assert.equal(b.claimed,false);
  db.prepare('UPDATE user_preferences SET notification_prompt_last_shown_at=?').run(Date.now()-DAY-1);
  assert.ok((await (await call(env,'prompt',{})).json()).claimed);
});
await test('Actual sender encrypts/decrypts payload and signs a valid VAPID JWT; receipt is bound to session',async()=>{
  const {env,db}=fixture();const sub=subscription();const {id}=await registerSubscription(env,session,sub.body,config);
  let payload;
  const fetchImpl=async(url,options)=>{
    assert.equal(options.redirect,'manual');assert.equal(url,sub.body.endpoint);
    const authorization=new Headers(options.headers).get('authorization');const token=authorization.match(/t=([^, ]+)/)[1];
    const [header,claims,signature]=token.split('.');
    assert.ok(verify('sha256',Buffer.from(header+'.'+claims),{key:createPublicKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
    assert.equal(JSON.parse(Buffer.from(claims,'base64url')).aud,'https://fcm.googleapis.com');
    payload=JSON.parse(ece.decrypt(options.body,{version:'aes128gcm',privateKey:sub.key,authSecret:sub.auth}).toString());
    assert.equal(payload.url,'/profile');assert.ok(!JSON.stringify(payload).includes(jwk.d));
    return new Response(null,{status:201});
  };
  const sent=await call(env,'test',{subscriptionId:id},{fetchImpl});assert.equal(sent.status,200);
  const receipt={deliveryId:payload.deliveryId,token:payload.receiptToken,phase:'displayed'};
  assert.equal((await receiveReceipt(env,other,receipt)).allowed,false);
  assert.equal((await receiveReceipt(env,session,{...receipt,token:'x'.repeat(43)})).allowed,false);
  assert.equal((await receiveReceipt(env,session,receipt)).allowed,true);
  assert.ok(db.prepare('SELECT displayed_at FROM push_deliveries').get().displayed_at);
  for(let i=0;i<2;i++)assert.equal((await call(env,'test',{subscriptionId:id},{fetchImpl})).status,200);
  assert.equal((await call(env,'test',{subscriptionId:id},{fetchImpl})).status,429);
});
await test('Multiple devices receive one event each; logout and account deletion cascade',async()=>{
  const {env,db}=fixture();await registerSubscription(env,session,subscription('one').body,config);await registerSubscription(env,{user:session.user,session:{id:'s3'}},subscription('two').body,config);
  const args={userId:'u1',type:'test',key:'unique',payload:notificationPayload('test')};
  assert.equal((await createNotification(env,args)).length,2);assert.equal((await createNotification(env,args)).length,0);
  db.exec("DELETE FROM sessions WHERE id='s1'");assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,1);
  db.exec("DELETE FROM users WHERE id='u1'");assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM push_notifications').get().n,0);
});
await test('404/410 permanently remove endpoints and reject reuse; 5xx retries are bounded',async()=>{
  for(const status of [404,410]){
    const {env,db}=fixture();const sub=subscription();const {id}=await registerSubscription(env,session,sub.body,config);const [delivery]=await queued(env,id);
    assert.equal(await sendDelivery(env,delivery,config,{fetchImpl:async()=>new Response(null,{status})}),'expired');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);
    await assert.rejects(registerSubscription(env,session,sub.body,config),{code:'subscription_expired'});
  }
  const {env,db}=fixture();const {id}=await registerSubscription(env,session,subscription().body,config);const [delivery]=await queued(env,id);
  // Use change notification TTL to exercise all retries inside its validity window.
  db.prepare('UPDATE push_notifications SET expires_at=?').run(Date.now()+DAY);
  let now=Date.now();const fetchImpl=async()=>new Response(null,{status:503});
  assert.equal(await sendDelivery(env,delivery,config,{fetchImpl,now}),'pending');
  assert.equal(await sendDelivery(env,delivery,config,{fetchImpl,now}),'unavailable');
  now+=121000;assert.equal(await sendDelivery(env,delivery,config,{fetchImpl,now}),'pending');
  now+=241000;assert.equal(await sendDelivery(env,delivery,config,{fetchImpl,now}),'failed');
  assert.equal(db.prepare('SELECT attempts FROM push_deliveries').get().attempts,3);
});
await test('Changes use content snapshots, advance disabled baselines, and recheck preferences before delivery',async()=>{
  const {env,db}=fixture();const {id}=await registerSubscription(env,session,subscription().body,config);
  await scanSaved(env);assert.equal(db.prepare('SELECT COUNT(*) n FROM push_notifications').get().n,0);
  db.exec("UPDATE user_preferences SET change_notifications_enabled=0;UPDATE projects SET name='Changed while off'");await scanSaved(env);
  db.exec('UPDATE user_preferences SET change_notifications_enabled=1');await scanSaved(env);assert.equal(db.prepare('SELECT COUNT(*) n FROM push_notifications').get().n,0);
  db.exec("UPDATE projects SET budget='Updated budget'");await scanSaved(env);await scanSaved(env);assert.equal(db.prepare('SELECT COUNT(*) n FROM push_notifications').get().n,1);
  const delivery=db.prepare('SELECT id FROM push_deliveries').get().id;db.exec('UPDATE user_preferences SET change_notifications_enabled=0');
  let sends=0;assert.equal(await sendDelivery(env,delivery,config,{fetchImpl:async()=>{sends++;return new Response(null,{status:201});}}),'cancelled');assert.equal(sends,0);
  assert.equal((await (await call(env,'test',{subscriptionId:id,scenario:'change'})).json()).state,'suppressed');
  db.exec('UPDATE user_preferences SET change_notifications_enabled=1');assert.equal((await call(env,'test',{subscriptionId:id,scenario:'change'})).status,200);
});
await test('Deadline preference, calendar date, reminder override, changed deadline and deduplication are enforced',async()=>{
  const today=new Date().toISOString().slice(0,10);const future=new Date(Date.now()+8*DAY).toISOString().slice(0,10);
  const row={status:'open',deadline_date:today,deadline_notifications_enabled:1,notification_days_before:0};
  assert.ok(deadlineDue(row));assert.equal(deadlineDue({...row,deadline_notifications_enabled:0}),false);assert.equal(deadlineDue({...row,deadline_date:'2026-02-30'}),false);assert.equal(deadlineDue({...row,deadline_date:future}),false);
  assert.equal(reminderDays({...row,reminder_enabled:1,reminder_days_before:10}),10);assert.ok(deadlineDue({...row,deadline_date:future,reminder_enabled:1,reminder_days_before:10}));
  const {env,db}=fixture();const {id}=await registerSubscription(env,session,subscription().body,config);
  db.prepare('UPDATE projects SET deadline_date=?').run(future);await scanSaved(env);assert.equal(db.prepare("SELECT COUNT(*) n FROM push_notifications WHERE type='deadline'").get().n,0);
  db.exec('UPDATE user_preferences SET change_notifications_enabled=0,notification_days_before=10');await scanSaved(env);await scanSaved(env);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_notifications WHERE type='deadline'").get().n,1);
  const delivery=db.prepare("SELECT d.id FROM push_deliveries d JOIN push_notifications n ON n.id=d.notification_id WHERE type='deadline'").get().id;
  db.exec('UPDATE user_preferences SET deadline_notifications_enabled=0,email_notifications_enabled=1');assert.equal(await sendDelivery(env,delivery,config),'cancelled');
  assert.equal((await (await call(env,'test',{subscriptionId:id,scenario:'deadline'})).json()).state,'suppressed');
  db.exec('UPDATE user_preferences SET deadline_notifications_enabled=1');assert.equal((await call(env,'test',{subscriptionId:id,scenario:'deadline'})).status,200);
});
await test('Fixed-window rate limits reset; failure responses never expose input or secrets',async()=>{
  const {env}=fixture();await rateLimit(env,'u1','fixture',1,60000,1);await assert.rejects(rateLimit(env,'u1','fixture',1,60000,2),{code:'rate_limited'});await rateLimit(env,'u1','fixture',1,60000,60001);
  const response=await call({...env,DB:{prepare(){throw Error(jwk.d);}}},'prompt',{});assert.deepEqual(await response.json(),{ok:false,error:'push_unavailable'});
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await sha256hex('x'),await sha256hex('x'));
});
await test('Public migration preserves existing subscriptions, event links, delivery receipts and cascades',async()=>{
  const {db}=fixture(false);
  db.exec(`INSERT INTO push_subscriptions VALUES('preserved','u1','s1','hash','endpoint','key','auth','vapid',NULL,1,2,3);
    INSERT INTO push_notifications VALUES('event','u1','saved1','change','key','{}',1,9999999999999,NULL);
    INSERT INTO push_deliveries(id,notification_id,subscription_id,state,receipt_hash,accepted_at,displayed_at) VALUES('delivery','event','preserved','accepted','receipt',10,11);`);
  db.exec('BEGIN');db.exec(fs.readFileSync(new URL('../migrations/0033_public_country_push.sql',import.meta.url),'utf8'));db.exec('COMMIT');
  assert.equal(db.prepare('SELECT scope FROM push_subscriptions').get().scope,'authenticated');assert.equal(db.prepare('SELECT displayed_at FROM push_deliveries').get().displayed_at,11);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.exec("DELETE FROM sessions WHERE id='s1'");assert.equal(db.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,0);
});
await test('Anonymous registration assigns validated country without account and rejects privilege fields',async()=>{
  const {env,db}=fixture(),cookie=await visitor(env),sub=subscription('public');
  assert.equal((await call(env,'subscription',sub.body,{who:null,cookie})).status,400);
  for(const extra of [{countryCode:'US'},{countryCode:'BG',premium:true},{countryCode:'BG',notificationScope:'premium'},{countryCode:'BG',userId:'u2'}])assert.equal((await call(env,'subscription',{...sub.body,...extra},{who:null,cookie})).status,400);
  const result=await (await call(env,'subscription',{...sub.body,countryCode:'BG'},{who:null,cookie})).json();assert.equal(result.scope,'public_country');assert.equal(result.countryCode,'BG');
  assert.equal(db.prepare('SELECT user_id FROM push_subscriptions').get().user_id,null);assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,2);
  assert.ok(!JSON.stringify(result).includes(sub.body.keys.auth));assert.ok(!JSON.stringify(result).includes(sub.body.endpoint));
  assert.equal((await call(env,'test',{subscriptionId:result.id},{who:null,cookie})).status,401);
  assert.equal((await call(env,'visitor',{}, {who:null,origin:'https://evil.invalid'})).status,403);
});
await test('Only the owning anonymous browser can manage or promote its endpoint; promotion reuses ID and country',async()=>{
  const {env,db}=fixture(),cookie=await visitor(env),otherCookie=await visitor(env),sub=subscription('promote');
  const first=await (await call(env,'subscription',{...sub.body,countryCode:'RO'},{who:null,cookie})).json();const hash=await sha256hex(sub.body.endpoint);
  assert.equal((await (await call(env,'subscription/status',{endpointHash:hash},{who:null,cookie:otherCookie})).json()).active,false);
  await call(env,'subscription',{endpointHash:hash},{who:null,cookie:otherCookie,method:'DELETE'});assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,1);
  assert.equal((await call(env,'subscription',sub.body,{who:other,cookie:otherCookie})).status,409);
  const linked=await (await call(env,'subscription',sub.body,{cookie})).json();assert.equal(linked.id,first.id);assert.equal(linked.scope,'authenticated');assert.equal(linked.premium,false);
  const row=db.prepare('SELECT user_id,country_code,scope,anonymous_token_hash FROM push_subscriptions').get();assert.deepEqual({...row},{user_id:'u1',country_code:'RO',scope:'authenticated',anonymous_token_hash:null});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,1);assert.equal((await (await call(env,'subscription/status',{endpointHash:hash},{who:null,cookie})).json()).active,false);
});
await test('Country summary uses canonical counts, no private content, bounded daily dedupe and existing sender',async()=>{
  const {env,db}=fixture(),cookie=await visitor(env),sub=subscription('summary');
  await call(env,'subscription',{...sub.body,countryCode:'BG'},{who:null,cookie});
  const now=Math.floor(Date.now()/DAY)*DAY+3*DAY+9*3600000,day=new Date(now-DAY).toISOString().slice(0,10);
  db.prepare("UPDATE projects SET country_code='BG',first_seen=?").run(day);
  db.prepare("INSERT INTO projects(id,name,status,country_code,first_seen) VALUES('p2','Private-looking title never in public push','closed','BG',?),('p3','Existing','open','BG','2000-01-01')").run(day);
  await scanCountries(env,now);await scanCountries(env,now);const event=db.prepare("SELECT * FROM push_notifications WHERE type='country'").get(),payload=JSON.parse(event.payload);
  assert.equal(event.user_id,null);assert.equal(payload.url,'/procedures/countries/bg');assert.match(payload.body,/2 новооткрити/);assert.match(payload.body,/Отворени в момента: 2/);assert.ok(!event.payload.includes('Private-looking'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,1);const delivery=db.prepare('SELECT id FROM push_deliveries').get().id;
  assert.equal(await sendDelivery(env,delivery,config,{now,fetchImpl:async()=>new Response(null,{status:201})}),'accepted');
  const token=randomBytes(32).toString('base64url');db.prepare('UPDATE push_deliveries SET receipt_hash=?').run(await sha256hex(token));
  // Receipt expiry is checked against the real wall clock; the fixture is in the future.
  assert.equal((await (await call(env,'receipt',{deliveryId:delivery,token,phase:'displayed'},{who:null,cookie})).json()).allowed,true);
  await call(env,'subscription',sub.body,{cookie});assert.equal((await (await call(env,'receipt',{deliveryId:delivery,token,phase:'received'},{who:null,cookie})).json()).allowed,false);
});
await test('No empty country digest or pre-consent backlog; country changes cancel queued summaries',async()=>{
  const {env,db}=fixture(),cookie=await visitor(env),sub=subscription('country-change');await call(env,'subscription',{...sub.body,countryCode:'BG'},{who:null,cookie});
  const now=Math.floor(Date.now()/DAY)*DAY+3*DAY+9*3600000;await scanCountries(env,now);assert.equal(db.prepare('SELECT COUNT(*) n FROM push_notifications').get().n,0);
  db.prepare("UPDATE projects SET country_code='BG',first_seen=?").run(new Date(now).toISOString().slice(0,10));await scanCountries(env,now+DAY);const delivery=db.prepare('SELECT id FROM push_deliveries').get().id;
  await call(env,'subscription',{...sub.body,countryCode:'RO'},{who:null,cookie});assert.equal(await sendDelivery(env,delivery,config,{now:now+DAY}),'cancelled');
  db.prepare("UPDATE projects SET country_code='RO',first_seen=?").run(new Date(now+DAY).toISOString().slice(0,10));db.prepare('UPDATE push_subscriptions SET created_at=?').run(now+2*DAY);
  await scanCountries(env,now+2*DAY);assert.equal(db.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,1);
});
await test('Premium daily limit is enforced across devices and retries without affecting free preferences',async()=>{
  const {env,db}=fixture();await registerSubscription(env,session,subscription('volume').body,config);
  db.exec("UPDATE users SET role='premium' WHERE id='u1'; UPDATE user_preferences SET premium_notification_daily_limit=1 WHERE user_id='u1';");
  const a=await createNotification(env,{userId:'u1',type:'change',savedId:'saved1',key:'volume-a',payload:{title:'A'}});
  const b=await createNotification(env,{userId:'u1',type:'change',savedId:'saved1',key:'volume-b',payload:{title:'B'}});
  const rows=db.prepare('SELECT id AS notification_id,user_id,type,payload FROM push_notifications ORDER BY dedupe_key').all();
  assert.equal(await allowNotificationVolume(env,rows[0]),true);assert.equal(await allowNotificationVolume(env,rows[0]),true);assert.equal(await allowNotificationVolume(env,rows[1]),false);
  assert.equal(await sendDelivery(env,b[0],config,{fetchImpl:async()=>{throw Error('must not send');}}),'pending');assert.equal(db.prepare('SELECT attempts FROM push_deliveries WHERE id=?').get(b[0]).attempts,0);
  db.exec("UPDATE users SET role='user' WHERE id='u1'");assert.equal(await allowNotificationVolume(env,rows[1]),true);
  assert.equal(await sendDelivery(env,a[0],config,{fetchImpl:async()=>new Response(null,{status:201})}),'accepted');
});
await test('Client-to-API flow enables anonymously, then reuses the browser subscription after existing login',async()=>{
  const {env,db}=fixture(),generated=subscription('client-flow');let cookie='',who=null,sub=null,subscribeCalls=0,permissionCalls=0;const storage=new Map(),sequence=[];
  const win={isSecureContext:true,Notification:{permission:'default',async requestPermission(){permissionCalls++;sequence.push('permission');this.permission='granted';return 'granted';}},PushManager:{},crypto,
    location:{origin:configEnv.APP_URL},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},navigator:{serviceWorker:{async getRegistration(){return reg;}}}};
  const reg={active:{scriptURL:configEnv.APP_URL+'/sw.js'},pushManager:{async getSubscription(){return sub;},async subscribe(options){subscribeCalls++;sub={endpoint:generated.body.endpoint,options,toJSON:()=>generated.body,async unsubscribe(){sub=null;}};return sub;}}};
  const client=createPushClient(win,async(path,options)=>{
    sequence.push(path);const result=await call(env,path.slice('/api/notifications/'.length),options.body?JSON.parse(options.body):undefined,{who,cookie,method:options.method});
    if(result.headers.has('set-cookie'))cookie=result.headers.get('set-cookie').split(';')[0];return result;
  });
  assert.equal((await client.enable(null,'BG')).status,'enabled');assert.equal(sequence[0],'permission');assert.equal(subscribeCalls,1);
  const before=db.prepare('SELECT id FROM push_subscriptions').get().id;
  assert.equal((await client.refresh(null,{countryCode:'BG'})).scope,'public_country');
  who=session;const linked=await client.refresh('u1',{countryCode:'BG'});assert.equal(linked.status,'enabled');assert.equal(linked.scope,'authenticated');assert.equal(linked.id,before);
  assert.equal(subscribeCalls,1);assert.equal(permissionCalls,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,1);
  assert.equal((await client.refresh('u1')).status,'enabled');
});
await test('Anonymous service-worker rotation preserves chosen country and removes only its replaced endpoint',async()=>{
  const {env,db}=fixture(),cookie=await visitor(env),original=subscription('rotate-old'),replacement=subscription('rotate-new');
  await call(env,'subscription',{...original.body,countryCode:'FR'},{who:null,cookie});
  const response=await call(env,'subscription',{...replacement.body,replacesEndpointHash:await sha256hex(original.body.endpoint)},{who:null,cookie});
  assert.equal(response.status,200);assert.equal((await response.json()).countryCode,'FR');assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,1);
  assert.equal(db.prepare('SELECT endpoint_hash FROM push_subscriptions').get().endpoint_hash,await sha256hex(replacement.body.endpoint));
});
