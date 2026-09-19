import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createECDH, randomBytes, createPublicKey, verify } from 'node:crypto';
import fs from 'node:fs';
import ece from 'http_ece';
import { readVapid, validateSubscription, safeNotificationUrl, notificationPayload } from '../worker/notifications/security.js';
import { registerSubscription, createNotification, sendDelivery, scanSaved, deadlineDue, reminderDays, receiveReceipt, rateLimit, DAY } from '../worker/notifications/service.js';
import { handleNotifications } from '../worker/notifications/handlers.js';
import { sha256hex } from '../worker/util.js';

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
function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY);
    CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT);
    CREATE TABLE user_preferences(user_id TEXT PRIMARY KEY,change_notifications_enabled INTEGER DEFAULT 1,deadline_notifications_enabled INTEGER DEFAULT 1,email_notifications_enabled INTEGER DEFAULT 0,notification_days_before INTEGER DEFAULT 7);
    CREATE TABLE saved_procedures(id TEXT PRIMARY KEY,user_id TEXT,procedure_id TEXT,archived_at TEXT,reminder_enabled INTEGER DEFAULT 0,reminder_days_before INTEGER);
    CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,program TEXT,status TEXT,deadline_date TEXT,deadline TEXT,budget TEXT,eligible TEXT,notes TEXT,public_slug TEXT);
    CREATE VIEW public_projects AS SELECT * FROM projects;
    INSERT INTO users VALUES('u1'),('u2');
    INSERT INTO sessions VALUES('s1','u1','2099-01-01'),('s2','u2','2099-01-01'),('s3','u1','2099-01-01');
    INSERT INTO user_preferences(user_id) VALUES('u1'),('u2');
    INSERT INTO projects(id,name,status,public_slug) VALUES('p1','Saved call','open','saved-call');
    INSERT INTO saved_procedures(id,user_id,procedure_id) VALUES('saved1','u1','p1');`);
  db.exec(fs.readFileSync(new URL('../migrations/0029_web_push.sql',import.meta.url),'utf8'));
  const prepare=sql=>{
    let values=[];
    const stmt={bind(...v){values=v;return stmt;},async all(){const args=[];const q=sql.replace(/\?(\d+)/g,(_,i)=>{args.push(values[Number(i)-1]);return '?';});return {results:db.prepare(q).all(...args)};},async first(){return (await stmt.all()).results[0]||null;},async run(){return stmt.all();}};return stmt;
  };
  const env={...configEnv,DB:{prepare,async batch(qs){db.exec('BEGIN');try{const result=[];for(const q of qs)result.push(await q.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  return {env,db};
}
const test=async(name,fn)=>{await fn();console.log('ok - '+name);};
const queued=(env,id,type='test',savedId=null)=>createNotification(env,{userId:'u1',type,savedId,key:crypto.randomUUID(),subscriptionId:id,payload:notificationPayload(type,{title:'Test',body:'Encrypted content',url:'/profile'})});
function call(env,path,body,{who=session,origin=configEnv.APP_URL,method='POST',fetchImpl=async()=>new Response(null,{status:201})}={}) {
  const url=new URL('/api/notifications/'+path,configEnv.APP_URL);
  return handleNotifications(new Request(url,{method,headers:{origin,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})}),env,url,{sessionGetter:async()=>who,fetchImpl});
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
