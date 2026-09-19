import Stripe from 'stripe';
import { fail } from './common.js';

export const STRIPE_API_VERSION='2026-08-26.dahlia';
export function stripeClient(env) {
  if(!env.STRIPE_SECRET_KEY)throw fail('billing_not_configured',503);
  return new Stripe(env.STRIPE_SECRET_KEY,{apiVersion:STRIPE_API_VERSION,httpClient:Stripe.createFetchHttpClient(),
    maxNetworkRetries:1,timeout:15000,appInfo:{name:'Euro-Funds',version:'2.57.0',url:env.APP_URL}});
}
export async function verifiedEvent(request,env) {
  if(!env.STRIPE_WEBHOOK_SECRET)throw fail('billing_not_configured',503);
  const {readBody}=await import('./common.js');
  const raw=await readBody(request,1048576,true);
  try{return await stripeClient(env).webhooks.constructEventAsync(raw,request.headers.get('stripe-signature')||'',env.STRIPE_WEBHOOK_SECRET,300,Stripe.createSubtleCryptoProvider());}
  catch{throw fail('invalid_signature',400);}
}
