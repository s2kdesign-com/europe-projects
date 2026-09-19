export const PUSH_PROMPT_KEY='evroproekti_push_prompt_last_shown';
export const PUSH_DAY=86400000;
const disabledKey=userId=>'evroproekti_push_disabled:'+userId;
const fail=code=>Object.assign(new Error(code),{code});
export function pushSupported(win=globalThis) {
  return !!(win.isSecureContext && win.Notification && win.PushManager && win.navigator?.serviceWorker);
}
export function publicKeyBytes(value) {
  try {
    const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'='));
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if (bytes.length!==65 || bytes[0]!==4) throw Error();
    return bytes;
  } catch { throw fail('push_not_configured'); }
}
export async function endpointHash(endpoint, win=globalThis) {
  return [...new Uint8Array(await win.crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function scrollPercentage(doc=document) {
  const root=doc.scrollingElement || doc.documentElement;
  const max=Math.max(0,root.scrollHeight-root.clientHeight);
  return max>0 ? Math.min(100,Math.max(0,root.scrollTop/max*100)) : 0;
}
export function promptDue(last,now=Date.now()) {
  return !last || (Number.isFinite(Number(last)) && now-Number(last)>=PUSH_DAY);
}
export function claimLocalPrompt(storage,now=Date.now()) {
  try {
    if (!promptDue(storage.getItem(PUSH_PROMPT_KEY),now)) return false;
    storage.setItem(PUSH_PROMPT_KEY,String(now));
    return storage.getItem(PUSH_PROMPT_KEY)===String(now);
  } catch { return false; } // Without persistence, do not repeatedly prompt.
}

export function createPushClient(win=globalThis, fetchImpl=(...args)=>fetch(...args)) {
  let pending=null;
  let mutation=null;
  const api=async(path,body,method='POST')=>{
    let response;
    try { response=await fetchImpl('/api/notifications/'+path,{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)}); }
    catch { throw fail('network'); }
    let data; try { data=await response.json(); } catch { throw fail('push_unavailable'); }
    if (!response.ok || !data.ok) throw fail(typeof data.error==='string'?data.error:'delivery_failed');
    return data;
  };
  const optOut=userId=>{try{return win.localStorage.getItem(disabledKey(userId))==='1';}catch{return false;}};
  const setOptOut=(userId,value)=>{try{win.localStorage.setItem(disabledKey(userId),value?'1':'0');}catch{if(value)throw fail('storage_unavailable');}};
  async function registration(create=false) {
    let reg=await win.navigator.serviceWorker.getRegistration('/');
    if (reg) {
      const script=reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL;
      if (script && new URL(script,win.location.origin).pathname!=='/sw.js') throw fail('service_worker_conflict');
    } else if (create) reg=await win.navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
    if (!reg) return null;
    if (!reg.active && create) {
      let timer;
      try { reg=await Promise.race([win.navigator.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('service_worker_unavailable')),10000);})]); }
      finally { clearTimeout(timer); }
    }
    if (!reg.active || !reg.pushManager) throw fail('service_worker_unavailable');
    return reg;
  }
  async function forget(sub) {
    if (!sub) return;
    await api('subscription',{endpointHash:await endpointHash(sub.endpoint,win)},'DELETE');
    // Once the backend confirms removal, delivery is disabled even if the
    // browser push service is temporarily unavailable during unsubscribe.
    try { await sub.unsubscribe(); } catch { /* Repair/rotation can retry later. */ }
  }
  async function setup(userId,config) {
    if (!userId) throw fail('login_required');
    const reg=await registration(true);
    let sub=await reg.pushManager.getSubscription();
    const key=publicKeyBytes(config.publicKey);
    const previous=sub?.options?.applicationServerKey;
    if (sub && ((sub.expirationTime && sub.expirationTime<=Date.now()) || (previous && String(new Uint8Array(previous))!==String(key)))) {
      await forget(sub); sub=null;
    }
    const subscribe=()=>reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    if (!sub) sub=await subscribe();
    let stored;
    try { stored=await api('subscription',sub.toJSON()); }
    catch (error) {
      if (!['subscription_owned_elsewhere','subscription_expired'].includes(error.code)) throw error;
      // Never transfer another account's endpoint. Rotate this browser's endpoint.
      await sub.unsubscribe(); sub=await subscribe(); stored=await api('subscription',sub.toJSON());
    }
    setOptOut(userId,false);
    return {status:'enabled',permission:'granted',id:stored.id,configured:true};
  }
  async function inspect(userId,{repair=true}={}) {
    if (!pushSupported(win)) return {status:'unsupported',permission:'default'};
    const permission=win.Notification.permission;
    if (permission==='denied') return {status:'blocked',permission};
    const config=await api('config',undefined,'GET');
    if (!config.configured) return {status:'unavailable',permission};
    if (optOut(userId)) return {status:'disabled',permission,configured:true};
    if (!userId) return {status:'login',permission,configured:true};
    if (permission!=='granted') return {status:'not-enabled',permission,configured:true};
    const reg=await registration();
    const sub=await reg?.pushManager.getSubscription();
    if (sub) {
      const state=await api('subscription/status',{endpointHash:await endpointHash(sub.endpoint,win)});
      if (state.active) return {status:'enabled',permission,id:state.id,configured:true};
    }
    return repair ? setup(userId,config) : {status:'setup',permission,configured:true};
  }
  const refresh=(userId,options)=>{
    if(mutation)return mutation;
    if (!pending) pending=inspect(userId,options).finally(()=>{pending=null;});
    return pending;
  };
  async function enableNow(userId) {
    if (!pushSupported(win)) throw fail('unsupported');
    if (!userId) throw fail('login_required');
    if (win.Notification.permission==='denied') throw fail('permission_denied');
    // This call happens synchronously from the user's click, before any fetch.
    const permission=win.Notification.permission==='granted'?'granted':await win.Notification.requestPermission();
    if (permission!=='granted') throw fail(permission==='denied'?'permission_denied':'permission_dismissed');
    if(pending)await pending.catch(()=>{});
    const config=await api('config',undefined,'GET');
    if (!config.configured) throw fail('push_not_configured');
    return setup(userId,config);
  }
  async function disableNow(userId) {
    if(pending)await pending.catch(()=>{});
    setOptOut(userId,true);
    try {
      const reg=await registration();
      const sub=await reg?.pushManager.getSubscription();
      await forget(sub);
    }
    catch(error){setOptOut(userId,false);throw error;}
    return {status:'disabled',permission:win.Notification.permission,configured:true};
  }
  // Serialize mutations against automatic focus/visibility repairs. Permission
  // still starts inside the original click before enableNow's first await.
  const mutate=action=>{
    if(!mutation)mutation=action().finally(()=>{mutation=null;});
    return mutation;
  };
  const enable=userId=>mutate(()=>enableNow(userId));
  const disable=userId=>mutate(()=>disableNow(userId));
  async function test(userId,scenario='test') {
    const state=await inspect(userId,{repair:false});
    if (state.status!=='enabled') throw fail(state.status==='blocked'?'permission_denied':'subscription_required');
    return api('test',{subscriptionId:state.id,scenario});
  }
  return {refresh,enable,disable,test,api};
}

export async function unsubscribeOnLogout(win=globalThis) {
  if (!win.navigator?.serviceWorker) return;
  try {
    const reg=await win.navigator.serviceWorker.getRegistration('/');
    if (reg?.active && new URL(reg.active.scriptURL).pathname==='/sw.js') await (await reg.pushManager.getSubscription())?.unsubscribe();
  } catch { /* Server-side session deletion independently removes its subscriptions. */ }
}
