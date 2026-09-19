const ZERO_DECIMAL=new Set(['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','vnd','vuv','xaf','xof','xpf']);
const THREE_DECIMAL=new Set(['bhd','jod','kwd','omr','tnd']);
export const currencyDigits=currency=>ZERO_DECIMAL.has(String(currency).toLowerCase())?0:THREE_DECIMAL.has(String(currency).toLowerCase())?3:2;
export function amountInput(amount,currency) {return Number.isSafeInteger(amount)&&currency?(amount/10**currencyDigits(currency)).toFixed(currencyDigits(currency)):'';}
export function parseAmount(value,currency) {
  const digits=currencyDigits(currency),text=String(value).trim().replace(',','.');
  if(!new RegExp('^\\d+(?:\\.\\d{1,'+Math.max(1,digits)+'})?$').test(text))return null;
  const [whole,decimal='']=text.split('.');if(decimal.length>digits)return null;
  const amount=Number(whole+decimal.padEnd(digits,'0'));
  return Number.isSafeInteger(amount)&&amount>0&&amount<=99999999?amount:null;
}
export function formatMoney(amount,currency,locale='bg-BG') {
  if(amount==null||!currency)return '—';
  try{return new Intl.NumberFormat(locale,{style:'currency',currency:String(currency).toUpperCase()}).format(amount/10**currencyDigits(currency));}catch{return '—';}
}
// Compare the same configured Premium product in the same currency, in minor
// units. Missing, ambiguous, equal, or more expensive annual prices get no badge.
export function annualSavings(plans, annual) {
  if(!/^[a-z]{3}$/i.test(annual?.currency||'')||annual?.billing_interval!=='year'||!Number.isSafeInteger(annual.amount)||annual.amount<=0)return null;
  const monthly=plans.filter(p=>p.billing_interval==='month'&&p.currency?.toLowerCase()===annual.currency?.toLowerCase()
    &&Number.isSafeInteger(p.amount)&&p.amount>0);
  if(monthly.length!==1)return null;
  const baseline=monthly[0].amount*12,saved=baseline-annual.amount;
  return Number.isSafeInteger(baseline)&&saved>0?{amount:saved,percent:saved/baseline*100,currency:annual.currency}:null;
}
export const BILLING_ERRORS={
  billing_not_configured:'Плащанията още не са конфигурирани.',plan_unavailable:'Този план временно не е достъпен.',
  subscription_exists:'Вече имате абонамент. Използвайте „Управление на абонамента“.',payment_sync_pending:'Плащането се потвърждава. Обновете статуса след малко.',
  premium_required:'Тази възможност е достъпна с Premium.',invalid_plan:'Изберете валиден план.',invalid_price:'Въведете валидна цена и валута.',
  price_mismatch:'Stripe цената не съвпада със сумата, валутата или периода.',plan_changed:'Планът е променен. Обновете и опитайте отново.',
  operation_in_progress:'Друга операция се обработва. Опитайте след малко.',rate_limited:'Твърде много опити. Изчакайте малко.',
  unauthorized:'Влезте отново в профила си.',forbidden:'Нямате достъп до този раздел.',billing_unavailable:'Операцията не е завършена. Опитайте отново.',
  customer_not_found:'Няма свързан платежен профил.',confirmation_required:'Потвърдете промяната на цената.',not_found:'Записът не е намерен.',
};
export async function billingApi(path,body,method='GET') {
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(45000)});
  const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(new Error('billing_request_failed'),{code:data.error||'billing_unavailable'});return data;
}
