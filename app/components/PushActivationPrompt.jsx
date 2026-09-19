"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePushNotifications } from './PushNotificationsProvider.jsx';
import { beginNotificationLogin, notificationLoginPending, clearNotificationLogin, claimLocalPrompt, promptDue, PUSH_PROMPT_KEY, scrollPercentage } from '../services/push-client.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useUiTranslate } from '../lib/i18n/ui-translate.js';
import { PUSH_ERRORS } from './PushControls.jsx';
import Icon from './Icon.jsx';

const LABELS=['Следете възможностите за европейско финансиране','Активирайте известията за важни промени по запазени процедури и наближаващи срокове.','Активирай известията','Не сега',
  'Активирайте дневни известия за нови възможности за финансиране в избраната държава. Вход не е необходим.',
  'Вход с Google','Влезте с Google по желание, за да получавате лични известия според запазените процедури и настройките си.',
  'Коя държава да следим?','Изберете държава','Известията са активирани.',...Object.values(PUSH_ERRORS)];
export default function PushActivationPrompt({welcomeComplete,blocked,onOpenChange}) {
  const push=usePushNotifications();
  const [open,setOpen]=useState(false);
  const [success,setSuccess]=useState(false),[loginError,setLoginError]=useState(null);
  const attempted=useRef(false);
  const eligible=!!push && welcomeComplete && !blocked && !push.session.loading && push.permission==='default' && push.status==='not-enabled';
  const eligibleRef=useRef(eligible); eligibleRef.current=eligible;
  const claimPrompt=push?.claimPrompt;
  const authenticated=push?.session.authenticated;
  const tl=useUiTranslate([...LABELS,...(push?.countries||[]).map(c=>c.nameBg)]);
  const close=useCallback(()=>{setOpen(false);clearNotificationLogin();},[]);
  const visible=open && !blocked && welcomeComplete && push?.status!=='enabled';
  const trap=useFocusTrap(visible,close);
  useEffect(()=>{onOpenChange?.(visible);return()=>onOpenChange?.(false);},[visible,onOpenChange]);
  useEffect(()=>{if(!success)return;const timer=setTimeout(()=>setSuccess(false),6000);return()=>clearTimeout(timer);},[success]);
  useEffect(()=>{
    if(!authenticated||!notificationLoginPending()||push.session.loading||push.status==='checking')return;
    if(push.status==='enabled'||['blocked','unsupported'].includes(push.status)){clearNotificationLogin();return;}
    if(welcomeComplete&&!blocked)setOpen(true);
  },[authenticated,push?.status,push?.session.loading,welcomeComplete,blocked]);
  useEffect(()=>{
    if (!eligible || attempted.current) return;
    const check=async()=>{
      if(attempted.current || !eligibleRef.current || scrollPercentage()<50)return;
      attempted.current=true;
      try {
        let recent=false;
        try {recent=!promptDue(localStorage.getItem(PUSH_PROMPT_KEY));}catch{ /* Authenticated timestamp is authoritative. */ }
        if(recent)return;
        const claimed=authenticated ? (await claimPrompt()).claimed : navigator.locks
          ? await navigator.locks.request('euro-funds-push-prompt',()=>claimLocalPrompt(localStorage)) : claimLocalPrompt(localStorage);
        if(claimed && eligibleRef.current){
          try{localStorage.setItem(PUSH_PROMPT_KEY,String(Date.now()));}catch{ /* Server claim already saved. */ }
          setOpen(true);
        }
      } catch { /* Failed eligibility checks never trigger a permission prompt. */ }
    };
    window.addEventListener('scroll',check,{passive:true});
    check();
    return()=>window.removeEventListener('scroll',check);
  },[eligible,authenticated,claimPrompt]);
  if(!visible)return success?<div className="push-success" role="status">{tl('Известията са активирани.')}</div>:null;
  const enable=()=>{
    push.enable().then(result=>{if(result?.status==='enabled'){setSuccess(true);close();}});
  };
  const login=()=>{try{const path=beginNotificationLogin();setOpen(false);push.session.login(path);}catch(e){setLoginError(e.code);}};
  return <div className="overlay welcome-overlay">
    <section className="welcome push-prompt" role="dialog" aria-modal="true" aria-labelledby="push-prompt-title" ref={trap}>
      <div className="welcome-scroll">
        <span className="welcome-mark"><Icon name="info" size={28} /></span>
        <h2 id="push-prompt-title">{tl(LABELS[0])}</h2>
        <p className="welcome-lead">{tl(LABELS[authenticated?1:4])}</p>
        {!authenticated && <><label className="push-country">{tl('Коя държава да следим?')}
          <select className="inp" value={push.notificationCountry||''} onChange={e=>push.setNotificationCountry(e.target.value)} disabled={push.busy}>
            <option value="">{tl('Изберете държава')}</option>{(push.countries||[]).map(c=><option key={c.code} value={c.code}>{tl(c.nameBg)}</option>)}
          </select></label><p>{tl(LABELS[6])}</p></>}
        <div className="push-actions">
          <button type="button" className="btn btn-primary" onClick={enable} disabled={push.busy||(!authenticated&&!push.notificationCountry)}>{tl('Активирай известията')}</button>
          {!authenticated&&<button type="button" className="btn" onClick={login} disabled={push.busy}>{tl('Вход с Google')}</button>}
          <button type="button" className="btn" onClick={close} disabled={push.busy}>{tl('Не сега')}</button>
        </div>
        {(push.error||loginError) && <p role="alert">{tl(PUSH_ERRORS[push.error||loginError] || PUSH_ERRORS.push_unavailable)}</p>}
      </div>
    </section>
  </div>;
}
