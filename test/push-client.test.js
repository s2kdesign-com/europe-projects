import { webcrypto } from 'node:crypto';
import { createPushClient, pushSupported, scrollPercentage, promptDue, claimLocalPrompt, PUSH_DAY, unsubscribeOnLogout } from '../app/services/push-client.js';

function fixture(permission='default') {
  const storage=new Map();const sequence=[];
  const key=new Uint8Array(65);key[0]=4;const publicKey=Buffer.from(key).toString('base64url');
  let sub=null;
  const newSub=()=>({endpoint:'https://fcm.googleapis.com/fcm/send/fixture',options:{applicationServerKey:key.buffer},expirationTime:null,toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'fixture',auth:'fixture'}};},unsubscribe:vi.fn(async()=>{sub=null;return true;})});
  const reg={active:{scriptURL:'https://euro-funds.eu/sw.js'},pushManager:{getSubscription:vi.fn(async()=>sub),subscribe:vi.fn(async()=>{sub=newSub();return sub;})}};
  const win={isSecureContext:true,Notification:{permission,requestPermission:vi.fn(async()=>{sequence.push('permission');win.Notification.permission='granted';return 'granted';})},PushManager:{},navigator:{serviceWorker:{getRegistration:vi.fn(async()=>reg),register:vi.fn(async()=>reg)}},location:{origin:'https://euro-funds.eu'},crypto:webcrypto,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
  let active=false;
  const fetch=vi.fn(async(path,options)=>{
    sequence.push(path);let data={ok:true};
    if(path.endsWith('/config'))data={...data,configured:true,publicKey};
    else if(path.endsWith('/status'))data={...data,active,id:active?'stored':null};
    else if(path.endsWith('/subscription')){active=options.method!=='DELETE';data.id='stored';}
    else if(path.endsWith('/test'))data.deliveryId='delivery';
    return {ok:true,json:async()=>data};
  });
  return {win,reg,fetch,sequence,client:createPushClient(win,fetch),setSub:s=>{sub=s;},newSub};
}
test('support, default and denied states never request permission automatically',async()=>{
  expect(pushSupported({})).toBe(false);
  for(const permission of ['default','denied']){
    const f=fixture(permission);expect((await f.client.refresh('user')).status).toBe(permission==='denied'?'blocked':'not-enabled');expect(f.win.Notification.requestPermission).not.toHaveBeenCalled();expect(f.reg.pushManager.subscribe).not.toHaveBeenCalled();
  }
});
test('enable requests permission before fetch and registers a real browser subscription shape',async()=>{
  const f=fixture();expect((await f.client.enable('user')).status).toBe('enabled');expect(f.sequence[0]).toBe('permission');
  expect(f.reg.pushManager.subscribe).toHaveBeenCalledWith({userVisibleOnly:true,applicationServerKey:expect.any(Uint8Array)});
  expect((await f.client.refresh('user')).status).toBe('enabled');expect(f.reg.pushManager.subscribe).toHaveBeenCalledTimes(1);
  await f.client.test('user','change');expect(JSON.parse(f.fetch.mock.calls.at(-1)[1].body)).toEqual({subscriptionId:'stored',scenario:'change'});
});
test('granted but absent subscription repairs silently; disabled browser stays disabled',async()=>{
  const f=fixture('granted');expect((await f.client.refresh('user')).status).toBe('enabled');expect(f.win.Notification.requestPermission).not.toHaveBeenCalled();
  const sub=await f.reg.pushManager.getSubscription();await f.client.disable('user');expect(sub.unsubscribe).toHaveBeenCalled();expect((await f.client.refresh('user')).status).toBe('disabled');expect(f.reg.pushManager.subscribe).toHaveBeenCalledTimes(1);
});
test('expired subscription renews; rejected permission and unsupported browser fail safely',async()=>{
  const f=fixture('granted');const old=f.newSub();old.expirationTime=1;f.setSub(old);await f.client.refresh('user');expect(old.unsubscribe).toHaveBeenCalled();
  const blocked=fixture('denied');await expect(blocked.client.enable('user')).rejects.toMatchObject({code:'permission_denied'});expect(blocked.win.Notification.requestPermission).not.toHaveBeenCalled();
  const unsupported=fixture();unsupported.win.PushManager=null;expect((await unsupported.client.refresh('user')).status).toBe('unsupported');
});
test('logout unsubscribes only our worker and test never auto-creates a subscription',async()=>{
  const f=fixture('granted');await expect(f.client.test('user')).rejects.toMatchObject({code:'subscription_required'});expect(f.reg.pushManager.subscribe).not.toHaveBeenCalled();await f.client.enable('user');const sub=await f.reg.pushManager.getSubscription();await unsubscribeOnLogout(f.win);expect(sub.unsubscribe).toHaveBeenCalled();
});
test('failed backend removal cannot turn a still-active subscription into a disabled status',async()=>{
  const f=fixture('granted');await f.client.enable('user');const original=f.fetch.getMockImplementation();f.fetch.mockImplementation((path,options)=>options.method==='DELETE'?Promise.reject(Error('offline')):original(path,options));
  await expect(f.client.disable('user')).rejects.toMatchObject({code:'network'});expect((await f.client.refresh('user')).status).toBe('enabled');
});
test('50 percent threshold and rolling 24 hour persistence include boundaries and storage failures',()=>{
  const doc={scrollingElement:{scrollHeight:1200,clientHeight:200,scrollTop:499}};expect(scrollPercentage(doc)).toBe(49.9);doc.scrollingElement.scrollTop=500;expect(scrollPercentage(doc)).toBe(50);doc.scrollingElement.scrollHeight=200;expect(scrollPercentage(doc)).toBe(0);
  expect(promptDue(100,PUSH_DAY+99)).toBe(false);expect(promptDue(100,PUSH_DAY+100)).toBe(true);expect(promptDue('invalid')).toBe(false);
  const f=fixture();expect(claimLocalPrompt(f.win.localStorage,100)).toBe(true);expect(claimLocalPrompt(f.win.localStorage,101)).toBe(false);expect(claimLocalPrompt(f.win.localStorage,100+PUSH_DAY)).toBe(true);expect(claimLocalPrompt({getItem(){throw Error();}})).toBe(false);
});
