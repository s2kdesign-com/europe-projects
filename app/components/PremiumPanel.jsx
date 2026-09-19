"use client";
import { useCallback, useEffect, useState } from 'react';
import { billingApi, BILLING_ERRORS, formatMoney } from '../lib/billing.js';
import { useUiTranslate } from '../lib/i18n/ui-translate.js';
import Icon from './Icon.jsx';

const LABELS=['Premium','Premium е активен','Персонализирани дневни препоръки за европейско финансиране, история на отчетите и известия.',
  'Абонирай се','Управление на абонамента','Месечен','Годишен','на месец','на година','Продължи към плащане','Затвори',
  'Плановете още не са активирани. Опитайте отново по-късно.','Достъп, предоставен от администратор','Следващо плащане / край на периода',
  'Абонаментът приключва в края на периода','Статус','Обнови','Дневни AI отчети','Отключи с Premium',
  'Подходящи процедури, важни срокове, промени по запазени възможности и конкретни следващи действия.',
  'Отчетът се подготвя от сървъра. Не е необходимо да държите страницата отворена.','По-стари отчети','Препоръки','Защо е подходяща','Следващо действие','Срок','Финансиране','Допустимост',
  'Промени по запазени процедури','Наближаващи срокове','Няма налични записи.','Недостатъчна информация за персонализиране. Допълнете профила си.',
  'Прегледана е ограничена извадка от актуалните процедури.','Получавате безплатните известия за запазени процедури. Premium добавя известия за дневния AI отчет.',
  'Потвърждението на плащането се очаква от Stripe. Достъпът се активира след сървърно потвърждение.',
  'Готов','Подготвя се','Неуспешен опит','Отменен',...Object.values(BILLING_ERRORS)];
const date=value=>value?new Date(value).toLocaleDateString('bg-BG'):'—';
export default function PremiumPanel({userId}) {
  const tl=useUiTranslate(LABELS);
  const [checkoutPending,setCheckoutPending]=useState(false);
  const [status,setStatus]=useState(null),[plans,setPlans]=useState([]),[choose,setChoose]=useState(false),[selected,setSelected]=useState('');
  const [reports,setReports]=useState([]),[next,setNext]=useState(null),[report,setReport]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  const refresh=useCallback(async()=>{
    const [state,pricing]=await Promise.all([billingApi('/api/billing/status'),billingApi('/api/billing/plans')]);
    setStatus(state);setPlans(pricing.configured?pricing.plans:[]);
    if(state.entitlement.premium){const history=await billingApi('/api/premium/reports');setReports(history.reports);setNext(history.nextBefore);
      const id=new URLSearchParams(window.location.search).get('report');if(id){const result=await billingApi('/api/premium/reports/'+encodeURIComponent(id));setReport(result.report);}}
    else{setReports([]);setReport(null);}
    return state;
  },[]);
  useEffect(()=>{
    let active=true,timer,attempts=0; setCheckoutPending(new URLSearchParams(window.location.search).get('checkout')==='success');
    const load=async()=>{try{const state=await refresh();if(active&&!state.entitlement.premium&&new URLSearchParams(window.location.search).get('checkout')==='success'&&attempts++<20)timer=setTimeout(load,1500);}catch(e){if(active)setError(e.code||'billing_unavailable');}};
    load();const focus=()=>{if(document.visibilityState==='visible')load();};document.addEventListener('visibilitychange',focus);
    return()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',focus);};
  },[refresh,userId]);
  const run=async(action)=>{setBusy(true);setError(null);try{await action();}catch(e){setError(e.code||'billing_unavailable');}finally{setBusy(false);}};
  const access=status?.entitlement?.premium;
  const openReport=id=>run(async()=>{const data=await billingApi('/api/premium/reports/'+encodeURIComponent(id));setReport(data.report);const url=new URL(window.location.href);url.searchParams.set('report',id);url.hash='daily-reports';history.replaceState(null,'',url);});
  const purchase=()=>run(async()=>{const result=await billingApi('/api/billing/checkout',{planId:selected},'POST');window.location.assign(result.url);});
  return <div className="premium-section" aria-busy={busy}>
    <section id="premium" className={'prof-card premium-card '+(status&&!access?'premium-card-pulse':'')}>
      <div className="ov-section-head"><h2 className="prof-section-title"><Icon name="sparkle" size={20}/> {tl('Premium')} {access?'✓':''}</h2>
        <button className="btn btn-ghost" disabled={busy} onClick={()=>run(refresh)}>{tl('Обнови')}</button></div>
      {access?<><p>{tl('Premium е активен')}</p>{status.entitlement.source==='administrator'&&<p>{tl('Достъп, предоставен от администратор')}</p>}
        {status.subscription&&<div className="premium-facts"><span>{status.subscription.display_name}: {formatMoney(status.subscription.amount,status.subscription.currency)}</span>
          <span>{tl('Статус')}: {status.subscription.status}</span><span>{tl('Следващо плащане / край на периода')}: {date(status.subscription.current_period_end)}</span>
          {!!status.subscription.cancel_at_period_end&&<span>{tl('Абонаментът приключва в края на периода')}</span>}</div>}
      </>:<><p>{tl('Персонализирани дневни препоръки за европейско финансиране, история на отчетите и известия.')}</p>
        {status&&<button className="btn btn-primary" onClick={()=>setChoose(true)}>{tl('Абонирай се')}</button>}</>}
      {status?.canManage&&<button className="btn" disabled={busy} onClick={()=>run(async()=>{const data=await billingApi('/api/billing/portal',{},'POST');window.location.assign(data.url);})}>{tl('Управление на абонамента')}</button>}
      {choose&&!access&&<div className="premium-checkout" role="group" aria-label={tl('Абонирай се')}>
        <div className="premium-plans">{plans.map(plan=><label key={plan.id} className={'premium-plan '+(selected===plan.id?'selected':'')}>
          <input type="radio" name="premium-plan" value={plan.id} checked={selected===plan.id} onChange={()=>setSelected(plan.id)}/>
          <strong>{plan.display_name}</strong><span className="premium-price">{formatMoney(plan.amount,plan.currency)}</span>
          <span>{tl(plan.billing_interval==='year'?'на година':'на месец')}</span><p>{plan.description}</p></label>)}</div>
        {!plans.length&&<p>{tl('Плановете още не са активирани. Опитайте отново по-късно.')}</p>}
        <div className="push-actions"><button className="btn btn-primary" disabled={busy||!plans.some(p=>p.id===selected)} onClick={purchase}>{tl('Продължи към плащане')}</button>
          <button className="btn btn-ghost" onClick={()=>setChoose(false)}>{tl('Затвори')}</button></div>
      </div>}
      {checkoutPending&&!access&&<p role="status">{tl('Потвърждението на плащането се очаква от Stripe. Достъпът се активира след сървърно потвърждение.')}</p>}
      {error&&<p role="alert">{tl(BILLING_ERRORS[error]||BILLING_ERRORS.billing_unavailable)}</p>}
    </section>
    <section id="daily-reports" className="prof-card"><h2 className="prof-section-title">{tl('Дневни AI отчети')}</h2>
      {!access?<><p>{tl('Подходящи процедури, важни срокове, промени по запазени възможности и конкретни следващи действия.')}</p>
        <p className="chart-note">{tl('Получавате безплатните известия за запазени процедури. Premium добавя известия за дневния AI отчет.')}</p>
        {status&&<button className="btn btn-primary" onClick={()=>{setChoose(true);document.getElementById('premium')?.scrollIntoView({block:'start'});}}>{tl('Отключи с Premium')}</button>}</>:
      <>{!reports.length&&<p>{tl('Отчетът се подготвя от сървъра. Не е необходимо да държите страницата отворена.')}</p>}
        <div className="report-history">{reports.map(item=><button className="btn" key={item.id} disabled={busy||item.status!=='ready'} onClick={()=>openReport(item.id)}>
          {date(item.report_date+'T12:00:00Z')} · {tl(item.status==='ready'?'Готов':item.status==='failed'?'Неуспешен опит':item.status==='cancelled'?'Отменен':'Подготвя се')}</button>)}</div>
        {next&&<button className="btn btn-ghost" disabled={busy} onClick={()=>run(async()=>{const data=await billingApi('/api/premium/reports?before='+next);setReports(old=>[...old,...data.reports]);setNext(data.nextBefore);})}>{tl('По-стари отчети')}</button>}
        {report?.status==='ready'&&<ReportContent report={report} tl={tl}/>}</>}
    </section>
  </div>;
}
export function ReportContent({report,tl=value=>value}) {
  const content=report.content;
  if(!content)return null;
  return <article className="daily-report"><h3>{date(report.report_date+'T12:00:00Z')}</h3><p>{content.summary}</p>
    {content.profileIncomplete&&<p className="chart-note">{tl('Недостатъчна информация за персонализиране. Допълнете профила си.')}</p>}
    {content.coverageLimited&&<p className="chart-note">{tl('Прегледана е ограничена извадка от актуалните процедури.')}</p>}
    <h3>{tl('Препоръки')}</h3>{content.recommendations.map(item=><section key={item.procedureId} className="report-opportunity">
      <h4><a href={item.url}>{item.title}</a></h4><p><strong>{tl('Защо е подходяща')}:</strong> {item.reason}</p>
      <p><strong>{tl('Срок')}:</strong> {item.deadline||'—'} · <strong>{tl('Финансиране')}:</strong> {item.budget||'—'}</p>
      <p><strong>{tl('Допустимост')}:</strong> {item.eligibility||'—'}</p><p><strong>{tl('Следващо действие')}:</strong> {item.action}</p></section>)}
    {[['changes','Промени по запазени процедури'],['deadlines','Наближаващи срокове']].map(([key,label])=><section key={key}><h3>{tl(label)}</h3>
      {content[key]?.length?<ul>{content[key].map(item=><li key={item.url}><a href={item.url}>{item.title}</a> {item.deadline||''}</li>)}</ul>:<p>{tl('Няма налични записи.')}</p>}</section>)}
    <p className="chart-note">{content.disclaimer}</p></article>;
}
