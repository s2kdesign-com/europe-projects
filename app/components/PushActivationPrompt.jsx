"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePushNotifications } from './PushNotificationsProvider.jsx';
import { claimLocalPrompt, promptDue, PUSH_PROMPT_KEY, scrollPercentage } from '../services/push-client.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useUiTranslate } from '../lib/i18n/ui-translate.js';
import { PUSH_ERRORS } from './PushControls.jsx';
import Icon from './Icon.jsx';

const LABELS=['Следете възможностите за европейско финансиране','Активирайте известията за важни промени по запазени процедури и наближаващи срокове.','Активирай известията','Не сега','Влезте в профила си, за да свържете известията със запазените процедури.',...Object.values(PUSH_ERRORS)];
export default function PushActivationPrompt({welcomeComplete,blocked,onOpenChange}) {
  const push=usePushNotifications();
  const [open,setOpen]=useState(false);
  const attempted=useRef(false);
  const eligible=!!push && welcomeComplete && !blocked && !push.session.loading && push.permission==='default' && ['not-enabled','login'].includes(push.status);
  const eligibleRef=useRef(eligible); eligibleRef.current=eligible;
  const claimPrompt=push?.claimPrompt;
  const authenticated=push?.session.authenticated;
  const tl=useUiTranslate(LABELS);
  const close=useCallback(()=>setOpen(false),[]);
  const visible=open && !blocked && welcomeComplete && push?.status!=='enabled';
  const trap=useFocusTrap(visible,close);
  useEffect(()=>{onOpenChange?.(visible);return()=>onOpenChange?.(false);},[visible,onOpenChange]);
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
  if(!visible)return null;
  const enable=()=>{
    if(!push.session.authenticated){close();push.session.login('/profile');return;}
    push.enable().then(result=>{if(result?.status==='enabled')close();});
  };
  return <div className="overlay welcome-overlay">
    <section className="welcome push-prompt" role="dialog" aria-modal="true" aria-labelledby="push-prompt-title" ref={trap}>
      <div className="welcome-scroll">
        <span className="welcome-mark"><Icon name="info" size={28} /></span>
        <h2 id="push-prompt-title">{tl(LABELS[0])}</h2>
        <p className="welcome-lead">{tl(LABELS[1])}</p>
        {!push.session.authenticated && <p>{tl(LABELS[4])}</p>}
        <div className="push-actions">
          <button type="button" className="btn btn-primary" onClick={enable} disabled={push.busy}>{tl('Активирай известията')}</button>
          <button type="button" className="btn" onClick={close} disabled={push.busy}>{tl('Не сега')}</button>
        </div>
        {push.error && <p role="alert">{tl(PUSH_ERRORS[push.error] || PUSH_ERRORS.push_unavailable)}</p>}
      </div>
    </section>
  </div>;
}
