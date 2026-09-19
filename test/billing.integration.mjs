import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { handleBilling } from '../worker/billing/handlers.js';
import { savePlan } from '../worker/billing/plans.js';
import { checkout, portal } from '../worker/billing/checkout.js';
import { entitlement } from '../worker/billing/entitlement.js';
import { processEvent } from '../worker/billing/webhook.js';
import { verifiedEvent } from '../worker/billing/stripe.js';
import { generateReport, notifyReport, reportDate, validateReport, runDailyReports } from '../worker/billing/reports.js';
import { adminRows, overview } from '../worker/billing/admin.js';
import { receiveReceipt, sendDelivery } from '../worker/notifications/service.js';
import { sha256hex } from '../worker/util.js';
import { parseAmount, formatMoney } from '../app/lib/billing.js';
import { listUsers, putPreferences, deleteAccount, setUserRole } from '../worker/db.js';

const now=Date.now(),epoch=Math.floor(now/1000),later=epoch+864000;
const migration=name=>fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;');
  db.exec(migration('0002_auth.sql'));db.exec(migration('0003_admin.sql'));db.exec(migration('0029_web_push.sql'));db.exec(migration('0031_premium_billing.sql'));db.exec(migration('0033_public_country_push.sql'));db.exec(migration('0035_notification_hour.sql'));
  db.exec(`ALTER TABLE user_profiles ADD COLUMN preferred_country TEXT;
    CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,program TEXT,status TEXT,deadline_date TEXT,budget TEXT,eligible TEXT,notes TEXT,public_slug TEXT,last_updated TEXT,country_code TEXT);
    CREATE VIEW public_projects AS SELECT * FROM projects;
    INSERT INTO users(id,email,role,created_at,updated_at) VALUES('free','free@example.invalid','user','2026-01-01','2026-01-01'),('manual','manual@example.invalid','premium','2026-01-01','2026-01-01'),('admin','admin@example.invalid','admin','2026-01-01','2026-01-01'),('other','other@example.invalid','user','2026-01-01','2026-01-01');
    INSERT INTO user_preferences(user_id,created_at,updated_at) SELECT id,'2026-01-01','2026-01-01' FROM users;
    INSERT INTO user_profiles(user_id,preferred_country,primary_sector,preferred_programs,organization_type,created_at,updated_at) SELECT id,'BG','technology','["Research"]','sme','2026-01-01','2026-01-01' FROM users;
    INSERT INTO sessions(id,user_id,session_token_hash,expires_at,created_at) SELECT 'session-'||id,id,'hash-'||id,'2099-01-01','2026-01-01' FROM users;
    INSERT INTO projects VALUES('call1','Factual opportunity','Research','open','2099-01-01','Source amount','SMEs',NULL,'factual-opportunity','2026-09-19','BG');
    INSERT INTO saved_procedures(id,user_id,procedure_id,saved_at,last_updated_at_save) VALUES('save1','manual','call1','2026-01-01','2026-01-01');`);
  const prepare=sql=>{let values=[];const q={bind(...v){values=v;return q;},async all(){const args=[];const query=sql.replace(/\?(\d+)/g,(_,i)=>{args.push(values[Number(i)-1]);return '?';});return {results:db.prepare(query).all(...args)};},async first(){return (await q.all()).results[0]||null;},async run(){return q.all();}};return q;};
  const env={APP_URL:'https://euro-funds.eu',STRIPE_SECRET_KEY:'unit-test-placeholder',STRIPE_WEBHOOK_SECRET:randomBytes(32).toString('hex'),DB:{prepare,async batch(queries){db.exec('BEGIN');try{const out=[];for(const q of queries)out.push(await q.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  return {db,env};
}
const user=id=>({id,email:id+'@example.invalid',role:id==='manual'?'premium':id==='admin'?'admin':'user'});
const session=id=>({user:user(id),session:{id:'session-'+id}});
function fakeStripe(){
  let number=0;const prices=new Map(),customers=new Map(),sessions=new Map();const calls=[];
  const api={calls,pricesMap:prices,customersMap:customers,live:null,invoice:null,
    products:{async create(body){calls.push(['product',body]);return {id:'prod_fixture',active:true};},async retrieve(){return {id:'prod_fixture',active:true};}},
    prices:{async create(body){const p={...body,id:'price_fixture'+(++number),active:true,type:'recurring',billing_scheme:'per_unit',recurring:{...body.recurring,interval_count:1,usage_type:'licensed'}};prices.set(p.id,p);calls.push(['price',body]);return p;},async retrieve(id){if(!prices.has(id))throw Error('missing price');return prices.get(id);},async update(id,b){Object.assign(prices.get(id),b);return prices.get(id);}},
    customers:{async create(body){const c={...body,id:'cus_'+body.metadata.euro_funds_user_id};customers.set(c.id,c);calls.push(['customer',body]);return c;},async retrieve(id){return customers.get(id);}},
    checkout:{sessions:{async create(body){calls.push(['checkout',body]);const s={...body,id:'cs_test_'+(++number),status:'open',url:'https://checkout.stripe.com/c/pay/fixture',expires_at:later};sessions.set(s.id,s);return s;},async retrieve(id){return sessions.get(id);},async expire(id){sessions.get(id).status='expired';}}},
    billingPortal:{configurations:{async create(){return {id:'bpc_fixture'};}},sessions:{async create(body){calls.push(['portal',body]);return {url:'https://billing.stripe.com/p/session/fixture'};}}},
    subscriptions:{async retrieve(){calls.push(['retrieve_subscription']);return structuredClone(api.live);}},
    invoices:{async retrieve(){return structuredClone(api.invoice);}},
  };return api;
}
async function configure(env,stripe,id='monthly',amount=1234){return savePlan(env,'admin',id,{displayName:id,description:'Fixture plan',amount,currency:'eur',billingInterval:id==='monthly'?'month':'year',enabled:true,confirmed:true,revision:0},stripe);}
function call(env,stripe,path,{id='free',body,method=body?'POST':'GET',origin=env.APP_URL}={}){
  const url=new URL(path,env.APP_URL);return handleBilling(new Request(url,{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,url,{sessionGetter:async()=>id?session(id):null,makeStripe:()=>stripe});
}
async function subscribed(f,stripe){
  const plan=await configure(f.env,stripe);await checkout(f.env,user('free'),{planId:'monthly'},stripe);
  stripe.invoice={id:'in_fixture',customer:'cus_free',parent:{subscription_details:{subscription:'sub_fixture'}},status:'paid',amount_due:1234,amount_paid:1234,currency:'eur',created:epoch,attempted:true,lines:{data:[{pricing:{price_details:{price:plan.stripe_price_id}}}]},payments:{data:[{id:'inpay_fixture',status:'paid',payment:{payment_intent:'pi_fixture'}}]}};
  stripe.live={id:'sub_fixture',customer:'cus_free',metadata:{euro_funds_user_id:'free'},status:'active',start_date:epoch,cancel_at_period_end:false,items:{data:[{price:plan.stripe_price_id,quantity:1,current_period_start:epoch,current_period_end:later}]},latest_invoice:stripe.invoice};
  return plan;
}
const event=(type='customer.subscription.updated',id='evt_fixture')=>({id,type,created:epoch,data:{object:type.startsWith('invoice.')?{id:'in_fixture',customer:'cus_free',parent:{subscription_details:{subscription:'sub_fixture'}}}:{id:'sub_fixture',customer:'cus_free',subscription:'sub_fixture'}}});
const test=async(name,work)=>{await work();console.log('ok - '+name);};

await test('Migrations retain manual Premium; only administrators access payment data and mutations',async()=>{
  const {env}=fixture(),stripe=fakeStripe();assert.equal((await entitlement(env,'manual')).source,'administrator');assert.equal((await entitlement(env,'free')).premium,false);
  for(const id of ['free','manual'])for(const path of ['/api/admin/payments/plans','/api/admin/payments/payments','/api/admin/payments/subscriptions','/api/admin/payments/webhooks','/api/admin/payments/audit','/api/admin/payments/overview'])assert.equal((await call(env,stripe,path,{id})).status,403);
  assert.equal((await call(env,stripe,'/api/admin/payments/plans',{id:'admin'})).status,200);
  assert.equal((await call(env,stripe,'/api/admin/payments/plans/monthly',{id:'manual',method:'PUT',body:{}})).status,403);
  assert.equal((await call(env,stripe,'/api/billing/status',{id:null})).status,401);
  assert.equal((await call(env,stripe,'/api/billing/checkout',{body:{planId:'monthly'},origin:'https://attacker.invalid'})).status,403);
});
await test('Dynamic plans have no seeded prices; both intervals use server prices and reject client amounts',async()=>{
  const {env,db}=fixture(),stripe=fakeStripe();assert.equal((await (await call(env,stripe,'/api/billing/plans')).json()).plans.length,0);
  for(const id of ['monthly','annual'])await configure(env,stripe,id,id==='monthly'?1234:12345);
  const plans=(await (await call(env,stripe,'/api/billing/plans')).json()).plans;assert.equal(plans.length,2);assert.ok(plans.every(p=>!('stripe_price_id' in p)));
  for(const planId of ['monthly','annual']){await checkout(env,user(planId==='monthly'?'free':'other'),{planId},stripe);const request=stripe.calls.filter(c=>c[0]==='checkout').at(-1)[1];assert.equal(request.line_items[0].price,db.prepare('SELECT stripe_price_id FROM subscription_plans WHERE id=?').get(planId).stripe_price_id);assert.equal(request.mode,'subscription');assert.ok(!('payment_method_types'in request));}
  for(const body of [{planId:'monthly',amount:1},{planId:'monthly',stripePriceId:'price_bad'},{planId:'invalid'}])await assert.rejects(checkout(env,user('free'),body,stripe));
  db.exec("UPDATE subscription_plans SET enabled=0 WHERE id='monthly'");await assert.rejects(checkout(env,user('manual'),{planId:'monthly'},stripe),{code:'plan_unavailable'});
});
await test('Price revisions preserve historical records, require confirmation and reject stale edits',async()=>{
  const f=fixture(),stripe=fakeStripe();const original=await subscribed(f,stripe);await processEvent(f.env,event(),stripe);
  const body={displayName:'New label',description:'Updated',amount:2345,currency:'eur',billingInterval:'month',enabled:true,confirmed:true,revision:1};
  await assert.rejects(savePlan(f.env,'admin','monthly',{...body,confirmed:false},stripe),{code:'confirmation_required'});
  const next=await savePlan(f.env,'admin','monthly',body,stripe);assert.notEqual(next.stripe_price_id,original.stripe_price_id);
  assert.equal(f.db.prepare('SELECT amount FROM billing_payments').get().amount,1234);assert.equal(f.db.prepare('SELECT amount FROM billing_subscriptions').get().amount,1234);
  assert.equal(f.db.prepare('SELECT active FROM stripe_prices WHERE id=?').get(original.stripe_price_id).active,0);
  await assert.rejects(savePlan(f.env,'admin','monthly',body,stripe),{code:'plan_changed'});assert.equal(f.db.prepare('SELECT COUNT(*) n FROM billing_audit').get().n,2);
});
await test('Checkout reuse and customer portal are owner-bound; redirect never grants access',async()=>{
  const f=fixture(),stripe=fakeStripe();await configure(f.env,stripe);await checkout(f.env,user('free'),{planId:'monthly'},stripe);await checkout(f.env,user('free'),{planId:'monthly'},stripe);
  assert.equal(stripe.calls.filter(c=>c[0]==='checkout').length,1);assert.equal((await entitlement(f.env,'free')).premium,false);
  assert.ok((await portal(f.env,'free',stripe)).url.startsWith('https://billing.stripe.com/'));
  await assert.rejects(portal(f.env,'other',stripe),{code:'customer_not_found'});
  stripe.customersMap.get('cus_free').metadata.euro_funds_user_id='other';await assert.rejects(portal(f.env,'free',stripe),{code:'customer_ownership'});
});
await test('Webhook signatures use raw bytes and timestamp tolerance; SDK errors are never returned',async()=>{
  const {env}=fixture(),raw=JSON.stringify(event());const timestamp=Math.floor(Date.now()/1000),signature=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex');
  const request=payload=>new Request(env.APP_URL+'/api/billing/webhook',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${signature}`},body:payload});
  assert.equal((await verifiedEvent(request(raw),env)).id,'evt_fixture');await assert.rejects(verifiedEvent(request(raw+' '),env),{code:'invalid_signature'});
  const stale=timestamp-1000,staleSignature=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(stale+'.'+raw).digest('hex');
  await assert.rejects(verifiedEvent(new Request(env.APP_URL,{method:'POST',headers:{'stripe-signature':`t=${stale},v1=${staleSignature}`},body:raw}),env),{code:'invalid_signature'});
});
await test('Subscription events are idempotent and out-of-order events cannot restore cancelled access',async()=>{
  const f=fixture(),stripe=fakeStripe();await subscribed(f,stripe);
  await processEvent(f.env,event(),stripe);assert.equal((await entitlement(f.env,'free')).premium,true);
  const count=stripe.calls.length;assert.ok((await processEvent(f.env,event(),stripe)).duplicate);assert.equal(stripe.calls.length,count);
  stripe.live.status='canceled';stripe.live.canceled_at=epoch;await processEvent(f.env,event('customer.subscription.deleted','evt_cancelled'),stripe);
  assert.equal((await entitlement(f.env,'free')).premium,false);await processEvent(f.env,event('customer.subscription.created','evt_old'),stripe);assert.equal((await entitlement(f.env,'free')).premium,false);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM billing_payments').get().n,1);assert.equal((await entitlement(f.env,'manual')).premium,true);
});
await test('Unpaid active and past-due subscriptions fail closed; trials and period-end cancellation are bounded',async()=>{
  const f=fixture(),stripe=fakeStripe();await subscribed(f,stripe);stripe.live.latest_invoice.status='open';stripe.live.latest_invoice.amount_paid=0;
  await processEvent(f.env,event(),stripe);assert.equal((await entitlement(f.env,'free')).premium,false);
  stripe.live.status='trialing';stripe.live.trial_end=later;await processEvent(f.env,event(undefined,'evt_trial'),stripe);assert.equal((await entitlement(f.env,'free')).premium,true);
  assert.equal((await entitlement(f.env,'free',(later+1)*1000)).premium,false);
  stripe.live.status='active';stripe.live.latest_invoice.status='paid';stripe.live.cancel_at_period_end=true;await processEvent(f.env,event(undefined,'evt_paid'),stripe);assert.equal((await entitlement(f.env,'free')).premium,true);
  stripe.live.status='past_due';stripe.invoice.status='open';stripe.invoice.amount_paid=0;await processEvent(f.env,event('invoice.payment_failed','evt_failed'),stripe);
  assert.equal((await entitlement(f.env,'free')).premium,false);assert.equal(f.db.prepare('SELECT status FROM billing_payments').get().status,'failed');
});
await test('Failed webhook processing can retry without duplicate payments or exposing payload data',async()=>{
  const f=fixture(),stripe=fakeStripe();await subscribed(f,stripe);const original=stripe.subscriptions.retrieve;stripe.subscriptions.retrieve=async()=>{throw Error(f.env.STRIPE_WEBHOOK_SECRET);};
  await assert.rejects(processEvent(f.env,event(),stripe),{code:'webhook_retry'});assert.equal(f.db.prepare('SELECT error_code FROM stripe_webhook_events').get().error_code,'stripe_sync_failed');
  stripe.subscriptions.retrieve=original;await processEvent(f.env,event(),stripe);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM billing_payments').get().n,1);
});
await test('Admin filters and currency-separated totals are bounded and use paid amounts',async()=>{
  const f=fixture(),stripe=fakeStripe();await subscribed(f,stripe);await processEvent(f.env,event(),stripe);
  const result=await adminRows(f.env,'payments',new URL(f.env.APP_URL+'/?q=free@example.invalid&status=paid&plan=monthly&interval=month&limit=1'));
  assert.equal(result.total,1);assert.equal(result.rows.length,1);assert.equal((await adminRows(f.env,'payments',new URL(f.env.APP_URL+'/?q=%'))).total,0);
  const stats=await overview(f.env,new URL(f.env.APP_URL));assert.equal(stats.revenue[0].paid,1234);assert.equal(stats.recurring[0].monthly_equivalent,1234);
  await assert.rejects(adminRows(f.env,'payments',new URL(f.env.APP_URL+'/?from=invalid')),{code:'invalid_date'});
  const users=await listUsers(f.env);assert.equal(users.find(u=>u.id==='free').premium_source,'subscription');
});
await test('Daily reports are generated once, store source facts, and are protected by entitlement and ownership',async()=>{
  const f=fixture(),stripe=fakeStripe(),day=reportDate(now),id='report-fixture';
  f.db.prepare('INSERT INTO daily_ai_reports(id,user_id,report_date,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'manual',day,'Europe/Sofia',now,now);
  let calls=0;const generate=async(env,args)=>{calls++;assert.equal(args.purpose,'recommendation');assert.ok(!args.prompt.includes('manual@example.invalid'));return {text:JSON.stringify({summary:'Summary from supplied data',recommendations:[{procedureId:'call1',reason:'Matched profile',action:'Read official conditions'}]}),config:{provider_key:'fixture',model_id:'fixture'}};};
  await Promise.all([generateReport(f.env,id,{generate}),generateReport(f.env,id,{generate})]);assert.equal(calls,1);
  const stored=f.db.prepare('SELECT * FROM daily_ai_reports').get();assert.equal(stored.status,'ready');assert.equal(JSON.parse(stored.content).recommendations[0].budget,'Source amount');
  assert.equal((await call(f.env,stripe,'/api/premium/reports/'+id,{id:'free'})).status,403);
  assert.equal((await call(f.env,stripe,'/api/premium/reports/'+id,{id:'admin'})).status,404);
  assert.equal((await call(f.env,stripe,'/api/premium/reports/'+id,{id:'manual'})).status,200);
  assert.throws(()=>f.db.prepare('INSERT INTO daily_ai_reports(id,user_id,report_date,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('duplicate','manual',day,'Europe/Sofia',now,now));
  assert.throws(()=>validateReport('{"summary":"x","recommendations":[{"procedureId":"invented","reason":"x","action":"x"}]}',[],{}));
});
await test('Report failures retry safely; revocation during generation prevents publication',async()=>{
  const f=fixture(),id='report-failed';f.db.prepare('INSERT INTO daily_ai_reports(id,user_id,report_date,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'manual',reportDate(now),'Europe/Sofia',now,now);
  await generateReport(f.env,id,{generate:async()=>{throw Error('provider fixture failure');}});assert.equal(f.db.prepare('SELECT status FROM daily_ai_reports').get().status,'failed');
  f.db.exec('UPDATE daily_ai_reports SET next_attempt_at=0');await generateReport(f.env,id,{generate:async()=>{f.db.exec("UPDATE users SET role='user' WHERE id='manual'");return {text:'{"summary":"test","recommendations":[]}',config:{}};}});
  assert.equal(f.db.prepare('SELECT status FROM daily_ai_reports').get().status,'cancelled');assert.equal(f.db.prepare('SELECT content FROM daily_ai_reports').get().content,null);
});
await test('Premium report notifications respect current entitlement, preferences and receipt ownership',async()=>{
  const f=fixture(),id='report-notify';f.db.exec('UPDATE user_preferences SET daily_notification_hour=0');f.db.prepare('INSERT INTO daily_ai_reports(id,user_id,report_date,timezone,status,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,'manual',reportDate(now),'Europe/Sofia','ready','{}',now,now);
  f.db.prepare('INSERT INTO push_subscriptions(id,user_id,session_id,endpoint_hash,endpoint,p256dh,auth,vapid_fingerprint,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('sub-push','manual','session-manual','fixturehash','https://fcm.googleapis.com/fcm/send/fixture','fixture','fixture','fixture',now,now);
  await notifyReport(f.env,{id,user_id:'manual'});await notifyReport(f.env,{id,user_id:'manual'});assert.equal(f.db.prepare('SELECT COUNT(*) n FROM push_notifications').get().n,1);
  const delivery=f.db.prepare('SELECT id FROM push_deliveries').get().id,token=randomBytes(32).toString('base64url');f.db.prepare('UPDATE push_deliveries SET receipt_hash=?').run(await sha256hex(token));
  const body={deliveryId:delivery,token,phase:'received'};assert.equal((await receiveReceipt(f.env,session('manual'),body)).allowed,true);assert.equal((await receiveReceipt(f.env,session('admin'),body)).allowed,false);
  f.db.exec('UPDATE user_preferences SET daily_report_notifications_enabled=0');assert.equal((await receiveReceipt(f.env,session('manual'),body)).allowed,false);
  f.db.exec("UPDATE user_preferences SET daily_report_notifications_enabled=1; UPDATE users SET role='user' WHERE id='manual'");assert.equal((await receiveReceipt(f.env,session('manual'),body)).allowed,false);
});
await test('Existing preference saves preserve report settings; manual roles audit separately from paid access',async()=>{
  const f=fixture();f.db.exec("UPDATE user_preferences SET daily_report_notifications_enabled=0 WHERE user_id='manual'");
  await putPreferences(f.env,'manual',{change_notifications_enabled:true,deadline_notifications_enabled:true,notification_days_before:7});assert.equal(f.db.prepare("SELECT daily_report_notifications_enabled FROM user_preferences WHERE user_id='manual'").get().daily_report_notifications_enabled,0);
  await setUserRole(f.env,'free','premium','admin');assert.equal((await entitlement(f.env,'free')).source,'administrator');assert.equal(f.db.prepare('SELECT action FROM billing_audit').get().action,'manual_role_updated');
});
await test('Financial records survive cancellation and account deletion without continuing hidden billing',async()=>{
  const f=fixture(),stripe=fakeStripe();await subscribed(f,stripe);await processEvent(f.env,event(),stripe);
  assert.equal((await deleteAccount(f.env,'free')).error,'cancel_subscription_before_deleting');
  stripe.live.status='canceled';await processEvent(f.env,event(undefined,'evt_delete'),stripe);assert.ok((await deleteAccount(f.env,'free')).ok);
  assert.equal(f.db.prepare('SELECT user_id FROM billing_payments').get().user_id,null);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM billing_payments').get().n,1);
});
await test('Minor units and timezone boundaries are deterministic; rate limits reject repeated checkout attempts',async()=>{
  assert.equal(parseAmount('12.34','eur'),1234);assert.equal(parseAmount('12.345','eur'),null);assert.equal(parseAmount('12','jpy'),12);assert.equal(parseAmount('1.234','kwd'),1234);assert.equal(parseAmount('-2','eur'),null);assert.equal(formatMoney(null,null),'—');
  assert.equal(reportDate(Date.parse('2026-09-19T22:30:00Z'),'Europe/Sofia'),'2026-09-20');
  const f=fixture(),stripe=fakeStripe();for(let i=0;i<5;i++)await call(f.env,stripe,'/api/billing/checkout',{body:{planId:'invalid'}});
  assert.equal((await call(f.env,stripe,'/api/billing/checkout',{body:{planId:'invalid'}})).status,429);
});

await test('Notification hour migration defaults existing users, validates writes and preserves omitted preferences',async()=>{
  const {db,env}=fixture();const hour=()=>db.prepare("SELECT daily_notification_hour FROM user_preferences WHERE user_id='manual'").get().daily_notification_hour;
  assert.equal(hour(),10);
  await putPreferences(env,'manual',{daily_notification_hour:0});assert.equal(hour(),0);
  await putPreferences(env,'manual',{change_notifications_enabled:true});assert.equal(hour(),0);
  for(const invalid of [-1,24,1.5,'10',null]){assert.equal((await putPreferences(env,'manual',{daily_notification_hour:invalid})).status,400);assert.equal(hour(),0);}
  await putPreferences(env,'manual',{daily_notification_hour:23});assert.equal(hour(),23);
});
await test('Daily report scheduler uses each funding country day and saved hour, and retry is idempotent',async()=>{
  const {db,env}=fixture();const at=Date.parse('2026-07-01T07:00:00Z');
  db.exec("UPDATE user_profiles SET preferred_country='PT' WHERE user_id='admin'");
  const generated=[];const generate=async(_env,id)=>{generated.push(id);db.prepare("UPDATE daily_ai_reports SET status='ready',content='{}' WHERE id=?").run(id);};
  await runDailyReports(env,{now:at,generate});await runDailyReports(env,{now:at,generate});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM daily_ai_reports').get().n,2);
  const reports=db.prepare('SELECT * FROM daily_ai_reports ORDER BY user_id').all();
  assert.equal(reports.find(r=>r.user_id==='manual').timezone,'Europe/Sofia');
  assert.equal(reports.find(r=>r.user_id==='admin').timezone,'Europe/Lisbon');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_notifications WHERE user_id='manual'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_notifications WHERE user_id='admin'").get().n,0);
  await runDailyReports(env,{now:Date.parse('2026-07-01T09:00:00Z'),generate});
  await runDailyReports(env,{now:Date.parse('2026-07-01T09:02:00Z'),generate});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_notifications WHERE user_id='admin'").get().n,1);
  assert.equal(generated.length,2);
  db.exec("UPDATE user_preferences SET daily_notification_hour=13 WHERE user_id='manual'");
  await runDailyReports(env,{now:Date.parse('2026-07-02T09:00Z'),generate});
  await runDailyReports(env,{now:Date.parse('2026-07-02T09:02Z'),generate});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_notifications WHERE user_id='manual'").get().n,1);
  await runDailyReports(env,{now:Date.parse('2026-07-02T10:00Z'),generate});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_notifications WHERE user_id='manual'").get().n,2);
});
await test('Country local dates can differ within the same scheduler tick',async()=>{
  const {db,env}=fixture();db.exec("UPDATE user_profiles SET preferred_country='PT' WHERE user_id='admin'");
  await runDailyReports(env,{now:Date.parse('2026-07-01T22:30Z'),generate:async()=>{}});
  assert.equal(db.prepare("SELECT report_date FROM daily_ai_reports WHERE user_id='manual'").get().report_date,'2026-07-02');
  assert.equal(db.prepare("SELECT report_date FROM daily_ai_reports WHERE user_id='admin'").get().report_date,'2026-07-01');
});

await test('Queued report delivery rechecks a changed hour without consuming retries or contacting the provider',async()=>{
  const {db,env}=fixture(),at=Date.parse('2026-07-01T09:00Z');
  db.prepare("INSERT INTO daily_ai_reports(id,user_id,report_date,timezone,status,content,created_at,updated_at) VALUES('timed','manual','2026-07-01','Europe/Sofia','ready','{}',?,?)").run(at,at);
  db.prepare("INSERT INTO push_subscriptions(id,user_id,session_id,endpoint_hash,endpoint,p256dh,auth,vapid_fingerprint,created_at,updated_at) VALUES('timed-sub','manual','session-manual','hash','https://fcm.googleapis.com/fcm/send/fixture','fixture','fixture','fixture',?,?)").run(at,at);
  await notifyReport(env,{id:'timed',user_id:'manual'},at);
  db.exec("UPDATE user_preferences SET daily_notification_hour=13 WHERE user_id='manual'");
  const id=db.prepare('SELECT id FROM push_deliveries').get().id;
  db.prepare("INSERT INTO push_notifications(id,user_id,type,dedupe_key,payload,created_at,expires_at) VALUES('unrelated-event','manual','test','unrelated','{}',?,?)").run(at,at+300000);
  db.exec("INSERT INTO push_deliveries(id,notification_id,subscription_id,state,attempts) VALUES('unrelated','unrelated-event','timed-sub','accepted',1)");
  const state=await sendDelivery(env,id,{fingerprint:'fixture'},{now:at,fetchImpl:()=>{throw Error('must not send before local hour');}});
  assert.equal(state,'pending');const row=db.prepare('SELECT attempts,next_attempt_at FROM push_deliveries WHERE id=?').get(id);assert.equal(row.attempts,0);assert.ok(row.next_attempt_at>at);
  assert.deepEqual({...db.prepare("SELECT state,attempts,next_attempt_at FROM push_deliveries WHERE id='unrelated'").get()},{state:'accepted',attempts:1,next_attempt_at:0});
});
