import { fail } from './common.js';

function filters(url,alias,{subscription=false,webhook=false}={}) {
  const clauses=[],values=[];
  const add=(sql,value)=>{values.push(value);clauses.push(sql.replaceAll('?',`?${values.length}`));};
  for(const [key,operator,extra] of [['from','>=',0],['to','<',86400000]]){
    const value=url.searchParams.get(key);if(!value)continue;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw fail('invalid_date');
    add(`${alias}.${webhook?'received_at':subscription?'started_at':'created_at'}${operator}?`,Date.parse(value)+extra);
  }
  for(const key of ['status',...(webhook?[]:['plan','interval'])]){
    const value=url.searchParams.get(key);if(value)add(`${alias}.${key==='plan'?'plan_id':key==='interval'?'billing_interval':key}=?`,value.slice(0,80));
  }
  const query=url.searchParams.get('q');if(query&&!webhook)add("(u.email LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')",'%'+query.slice(0,120).replace(/[\\%_]/g,'\\$&')+'%');
  // Both search predicates intentionally use the same parameter.
  return {where:clauses.length?' WHERE '+clauses.join(' AND '):'',values};
}
export async function adminRows(env,kind,url) {
  const tables={payments:'billing_payments',subscriptions:'billing_subscriptions',webhooks:'stripe_webhook_events',audit:'billing_audit'};
  const table=tables[kind];if(!table)throw fail('not_found',404);
  const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||25)),page=Math.max(1,Math.min(100000,Number(url.searchParams.get('page'))||1));
  if(!Number.isInteger(limit)||!Number.isInteger(page))throw fail('invalid_page');
  const webhook=['webhooks','audit'].includes(kind);
  const {where,values}=kind==='audit'?{where:'',values:[]}:filters(url,'b',{subscription:kind==='subscriptions',webhook});
  const join=webhook?'': ' LEFT JOIN users u ON u.id=b.user_id';
  const columns=kind==='webhooks'?'b.id,b.event_type,b.event_created,b.status,b.received_at,b.processed_at,b.error_code,b.attempts':webhook?'b.*':'b.*,u.email,u.display_name';
  const order=kind==='webhooks'?'received_at':kind==='subscriptions'?'started_at':'created_at';
  const count=await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} b${join}${where}`).bind(...values).first();
  const {results}=await env.DB.prepare(`SELECT ${columns} FROM ${table} b${join}${where} ORDER BY b.${order} DESC,b.${kind==='payments'?'stripe_invoice_id':'id'} DESC LIMIT ?${values.length+1} OFFSET ?${values.length+2}`)
    .bind(...values,limit,(page-1)*limit).all();
  return {rows:results||[],total:count.total,page,limit};
}
export async function overview(env,url) {
  const {where,values}=filters(url,'b');
  const paymentStats=await env.DB.prepare(`SELECT COUNT(*) total,SUM(b.status='paid') successful,SUM(b.status='failed') failed FROM billing_payments b LEFT JOIN users u ON u.id=b.user_id${where}`).bind(...values).first();
  const {results:revenue}=await env.DB.prepare(`SELECT b.currency,SUM(CASE WHEN b.status='paid' THEN b.amount_paid ELSE 0 END) paid,
    SUM(CASE WHEN b.status='paid' AND b.billing_interval='year' THEN b.amount_paid ELSE 0 END) annual_paid
    FROM billing_payments b LEFT JOIN users u ON u.id=b.user_id${where} GROUP BY b.currency`).bind(...values).all();
  const subscriptions=await env.DB.prepare("SELECT SUM(status IN ('active','trialing')) active,SUM(status='canceled') cancelled FROM billing_subscriptions").first();
  const {results:recurring}=await env.DB.prepare(`SELECT currency,SUM(CASE WHEN billing_interval='year' THEN amount/12.0 ELSE amount END) monthly_equivalent
    FROM billing_subscriptions WHERE status='active' AND paid_through>?1 AND current_period_end>?1 GROUP BY currency`).bind(Date.now()).all();
  return {payments:paymentStats,subscriptions,revenue:revenue||[],recurring:recurring||[],revenueBasis:'gross_paid_invoices_before_refunds_tax_and_fees'};
}
