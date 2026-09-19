import { json, uuid } from '../util.js';

export class BillingError extends Error {
  constructor(code,status=400) { super(code); this.code=code; this.status=status; }
}
export const fail=(code,status)=>new BillingError(code,status);
export const reply=(value,status=200)=>json(value,status,{'cache-control':'no-store','x-content-type-options':'nosniff'});
export async function readBody(request,limit=8192,raw=false) {
  if (!raw && !/^application\/json\b/i.test(request.headers.get('content-type')||'')) throw fail('invalid_body');
  const reader=request.body?.getReader(); if(!reader)throw fail('invalid_body');
  const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw fail('body_too_large',413);}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  const text=new TextDecoder().decode(buffer);
  if(raw)return text;
  try{const data=JSON.parse(text);if(!data||Array.isArray(data)||typeof data!=='object')throw Error();return data;}catch{throw fail('invalid_body');}
}
export function onlyFields(body,allowed) { if(Object.keys(body).some(key=>!allowed.includes(key)))throw fail('unexpected_field'); }
export async function limitAction(env,userId,action,max=5,interval=60000) {
  const window=Math.floor(Date.now()/interval)*interval;
  const row=await env.DB.prepare(`INSERT INTO billing_rate_limits VALUES(?1,?2,?3,1) ON CONFLICT(user_id,action)
    DO UPDATE SET window_start=excluded.window_start,attempts=CASE WHEN billing_rate_limits.window_start=excluded.window_start
    THEN billing_rate_limits.attempts+1 ELSE 1 END RETURNING attempts`).bind(userId,action,window).first();
  if(!row||row.attempts>max)throw fail('rate_limited',429);
}
export async function withLock(env,id,work) {
  const token=uuid(),now=Date.now();
  const row=await env.DB.prepare(`INSERT INTO billing_locks VALUES(?1,?2,?3) ON CONFLICT(id)
    DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE billing_locks.expires_at<=?4 RETURNING token`)
    .bind(id,token,now+300000,now).first();
  if(!row)throw fail('operation_in_progress',409);
  try{return await work(token);}finally{await env.DB.prepare('DELETE FROM billing_locks WHERE id=?1 AND token=?2').bind(id,token).run();}
}
export function stripeId(value,prefix) {
  const id=typeof value==='string'?value:value?.id;
  if(typeof id!=='string'||!new RegExp('^'+prefix+'_[A-Za-z0-9_]+$').test(id))throw fail('invalid_stripe_reference');
  return id;
}
export function safeStripeUrl(value,portal=false) {
  try{const url=new URL(value);if(url.protocol==='https:'&&url.hostname===(portal?'billing.stripe.com':'checkout.stripe.com')&&!url.username&&!url.password)return url.href;}catch{}
  throw fail('stripe_unavailable',502);
}
export async function audit(env,admin,action,target,before,after) {
  await env.DB.prepare('INSERT INTO billing_audit VALUES(?1,?2,?3,?4,?5,?6,?7)')
    .bind(uuid(),admin,action,target,before?JSON.stringify(before):null,after?JSON.stringify(after):null,Date.now()).run();
}
