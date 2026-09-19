"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSession } from '../hooks/useSession.js';
import { createPushClient } from '../services/push-client.js';

const PushContext=createContext(null);
export const usePushNotifications=()=>useContext(PushContext);
export default function PushNotificationsProvider({children}) {
  const session=useSession();
  const userId=session.user?.id || null;
  const client=useRef(null);
  if (!client.current) client.current=createPushClient();
  const [state,setState]=useState({status:'checking',permission:'default'});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(null);
  const [testResult,setTestResult]=useState(null);
  const mounted=useRef(true);
  const refresh=useCallback(async()=>{
    if (session.loading) return;
    try { const next=await client.current.refresh(userId); if (mounted.current) setState(next); return next; }
    catch (e) { if(mounted.current){setState({status:'setup',permission:globalThis.Notification?.permission || 'default'});setError(e.code || 'push_unavailable');} }
  },[session.loading,userId]);
  useEffect(()=>{
    mounted.current=true; refresh();
    const onVisible=()=>{if(document.visibilityState==='visible')refresh();};
    const onMessage=event=>{if(['push-subscription-changed','push-needs-setup'].includes(event.data?.type))refresh();};
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('online',refresh);
    window.addEventListener('storage',refresh);
    navigator.serviceWorker?.addEventListener('message',onMessage);
    return ()=>{mounted.current=false;document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',refresh);window.removeEventListener('storage',refresh);navigator.serviceWorker?.removeEventListener('message',onMessage);};
  },[refresh]);
  const run=async(action)=>{
    setBusy(true);setError(null);setTestResult(null);
    try { return await action(); }
    catch (e) {setError(e.code || 'push_unavailable'); if(e.code==='permission_denied')setState({status:'blocked',permission:'denied'}); if(e.code==='subscription_required')setState({status:'setup',permission:globalThis.Notification?.permission || 'default'}); return null;}
    finally {if(mounted.current)setBusy(false);}
  };
  const enable=()=>run(async()=>{const next=await client.current.enable(userId);setState(next);return next;});
  const disable=()=>run(async()=>{const next=await client.current.disable(userId);setState(next);return next;});
  const sendTest=(scenario='test')=>run(async()=>{
    const sent=await client.current.test(userId,scenario);
    if(sent.state==='suppressed'){setTestResult(sent.reason==='no_saved_procedure'?'no_saved':'suppressed');return sent;}
    let accepted=sent.state==='accepted';
    setTestResult(accepted?'accepted':'queued');
    // A provider acceptance is not proof of display. Wait for the real SW receipt.
    for(let attempt=0;attempt<12 && mounted.current;attempt++){
      await new Promise(resolve=>setTimeout(resolve,1000));
      const receipt=await client.current.api('delivery/'+encodeURIComponent(sent.deliveryId),undefined,'GET');
      accepted=receipt.state==='accepted';
      if(receipt.displayed){setTestResult('displayed');return receipt;}
      if(['failed','cancelled'].includes(receipt.state))throw Object.assign(new Error('delivery_failed'),{code:'delivery_failed'});
    }
    if(mounted.current)setTestResult(accepted?'waiting':'queued');
    return sent;
  });
  return <PushContext.Provider value={{...state,busy,error,testResult,enable,disable,sendTest,refresh,session,claimPrompt:()=>client.current.api('prompt',{})}}>{children}</PushContext.Provider>;
}
