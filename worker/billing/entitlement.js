// Existing premium/admin roles are explicit manual grants; billing never rewrites roles.
export const paidAccessSql = (alias='s',now='?1') => `(${alias}.status='trialing' AND ${alias}.trial_end>${now} OR ${alias}.status='active' AND ${alias}.paid_through>${now}) AND ${alias}.current_period_end>${now}`;
export const PAID_ACCESS_SQL = paidAccessSql();
export async function entitlement(env,userId,now=Date.now()) {
  const user=await env.DB.prepare('SELECT role FROM users WHERE id=?1').bind(userId).first();
  if(!user)return {premium:false,source:null};
  const manual=['premium','admin'].includes(user.role);
  const paid=await env.DB.prepare(`SELECT id FROM billing_subscriptions s WHERE s.user_id=?2 AND ${PAID_ACCESS_SQL} LIMIT 1`).bind(now,userId).first();
  return {premium:manual||!!paid,source:manual?'administrator':paid?'subscription':null};
}
