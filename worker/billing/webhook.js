import { fail, stripeId, withLock } from './common.js';

export const BILLING_EVENTS=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed',
  'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_succeeded','invoice.payment_failed'];
const seconds=value=>Number.isFinite(value)?value*1000:null;
const reference=value=>typeof value==='string'?value:value?.id;
function invoiceSubscription(invoice) { return reference(invoice.parent?.subscription_details?.subscription)||reference(invoice.subscription); }

async function invoiceStatement(env,invoice,sub,userId) {
  if(reference(invoice.customer)!==sub.stripe_customer_id||invoiceSubscription(invoice)!==sub.id)throw fail('customer_ownership');
  // Invoice lines carry the original price, including after an administrator edits a plan.
  const line=(invoice.lines?.data||[]).find(l=>reference(l.pricing?.price_details?.price)||reference(l.price));
  const priceId=reference(line?.pricing?.price_details?.price)||reference(line?.price)||sub.stripe_price_id;
  const price=await env.DB.prepare('SELECT * FROM stripe_prices WHERE id=?1').bind(priceId).first();
  if(!price)throw fail('unknown_price');
  const payment=invoice.payments?.data?.find(p=>p.status==='paid')||invoice.payments?.data?.[0];
  const paymentIntent=reference(payment?.payment?.payment_intent)||reference(invoice.payment_intent)||null;
  const paid=invoice.status==='paid';
  const status=paid?'paid':invoice.status==='void'?'void':invoice.status==='uncollectible'?'uncollectible':invoice.attempted?'failed':invoice.status||'open';
  if(!Number.isSafeInteger(invoice.amount_due)||!Number.isSafeInteger(invoice.amount_paid))throw fail('invalid_invoice');
  return env.DB.prepare(`INSERT INTO billing_payments VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
    ON CONFLICT(stripe_invoice_id) DO UPDATE SET status=excluded.status,amount_paid=excluded.amount_paid,
    stripe_payment_intent_id=COALESCE(excluded.stripe_payment_intent_id,billing_payments.stripe_payment_intent_id),
    stripe_payment_id=COALESCE(excluded.stripe_payment_id,billing_payments.stripe_payment_id),updated_at=excluded.updated_at`)
    .bind(stripeId(invoice.id,'in'),userId,sub.stripe_customer_id,sub.id,paymentIntent,reference(payment)||null,priceId,price.plan_id,price.billing_interval,
      invoice.amount_due,invoice.amount_paid,invoice.currency,status,seconds(invoice.created)||Date.now(),Date.now());
}

export async function syncSubscription(env,stripe,subscriptionId,{invoice=null,expectedCustomer=null}={}) {
  return withLock(env,'subscription:'+stripeId(subscriptionId,'sub'),async()=>{
    // Fetch the current Stripe resource under the subscription lock. Event arrival
    // order must never resurrect an already-cancelled subscription.
    const live=await stripe.subscriptions.retrieve(subscriptionId,{expand:['latest_invoice']});
    const customerId=stripeId(live.customer,'cus');
    if(expectedCustomer&&expectedCustomer!==customerId)throw fail('customer_ownership');
    const customer=await env.DB.prepare('SELECT user_id FROM billing_customers WHERE stripe_customer_id=?1').bind(customerId).first();
    if(!customer)throw fail('unknown_customer');
    if(live.metadata?.euro_funds_user_id&&customer.user_id&&live.metadata.euro_funds_user_id!==customer.user_id)throw fail('customer_ownership');
    if(live.items?.data?.length!==1||live.items.data[0].quantity!==1)throw fail('unsupported_subscription');
    const item=live.items.data[0],priceId=stripeId(item.price,'price');
    const price=await env.DB.prepare('SELECT * FROM stripe_prices WHERE id=?1').bind(priceId).first();
    if(!price)throw fail('unknown_price');
    const start=seconds(item.current_period_start??live.current_period_start),end=seconds(item.current_period_end??live.current_period_end);
    if(!start||!end||end<=start)throw fail('invalid_subscription_period');
    let latest=live.latest_invoice;
    if(typeof latest==='string')latest=await stripe.invoices.retrieve(latest);
    if(latest&&(reference(latest.customer)!==customerId||invoiceSubscription(latest)!==live.id))throw fail('customer_ownership');
    const row={id:live.id,user_id:customer.user_id,stripe_customer_id:customerId,stripe_price_id:priceId,plan_id:price.plan_id};
    const paidThrough=latest?.status==='paid'?end:0;
    const writes=[env.DB.prepare(`INSERT INTO billing_subscriptions VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
      ON CONFLICT(id) DO UPDATE SET stripe_price_id=excluded.stripe_price_id,plan_id=excluded.plan_id,status=excluded.status,
      amount=excluded.amount,currency=excluded.currency,billing_interval=excluded.billing_interval,
      current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
      paid_through=MAX(billing_subscriptions.paid_through,excluded.paid_through),trial_end=excluded.trial_end,
      cancel_at_period_end=excluded.cancel_at_period_end,cancelled_at=excluded.cancelled_at,last_invoice_status=excluded.last_invoice_status,updated_at=excluded.updated_at`)
      .bind(row.id,row.user_id,customerId,priceId,price.plan_id,live.status,price.amount,price.currency,price.billing_interval,
        seconds(live.start_date??live.created)||start,start,end,paidThrough,seconds(live.trial_end),live.cancel_at_period_end?1:0,seconds(live.canceled_at),latest?.status||null,Date.now())];
    if(invoice){const current=await stripe.invoices.retrieve(stripeId(invoice,'in'),{expand:['payments']});writes.push(await invoiceStatement(env,current,row,customer.user_id));}
    else if(latest)writes.push(await invoiceStatement(env,latest,row,customer.user_id));
    await env.DB.batch(writes);
    return row;
  });
}

export async function processEvent(env,event,stripe) {
  const id=stripeId(event.id,'evt'),now=Date.now(),token=crypto.randomUUID();
  await env.DB.prepare('INSERT OR IGNORE INTO stripe_webhook_events(id,event_type,event_created,received_at) VALUES(?1,?2,?3,?4)').bind(id,event.type,seconds(event.created)||now,now).run();
  const existing=await env.DB.prepare('SELECT status FROM stripe_webhook_events WHERE id=?1').bind(id).first();
  if(['processed','ignored'].includes(existing?.status))return {duplicate:true};
  const claimed=await env.DB.prepare(`UPDATE stripe_webhook_events SET status='processing',attempts=attempts+1,lease_token=?2,lease_until=?3,error_code=NULL
    WHERE id=?1 AND status NOT IN ('processed','ignored') AND lease_until<=?4 RETURNING id`).bind(id,token,now+300000,now).first();
  if(!claimed)throw fail('event_in_progress',503);
  try{
    if(!BILLING_EVENTS.includes(event.type)){
      await env.DB.prepare("UPDATE stripe_webhook_events SET status='ignored',processed_at=?2,lease_until=0 WHERE id=?1 AND lease_token=?3").bind(id,Date.now(),token).run();return {ignored:true};
    }
    const object=event.data?.object;
    let subscriptionId,invoice=null;
    if(event.type.startsWith('customer.subscription.'))subscriptionId=object.id;
    else if(event.type.startsWith('invoice.')){subscriptionId=invoiceSubscription(object);invoice=object.id;}
    else subscriptionId=reference(object.subscription);
    if(subscriptionId){
      const customerId=stripeId(object.customer,'cus');
      // Other products in the same Stripe account must not grant Euro-Funds access.
      const known=await env.DB.prepare('SELECT stripe_customer_id FROM billing_customers WHERE stripe_customer_id=?1').bind(customerId).first();
      if(known)await syncSubscription(env,stripe,subscriptionId,{invoice,expectedCustomer:customerId});
    }
    await env.DB.prepare("UPDATE stripe_webhook_events SET status='processed',processed_at=?2,lease_until=0,error_code=NULL WHERE id=?1 AND lease_token=?3").bind(id,Date.now(),token).run();
    return {processed:true};
  }catch(error){
    const code=['unknown_price','unknown_customer','customer_ownership','invalid_subscription_period','unsupported_subscription','operation_in_progress'].includes(error?.code)?error.code:'stripe_sync_failed';
    await env.DB.prepare("UPDATE stripe_webhook_events SET status='failed',error_code=?2,lease_until=0 WHERE id=?1 AND lease_token=?3").bind(id,code,token).run();
    // Never persist webhook payloads, billing details or SDK exception messages.
    throw fail('webhook_retry',503);
  }
}
