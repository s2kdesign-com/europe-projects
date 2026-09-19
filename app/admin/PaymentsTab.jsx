"use client";
import { useCallback, useEffect, useState } from 'react';
import { amountInput, billingApi, BILLING_ERRORS, formatMoney, parseAmount } from '../lib/billing.js';
import { useUiTranslate } from '../lib/i18n/ui-translate.js';

const LABELS=['Плащания','Абонаментни планове','Месечен','Годишен','Име','Описание','Цена','Валута','Активен','Период','Месец','Година','Запази','Текущ Stripe Price','Stripe Product','Използвай съществуващ Stripe Price (по избор)',
  'Съществуващите абонати запазват текущата си цена. Новата цена важи за бъдещи абонаменти и може да създаде нов Stripe Price. Историческите плащания не се променят. Продължавате ли?',
  'Планът е запазен.','От дата','До дата','Статус','План','Потребител / имейл','Приложи','Всички','Плащания общо','Успешни плащания','Неуспешни плащания','Активни абонаменти','Отменени абонаменти','Приходи за периода','Годишни абонаменти за периода','Месечен еквивалент на активните абонаменти',
  'Брутно платени фактури преди възстановявания, данъци и такси. Валутите не се събират.','Абонаменти','Webhook журнал','Одит на промените','Предишна','Следваща','Няма записи.','Зареждане…','Създаден','Обновен','Конфигурация','Край на периода',...Object.values(BILLING_ERRORS)];
const KINDS={payments:'Плащания',subscriptions:'Абонаменти',webhooks:'Webhook журнал',audit:'Одит на промените'};
const date=value=>value?new Date(value).toLocaleString('bg-BG'):'—';
const COLUMNS={
  payments:[['created_at','Дата'],['display_name','Потребител'],['email','Имейл'],['amount','Дължимо'],['amount_paid','Платено'],['currency','Валута'],['status','Статус'],['plan_id','План'],['billing_interval','Период'],['stripe_payment_id','Stripe Payment'],['stripe_payment_intent_id','Stripe Payment Intent'],['stripe_invoice_id','Stripe Invoice'],['stripe_customer_id','Stripe Customer']],
  subscriptions:[['display_name','Потребител'],['email','Имейл'],['plan_id','План'],['status','Статус'],['amount','Цена'],['currency','Валута'],['billing_interval','Период'],['stripe_customer_id','Stripe Customer'],['id','Stripe Subscription'],['started_at','Начало'],['current_period_end','Край на периода'],['cancelled_at','Отменен'],['updated_at','Обновен']],
  webhooks:[['received_at','Получен'],['id','Stripe Event'],['event_type','Тип'],['status','Статус'],['attempts','Опити'],['error_code','Грешка'],['processed_at','Обработен']],
  audit:[['created_at','Дата'],['admin_user_id','Администратор'],['action','Действие'],['target_id','Обект'],['previous_json','Преди'],['next_json','След']],
};
export default function PaymentsTab() {
  const tl=useUiTranslate([...LABELS,...Object.values(COLUMNS).flat().map(x=>x[1])]);
  const [plans,setPlans]=useState([]),[stats,setStats]=useState(null),[config,setConfig]=useState(null),[kind,setKind]=useState('payments');
  const [data,setData]=useState({rows:[],total:0,page:1,limit:25}),[page,setPage]=useState(1),[filters,setFilters]=useState({from:'',to:'',status:'',plan:'',interval:'',q:''}),[applied,setApplied]=useState({});
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState(null);
  const load=useCallback(async()=>{
    setBusy(true);setError(null);
    try{
      const query=new URLSearchParams(Object.entries(applied).filter(([,value])=>value));query.set('page',page);
      const dates=new URLSearchParams(Object.entries(applied).filter(([key,value])=>['from','to'].includes(key)&&value));
      const [p,s,list]=await Promise.all([billingApi('/api/admin/payments/plans'),billingApi('/api/admin/payments/overview?'+dates),billingApi('/api/admin/payments/'+kind+'?'+query)]);
      setPlans(p.plans);setConfig(p.configured);setStats(s);setData(list);
    }catch(e){setError(e.code||'billing_unavailable');}finally{setBusy(false);}
  },[applied,kind,page]);
  useEffect(()=>{load();},[load]);
  const changeKind=value=>{setKind(value);setPage(1);setApplied(old=>({...old,status:''}));setFilters(old=>({...old,status:''}));};
  return <div className="payments-admin" aria-busy={busy}>
    <section className="prof-card"><h2 className="prof-section-title">{tl('Абонаментни планове')}</h2>
      {config&&<p className="chart-note">{tl('Конфигурация')}: Stripe {config.secret?'✓':'—'} · Webhook {config.webhook?'✓':'—'}</p>}
      <div className="premium-plans">{plans.map(plan=><PlanEditor key={plan.id+':'+plan.revision} plan={plan} tl={tl} onSaved={async()=>{setMessage(tl('Планът е запазен.'));await load();}} onError={setError}/>)}</div>
    </section>
    {stats&&<section className="prof-card"><div className="payments-stats">{[
      ['Плащания общо',stats.payments.total],['Успешни плащания',stats.payments.successful],['Неуспешни плащания',stats.payments.failed],
      ['Активни абонаменти',stats.subscriptions.active],['Отменени абонаменти',stats.subscriptions.cancelled]].map(([label,value])=><div key={label}><span>{tl(label)}</span><strong>{value||0}</strong></div>)}</div>
      {stats.revenue.map(row=><p key={row.currency}>{tl('Приходи за периода')}: <strong>{formatMoney(row.paid,row.currency)}</strong> · {tl('Годишни абонаменти за периода')}: {formatMoney(row.annual_paid,row.currency)}</p>)}
      {stats.recurring.map(row=><p key={row.currency}>{tl('Месечен еквивалент на активните абонаменти')}: {formatMoney(row.monthly_equivalent,row.currency)}</p>)}
      <p className="chart-note">{tl('Брутно платени фактури преди възстановявания, данъци и такси. Валутите не се събират.')}</p>
    </section>}
    <section className="prof-card"><div className="push-actions">{Object.entries(KINDS).map(([value,label])=><button type="button" className={'btn '+(kind===value?'btn-primary':'')} key={value} onClick={()=>changeKind(value)}>{tl(label)}</button>)}</div>
      <form className="payments-filters" onSubmit={e=>{e.preventDefault();setPage(1);setApplied({...filters});}}>
        {['from','to'].map(key=><label key={key}>{tl(key==='from'?'От дата':'До дата')}<input className="inp" type="date" value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}/></label>)}
        <label>{tl('Статус')}<input className="inp" value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}/></label>
        <label>{tl('План')}<select className="inp" value={filters.plan} onChange={e=>setFilters({...filters,plan:e.target.value})}><option value="">{tl('Всички')}</option>{plans.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
        <label>{tl('Период')}<select className="inp" value={filters.interval} onChange={e=>setFilters({...filters,interval:e.target.value})}><option value="">{tl('Всички')}</option><option value="month">{tl('Месец')}</option><option value="year">{tl('Година')}</option></select></label>
        <label>{tl('Потребител / имейл')}<input className="inp" value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})}/></label><button className="btn" disabled={busy}>{tl('Приложи')}</button>
      </form>
      <div className="table-scroll"><table className="admin-table"><thead><tr>{COLUMNS[kind].map(([key,label])=><th key={key}>{tl(label)}</th>)}</tr></thead><tbody>
        {data.rows.map(row=><tr key={row.id||row.stripe_invoice_id}>{COLUMNS[kind].map(([key])=><td key={key}>{['amount','amount_paid'].includes(key)?formatMoney(row[key],row.currency):key.endsWith('_at')||['current_period_end'].includes(key)?date(row[key]):key.endsWith('_json')?<details><summary>{tl('Конфигурация')}</summary><pre>{row[key]||'—'}</pre></details>:String(row[key]??'—')}</td>)}</tr>)}
        {!data.rows.length&&<tr><td colSpan={COLUMNS[kind].length}>{tl(busy?'Зареждане…':'Няма записи.')}</td></tr>}
      </tbody></table></div>
      <div className="push-actions"><button className="btn" disabled={busy||page===1} onClick={()=>setPage(page-1)}>{tl('Предишна')}</button><span>{page} / {Math.max(1,Math.ceil(data.total/data.limit))} · {data.total}</span>
        <button className="btn" disabled={busy||page*data.limit>=data.total} onClick={()=>setPage(page+1)}>{tl('Следваща')}</button></div>
    </section>
    {error&&<p role="alert">{tl(BILLING_ERRORS[error]||BILLING_ERRORS.billing_unavailable)}</p>}{message&&<p role="status">{message}</p>}
  </div>;
}
export function PlanEditor({plan,tl=value=>value,onSaved,onError}) {
  const [form,setForm]=useState({displayName:plan.display_name,description:plan.description,amount:amountInput(plan.amount,plan.currency),currency:plan.currency||'',enabled:!!plan.enabled,billingInterval:plan.billing_interval,stripePriceId:''});
  const [saving,setSaving]=useState(false);
  const set=(key,value)=>setForm(old=>({...old,[key]:value}));
  const save=async e=>{
    e.preventDefault();if(!window.confirm(tl('Съществуващите абонати запазват текущата си цена. Новата цена важи за бъдещи абонаменти и може да създаде нов Stripe Price. Историческите плащания не се променят. Продължавате ли?')))return;
    setSaving(true);try{await billingApi('/api/admin/payments/plans/'+plan.id,{...form,amount:form.amount?parseAmount(form.amount,form.currency):null,revision:plan.revision,confirmed:true},'PUT');await onSaved();}
    catch(error){onError(error.code||'billing_unavailable');}finally{setSaving(false);}
  };
  return <form className="premium-plan plan-editor" onSubmit={save}><h3>{tl(plan.id==='monthly'?'Месечен':'Годишен')}</h3>
    {[['displayName','Име'],['description','Описание'],['amount','Цена'],['currency','Валута']].map(([key,label])=><label key={key}>{tl(label)}<input className="inp" value={form[key]} inputMode={key==='amount'?'decimal':undefined} onChange={e=>set(key,e.target.value)} required={key==='displayName'||form.enabled}/></label>)}
    <label>{tl('Период')}<select className="inp" value={form.billingInterval} disabled><option value="month">{tl('Месец')}</option><option value="year">{tl('Година')}</option></select></label>
    <label><input type="checkbox" checked={form.enabled} onChange={e=>set('enabled',e.target.checked)}/> {tl('Активен')}</label>
    <p className="chart-note">{tl('Текущ Stripe Price')}: <code>{plan.stripe_price_id||'—'}</code><br/>{tl('Stripe Product')}: <code>{plan.stripe_product_id||'—'}</code></p>
    <label>{tl('Използвай съществуващ Stripe Price (по избор)')}<input className="inp" value={form.stripePriceId} onChange={e=>set('stripePriceId',e.target.value)}/></label>
    <p className="chart-note">{tl('Създаден')}: {date(plan.created_at)} · {tl('Обновен')}: {date(plan.updated_at)}</p>
    <button className="btn btn-primary" disabled={saving}>{tl('Запази')}</button>
  </form>;
}
