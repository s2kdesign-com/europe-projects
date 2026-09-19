import { fail, onlyFields, safeStripeUrl, stripeId, withLock } from './common.js';
import { validatePrice } from './plans.js';

async function customer(env,user,stripe) {
  const existing=await env.DB.prepare('SELECT stripe_customer_id FROM billing_customers WHERE user_id=?1').bind(user.id).first();
  if(existing){const found=await stripe.customers.retrieve(existing.stripe_customer_id);if(found.deleted||found.metadata?.euro_funds_user_id!==user.id)throw fail('customer_ownership',409);return found.id;}
  const found=await stripe.customers.create({email:user.email,metadata:{euro_funds_user_id:user.id,application:'euro-funds'}},{idempotencyKey:'euro-funds:customer:'+user.id});
  await env.DB.prepare('INSERT INTO billing_customers VALUES(?1,?2,?3)').bind(stripeId(found.id,'cus'),user.id,Date.now()).run();
  return found.id;
}
export async function checkout(env,user,body,stripe) {
  onlyFields(body,['planId']);
  if(!['monthly','annual'].includes(body.planId))throw fail('invalid_plan');
  return withLock(env,'checkout:'+user.id,async()=>{
    const plan=await env.DB.prepare('SELECT * FROM subscription_plans WHERE id=?1 AND enabled=1').bind(body.planId).first();
    if(!plan?.stripe_price_id)throw fail('plan_unavailable',409);
    if(await env.DB.prepare("SELECT id FROM billing_subscriptions WHERE user_id=?1 AND status NOT IN ('canceled','incomplete_expired') LIMIT 1").bind(user.id).first())throw fail('subscription_exists',409);
    validatePrice(await stripe.prices.retrieve(plan.stripe_price_id),plan);
    const customerId=await customer(env,user,stripe);
    const old=await env.DB.prepare('SELECT * FROM billing_checkout_sessions WHERE user_id=?1').bind(user.id).first();
    if(old&&old.expires_at>Date.now()){
      const prior=await stripe.checkout.sessions.retrieve(old.stripe_session_id);
      if(stripeId(prior.customer,'cus')!==customerId)throw fail('customer_ownership',409);
      if(prior.status==='complete')throw fail('payment_sync_pending',409);
      if(prior.status==='open'&&old.stripe_price_id===plan.stripe_price_id)return {url:safeStripeUrl(prior.url)};
      if(prior.status==='open')await stripe.checkout.sessions.expire(prior.id);
    }
    const origin=new URL(env.APP_URL).origin;
    const session=await stripe.checkout.sessions.create({mode:'subscription',customer:customerId,
      line_items:[{price:plan.stripe_price_id,quantity:1}],client_reference_id:user.id,
      subscription_data:{metadata:{euro_funds_user_id:user.id,plan_id:plan.id}},metadata:{application:'euro-funds',plan_id:plan.id},
      success_url:origin+'/profile?checkout=success#premium',cancel_url:origin+'/profile?checkout=cancelled#premium',
      integration_identifier:'euro-funds-premium-kqnmvtaz',expires_at:Math.floor(Date.now()/1800000)*1800+7200},
      {idempotencyKey:`euro-funds:checkout:${user.id}:${plan.stripe_price_id}:${old?.stripe_session_id||'first'}:${Math.floor(Date.now()/1800000)}`});
    const url=safeStripeUrl(session.url);
    await env.DB.prepare(`INSERT INTO billing_checkout_sessions VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(user_id) DO UPDATE SET plan_id=excluded.plan_id,stripe_price_id=excluded.stripe_price_id,stripe_session_id=excluded.stripe_session_id,expires_at=excluded.expires_at,created_at=excluded.created_at`)
      .bind(user.id,plan.id,plan.stripe_price_id,stripeId(session.id,'cs'),session.expires_at*1000,Date.now()).run();
    return {url};
  });
}
export async function portal(env,userId,stripe) {
  const row=await env.DB.prepare('SELECT stripe_customer_id FROM billing_customers WHERE user_id=?1').bind(userId).first();
  if(!row)throw fail('customer_not_found',404);
  const customer=await stripe.customers.retrieve(row.stripe_customer_id);
  if(customer.deleted||customer.metadata?.euro_funds_user_id!==userId)throw fail('customer_ownership',409);
  const configuration=await portalConfiguration(env,stripe);
  const session=await stripe.billingPortal.sessions.create({configuration,customer:row.stripe_customer_id,return_url:new URL(env.APP_URL).origin+'/profile#premium'});
  return {url:safeStripeUrl(session.url,true)};
}
import { portalConfiguration } from './configuration.js';
