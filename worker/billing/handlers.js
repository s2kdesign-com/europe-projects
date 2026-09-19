import { getSession } from '../session.js';
import { pushSameOrigin } from '../notifications/handlers.js';
import { BillingError, fail, limitAction, readBody, reply } from './common.js';
import { stripeClient, verifiedEvent } from './stripe.js';
import { publicPlans, savePlan } from './plans.js';
import { checkout, portal } from './checkout.js';
import { processEvent } from './webhook.js';
import { entitlement } from './entitlement.js';
import { adminRows, overview } from './admin.js';

export async function handleBilling(request,env,url,{sessionGetter=getSession,makeStripe=stripeClient,verify=verifiedEvent}={}) {
  const path=url.pathname,method=request.method;
  if(!path.startsWith('/api/billing/')&&!path.startsWith('/api/premium/')&&!path.startsWith('/api/admin/payments'))return null;
  try{
    if(path==='/api/billing/webhook'&&method==='POST')return reply({ok:true,...await processEvent(env,await verify(request,env),makeStripe(env))});
    if(path==='/api/billing/plans'&&method==='GET')return reply({ok:true,configured:!!(env.STRIPE_SECRET_KEY&&env.STRIPE_WEBHOOK_SECRET),plans:await publicPlans(env)});
    const session=await sessionGetter(env,request);
    if(!session?.user||!session.session)throw fail('unauthorized',401);
    const user=session.user;
    if(method!=='GET'&&!pushSameOrigin(request,env,url))throw fail('csrf',403);
    if(path.startsWith('/api/admin/payments')){
      if(user.role!=='admin')throw fail('forbidden',403);
      const route=path.slice('/api/admin/payments'.length);
      if(route==='/plans'&&method==='GET')return reply({ok:true,plans:(await env.DB.prepare('SELECT * FROM subscription_plans ORDER BY id').all()).results,
        configured:{secret:!!env.STRIPE_SECRET_KEY,webhook:!!env.STRIPE_WEBHOOK_SECRET}});
      if(route.startsWith('/plans/')&&method==='PUT'){
        await limitAction(env,user.id,'pricing',10,600000);
        return reply({ok:true,plan:await savePlan(env,user.id,decodeURIComponent(route.slice(7)),await readBody(request),makeStripe(env))});
      }
      if(route==='/overview'&&method==='GET')return reply({ok:true,...await overview(env,url)});
      if(['/subscriptions','/payments','/webhooks','/audit'].includes(route)&&method==='GET')return reply({ok:true,...await adminRows(env,route.slice(1),url)});
      throw fail('not_found',404);
    }
    if(path==='/api/billing/status'&&method==='GET'){
      const access=await entitlement(env,user.id);
      const sub=await env.DB.prepare(`SELECT s.status,s.plan_id,s.amount,s.currency,s.billing_interval,s.current_period_end,s.cancel_at_period_end,s.last_invoice_status,p.display_name
        FROM billing_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.user_id=?1
        ORDER BY CASE WHEN s.status IN ('active','trialing') THEN 0 ELSE 1 END,s.updated_at DESC LIMIT 1`).bind(user.id).first();
      const hasCustomer=!!await env.DB.prepare('SELECT 1 FROM billing_customers WHERE user_id=?1').bind(user.id).first();
      return reply({ok:true,entitlement:access,subscription:sub,canManage:hasCustomer});
    }
    if(path==='/api/billing/checkout'&&method==='POST'){
      if(!env.STRIPE_WEBHOOK_SECRET)throw fail('billing_not_configured',503);
      await limitAction(env,user.id,'checkout');return reply({ok:true,...await checkout(env,user,await readBody(request),makeStripe(env))});
    }
    if(path==='/api/billing/portal'&&method==='POST'){
      await limitAction(env,user.id,'portal');return reply({ok:true,...await portal(env,user.id,makeStripe(env))});
    }
    if(path.startsWith('/api/premium/reports')&&method==='GET'){
      if(!(await entitlement(env,user.id)).premium)throw fail('premium_required',403);
      if(path==='/api/premium/reports'){
        const before=url.searchParams.get('before');if(before&&!/^\d{4}-\d{2}-\d{2}$/.test(before))throw fail('invalid_date');
        const {results}=await env.DB.prepare(`SELECT id,report_date,generated_at,status,error_code FROM daily_ai_reports WHERE user_id=?1 AND (?2 IS NULL OR report_date<?2) ORDER BY report_date DESC LIMIT 21`).bind(user.id,before).all();
        const rows=(results||[]).slice(0,20);return reply({ok:true,reports:rows,nextBefore:results?.length>20?rows.at(-1).report_date:null});
      }
      const id=decodeURIComponent(path.slice('/api/premium/reports/'.length));
      const row=await env.DB.prepare('SELECT id,report_date,status,content,generated_at,provider_key,model_id FROM daily_ai_reports WHERE id=?1 AND user_id=?2').bind(id,user.id).first();
      if(!row)throw fail('not_found',404);
      return reply({ok:true,report:{...row,content:row.status==='ready'?JSON.parse(row.content):null}});
    }
    throw fail('not_found',404);
  }catch(error){
    return reply({ok:false,error:error instanceof BillingError?error.code:'billing_unavailable'},error instanceof BillingError?error.status:503);
  }
}
