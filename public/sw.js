/* Euro-Funds push worker. No fetch/cache interception: normal site navigation is unchanged. */
/* global self, clients */
function safeUrl(value) {
  try {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return self.location.origin+'/profile';
    const url=new URL(value,self.location.origin);
    if (url.origin!==self.location.origin || /^\/(api|admin)(\/|$)/.test(url.pathname)) return self.location.origin+'/profile';
    return url.href;
  } catch { return self.location.origin+'/profile'; }
}
function parsePayload(event) {
  let raw={};
  try { raw=event.data?.json() || {}; } catch { /* Plain/invalid payloads show a safe generic notification. */ }
  const text=(v,fallback,max)=>typeof v==='string' ? v.replace(/[\u0000-\u001f]/g,' ').slice(0,max) : fallback;
  return {
    title:text(raw.title,'Euro-Funds',100),body:text(raw.body,'Имате ново известие. Отворете профила си.',240),
    url:safeUrl(raw.url),notificationId:text(raw.notificationId,'general',80),
    deliveryId:typeof raw.deliveryId==='string'?raw.deliveryId:null,
    receiptToken:typeof raw.receiptToken==='string'?raw.receiptToken:null,
  };
}
async function receipt(data,phase) {
  if (!data.deliveryId || !data.receiptToken) return {allowed:true};
  try {
    const response=await fetch('/api/notifications/receipt',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
      body:JSON.stringify({deliveryId:data.deliveryId,token:data.receiptToken,phase}),signal:AbortSignal.timeout(8000)});
    if (!response.ok) return {allowed:false};
    return await response.json();
  } catch { return {allowed:true,offline:true}; }
}
async function broadcast(message) {
  for (const client of await clients.matchAll({type:'window',includeUncontrolled:true})) client.postMessage(message);
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(clients.claim()));
self.addEventListener('push',event=>event.waitUntil((async()=>{
  const data=parsePayload(event);
  const gate=await receipt(data,'received');
  if (!gate.allowed) return; // User logged out, disabled preference, or removed subscription.
  const tag='euro-funds:'+data.notificationId;
  const visible=await self.registration.getNotifications({tag});
  if (!visible.length) await self.registration.showNotification(gate.offline?'Euro-Funds':data.title,{
    body:gate.offline?'Отворете профила си, за да видите последните известия.':data.body,
    icon:'/favicon.ico',badge:'/favicon.ico',tag,renotify:false,data,
  });
  await receipt(data,'displayed');
  await broadcast({type:'push-delivered',deliveryId:data.deliveryId});
})()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const data=event.notification.data || {};
    // Stored data is sanitized again at use time; no payload may open another origin.
    let path='/profile';
    try { const u=new URL(data.url,self.location.origin); if(u.origin===self.location.origin)path=u.pathname+u.search+u.hash; } catch { /* fallback */ }
    const url=safeUrl(path);
    await receipt(data,'clicked');
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(c=>c.url===url) || windows.find(c=>{try{return new URL(c.url).origin===self.location.origin;}catch{return false;}});
    if (client) {
      try { if (client.url!==url) await client.navigate(url); await client.focus(); return; } catch { /* Existing tab closed; open one. */ }
    }
    await clients.openWindow(url);
  })());
});
self.addEventListener('pushsubscriptionchange',event=>event.waitUntil((async()=>{
  let subscription;
  try {
    const response=await fetch('/api/notifications/config',{cache:'no-store'});
    const config=await response.json();
    if (!config.configured) throw Error();
    const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(config.publicKey.length/4)*4,'=')),c=>c.charCodeAt(0));
    subscription=event.newSubscription || await self.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    const registered=await fetch('/api/notifications/subscription',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(subscription.toJSON())});
    if (!registered.ok) throw Error();
    await broadcast({type:'push-subscription-changed'});
  } catch {
    if (subscription) await subscription.unsubscribe().catch(()=>{});
    await broadcast({type:'push-needs-setup'});
  }
})()));
