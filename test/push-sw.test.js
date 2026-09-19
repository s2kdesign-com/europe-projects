// @vitest-environment node
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function fixture() {
  const events={};const tab={url:'https://euro-funds.eu/',navigate:vi.fn(async()=>{}),focus:vi.fn(async()=>{}),postMessage:vi.fn()};
  const self={location:{origin:'https://euro-funds.eu'},addEventListener:(name,fn)=>{events[name]=fn;},registration:{getNotifications:vi.fn(async()=>[]),showNotification:vi.fn(async()=>{})}};
  const clients={matchAll:vi.fn(async()=>[tab]),openWindow:vi.fn(async()=>{})};const fetch=vi.fn(async()=>({ok:true,json:async()=>({allowed:true})}));
  vm.runInNewContext(source,{self,clients,fetch,URL,AbortSignal,Uint8Array,atob});
  const emit=async(name,event)=>{let work;events[name]({...event,waitUntil:p=>{work=p;}});await work;};
  return {self,clients,tab,fetch,emit};
}
test('invalid payload displays safe fallback without trusting external URL',async()=>{
  const f=fixture();await f.emit('push',{data:{json(){throw Error();}}});expect(f.self.registration.showNotification.mock.calls[0][0]).toBe('Euro-Funds');expect(f.self.registration.showNotification.mock.calls[0][1].data.url).toBe('https://euro-funds.eu/profile');
});
test('valid push checks authenticated receipt, displays once and confirms display',async()=>{
  const f=fixture();const data={title:'Saved call changed',url:'//evil.test',notificationId:'event',deliveryId:'delivery',receiptToken:'token'};await f.emit('push',{data:{json:()=>data}});
  expect(f.self.registration.showNotification).toHaveBeenCalledTimes(1);expect(f.self.registration.showNotification.mock.calls[0][1].data.url).toBe('https://euro-funds.eu/profile');expect(f.fetch.mock.calls.map(c=>JSON.parse(c[1].body).phase)).toEqual(['received','displayed']);
  f.self.registration.getNotifications.mockResolvedValue([{}]);await f.emit('push',{data:{json:()=>data}});expect(f.self.registration.showNotification).toHaveBeenCalledTimes(1);
});
test('revoked session or preference suppresses notification',async()=>{
  const f=fixture();f.fetch.mockResolvedValue({ok:true,json:async()=>({allowed:false})});await f.emit('push',{data:{json:()=>({deliveryId:'delivery',receiptToken:'token'})}});expect(f.self.registration.showNotification).not.toHaveBeenCalled();
});
test('click focuses and navigates existing same-origin tab; malicious destinations fall back',async()=>{
  const f=fixture();const close=vi.fn();await f.emit('notificationclick',{notification:{close,data:{url:'https://euro-funds.eu/procedures/call'}}});expect(close).toHaveBeenCalled();expect(f.tab.navigate).toHaveBeenCalledWith('https://euro-funds.eu/procedures/call');expect(f.tab.focus).toHaveBeenCalled();expect(f.clients.openWindow).not.toHaveBeenCalled();
  f.clients.matchAll.mockResolvedValue([]);await f.emit('notificationclick',{notification:{close,data:{url:'https://evil.test'}}});expect(f.clients.openWindow).toHaveBeenCalledWith('https://euro-funds.eu/profile');
});
