import { withLock } from './common.js';
import { stripeClient } from './stripe.js';
import { validatePrice } from './plans.js';

// A dedicated portal avoids changing settings used by another product on this account.
export async function portalConfiguration(env,stripe) {
  return withLock(env,'portal-configuration',async()=>{
    const row=await env.DB.prepare("SELECT value FROM billing_settings WHERE key='portal_configuration'").first();
    if(row)return row.value;
    const config=await stripe.billingPortal.configurations.create({
      name:'Euro-Funds Premium',business_profile:{headline:'Euro-Funds Premium'},
      default_return_url:new URL(env.APP_URL).origin+'/profile#premium',
      features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},
        subscription_cancel:{enabled:true,mode:'at_period_end',proration_behavior:'none'},subscription_update:{enabled:false}},
      metadata:{application:'euro-funds'},
    },{idempotencyKey:'euro-funds:portal-configuration:v1'});
    await env.DB.prepare("INSERT INTO billing_settings VALUES('portal_configuration',?1,?2)").bind(config.id,Date.now()).run();
    return config.id;
  });
}

export async function checkBillingConfiguration(env) {
  if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)return;
  const checked=await env.DB.prepare("SELECT updated_at FROM billing_settings WHERE key='configuration_health'").first();
  if(checked?.updated_at>Date.now()-3600000)return;
  const result={prices:false,portal:false};
  try {
    const stripe=stripeClient(env);
    const {results}=await env.DB.prepare('SELECT * FROM subscription_plans WHERE enabled=1').all();
    if(!results?.length)return;
    for(const plan of results)validatePrice(await stripe.prices.retrieve(plan.stripe_price_id),plan);
    result.prices=true;
    await portalConfiguration(env,stripe);result.portal=true;
  }catch{result.error='configuration_check_failed';}
  await env.DB.prepare("INSERT INTO billing_settings VALUES('configuration_health',?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .bind(JSON.stringify(result),Date.now()).run();
}
