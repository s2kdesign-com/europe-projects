import { audit, fail, onlyFields, stripeId, withLock } from './common.js';

export async function publicPlans(env) {
  const {results}=await env.DB.prepare(`SELECT id,display_name,description,billing_interval,amount,currency
    FROM subscription_plans WHERE enabled=1 AND stripe_price_id IS NOT NULL AND amount>0 ORDER BY billing_interval`).all();
  return results||[];
}
export function validatePrice(price,plan) {
  if(!price.active||price.type!=='recurring'||price.billing_scheme!=='per_unit'||price.recurring?.usage_type!=='licensed'||
    price.recurring?.interval!==plan.billing_interval||price.recurring?.interval_count!==1||price.transform_quantity||
    !Number.isSafeInteger(price.unit_amount)||price.unit_amount<=0||price.currency!==plan.currency||price.unit_amount!==plan.amount)
    throw fail('price_mismatch');
  return stripeId(price.product,'prod');
}
export async function savePlan(env,admin,id,body,stripe) {
  onlyFields(body,['displayName','description','amount','currency','enabled','billingInterval','stripePriceId','stripeProductId','revision','confirmed']);
  if(!['monthly','annual'].includes(id))throw fail('invalid_plan');
  if(!Number.isInteger(body.revision)||typeof body.enabled!=='boolean'||body.confirmed!==true)throw fail('confirmation_required');
  return withLock(env,'plan:'+id,async()=>{
    const previous=await env.DB.prepare('SELECT * FROM subscription_plans WHERE id=?1').bind(id).first();
    if(!previous||previous.revision!==body.revision)throw fail('plan_changed',409);
    const next={...previous,display_name:String(body.displayName||'').trim().slice(0,100),description:String(body.description||'').trim().slice(0,500),
      enabled:body.enabled?1:0,amount:body.amount??previous.amount,currency:body.currency?String(body.currency).toLowerCase():previous.currency,billing_interval:body.billingInterval};
    if(!next.display_name||next.billing_interval!==(id==='monthly'?'month':'year'))throw fail('invalid_plan');
    const configured=next.amount!==null||next.currency!==null||body.stripePriceId;
    const disablingCurrent=!next.enabled&&previous.stripe_price_id&&previous.amount===next.amount&&previous.currency===next.currency&&!body.stripePriceId;
    if((next.enabled||configured)&&!disablingCurrent){
      if(!Number.isSafeInteger(next.amount)||next.amount<=0||next.amount>99999999||!/^[a-z]{3}$/.test(next.currency||''))throw fail('invalid_price');
      try{new Intl.NumberFormat('en',{style:'currency',currency:next.currency});}catch{throw fail('invalid_currency');}
      let price;
      if(body.stripePriceId)price=await stripe.prices.retrieve(stripeId(body.stripePriceId,'price'));
      else if(previous.stripe_price_id&&previous.amount===next.amount&&previous.currency===next.currency)price=await stripe.prices.retrieve(previous.stripe_price_id);
      else{
        let product=body.stripeProductId||previous.stripe_product_id;
        if(!product){const existing=await env.DB.prepare('SELECT stripe_product_id FROM subscription_plans WHERE stripe_product_id IS NOT NULL LIMIT 1').first();product=existing?.stripe_product_id;}
        if(product){const found=await stripe.products.retrieve(stripeId(product,'prod'));if(found.deleted||!found.active)throw fail('invalid_product');}
        else product=(await stripe.products.create({name:'Euro-Funds Premium',metadata:{application:'euro-funds'}},{idempotencyKey:'euro-funds:premium-product:v1'})).id;
        price=await stripe.prices.create({product,currency:next.currency,unit_amount:next.amount,recurring:{interval:next.billing_interval},metadata:{application:'euro-funds',plan_id:id}},
          {idempotencyKey:`euro-funds:price:${id}:${previous.revision+1}:${next.currency}:${next.amount}`});
      }
      next.stripe_product_id=validatePrice(price,next);next.stripe_price_id=stripeId(price.id,'price');
      const used=await env.DB.prepare('SELECT * FROM stripe_prices WHERE id=?1').bind(price.id).first();
      if(used&&(used.plan_id!==id||used.amount!==next.amount||used.currency!==next.currency))throw fail('price_already_assigned',409);
    }else if(next.enabled)throw fail('price_required');
    const now=Date.now();
    const statements=[];
    if(next.stripe_price_id){
      statements.push(env.DB.prepare('UPDATE stripe_prices SET active=0 WHERE plan_id=?1').bind(id));
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO stripe_prices VALUES(?1,?2,?3,?4,?5,?6,1,?7)').bind(next.stripe_price_id,id,next.stripe_product_id,next.amount,next.currency,next.billing_interval,now));
      statements.push(env.DB.prepare('UPDATE stripe_prices SET active=?2 WHERE id=?1').bind(next.stripe_price_id,next.enabled));
    }
    statements.push(env.DB.prepare(`UPDATE subscription_plans SET display_name=?2,description=?3,enabled=?4,amount=?5,currency=?6,stripe_price_id=?7,stripe_product_id=?8,revision=revision+1,updated_at=?9 WHERE id=?1 AND revision=?10`)
      .bind(id,next.display_name,next.description,next.enabled,next.amount,next.currency,next.stripe_price_id,next.stripe_product_id,now,previous.revision));
    // The audit record and plan update are committed in one D1 transaction.
    statements.push(env.DB.prepare('INSERT INTO billing_audit VALUES(?1,?2,?3,?4,?5,?6,?7)').bind(crypto.randomUUID(),admin,'plan_updated',id,JSON.stringify(previous),JSON.stringify({...next,revision:previous.revision+1}),now));
    await env.DB.batch(statements);
    if(previous.stripe_price_id&&previous.stripe_price_id!==next.stripe_price_id){
      try{await stripe.prices.update(previous.stripe_price_id,{active:false});}
      catch{await audit(env,admin,'stripe_price_archive_pending',previous.stripe_price_id,null,null);}
    }
    return env.DB.prepare('SELECT * FROM subscription_plans WHERE id=?1').bind(id).first();
  });
}
