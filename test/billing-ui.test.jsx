import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PremiumPanel from '../app/components/PremiumPanel.jsx';
import PaymentsTab from '../app/admin/PaymentsTab.jsx';
import { billingApi } from '../app/lib/billing.js';
vi.mock('../app/lib/billing.js',async importOriginal=>({...await importOriginal(),billingApi:vi.fn()}));
vi.mock('../app/lib/i18n/ui-translate.js',()=>({useUiTranslate:()=>s=>s}));
vi.mock('../app/components/Icon.jsx',()=>({default:()=>null}));
const plans=[{id:'monthly',display_name:'Monthly fixture',billing_interval:'month',amount:1234,currency:'eur',description:'Monthly features',enabled:1,revision:1},
  {id:'annual',display_name:'Annual fixture',billing_interval:'year',amount:12345,currency:'eur',description:'Annual features',enabled:1,revision:1}];
beforeEach(()=>{vi.clearAllMocks();window.history.replaceState(null,'','/profile');});
test('free users see dynamic plans and Premium report CTA without fetching reports',async()=>{
  billingApi.mockImplementation(async path=>path.endsWith('/plans')?{configured:true,plans}:{entitlement:{premium:false},canManage:false});
  render(<PremiumPanel userId="fixture"/>);fireEvent.click(await screen.findByText('Абонирай се'));
  expect(screen.getByText('Monthly fixture')).toBeInTheDocument();expect(screen.getByText('Annual fixture')).toBeInTheDocument();
  expect(screen.getByText('Продължи към плащане')).toBeDisabled();fireEvent.click(screen.getAllByRole('radio')[1]);
  expect(screen.getByText('Продължи към плащане')).toBeEnabled();expect(screen.getByText('Отключи с Premium')).toBeInTheDocument();
  expect(billingApi.mock.calls.some(([url])=>url.includes('/premium/reports'))).toBe(false);
});
test('checkout submits only selected plan and displays safe server error',async()=>{
  billingApi.mockImplementation(async path=>{if(path.endsWith('/checkout'))throw {code:'plan_changed'};return path.endsWith('/plans')?{configured:true,plans}:{entitlement:{premium:false}};});
  render(<PremiumPanel userId="fixture"/>);fireEvent.click(await screen.findByText('Абонирай се'));fireEvent.click(screen.getAllByRole('radio')[0]);
  fireEvent.click(screen.getByText('Продължи към плащане'));await screen.findByRole('alert');
  expect(billingApi).toHaveBeenCalledWith('/api/billing/checkout',{planId:'monthly'},'POST');
});
test('success query does not grant Premium or unlock report history',async()=>{
  window.history.replaceState(null,'','/profile?checkout=success');
  billingApi.mockResolvedValue({entitlement:{premium:false},configured:true,plans});
  const v=render(<PremiumPanel userId="fixture"/>);await screen.findByText('Абонирай се');expect(screen.queryByText('Premium е активен')).toBeNull();v.unmount();
});
test('Premium user opens owned history and renders text without executing report markup',async()=>{
  billingApi.mockImplementation(async path=>path.endsWith('/status')?{entitlement:{premium:true,source:'administrator'}}:path.endsWith('/plans')?{configured:true,plans}:path.endsWith('/reports')?{reports:[{id:'owned',report_date:'2026-01-02',status:'ready'}]}:{report:{status:'ready',report_date:'2026-01-02',content:{summary:'<img src=x onerror=alert(1)>',recommendations:[{procedureId:'p',title:'Actual procedure',url:'/procedures/actual',reason:'Profile match',action:'Read documents'}],changes:[],deadlines:[]}}});
  render(<PremiumPanel userId="fixture"/>);expect(await screen.findByText('Premium е активен')).toBeInTheDocument();fireEvent.click(await screen.findByText(/Готов/));
  expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();expect(screen.getByRole('link',{name:'Actual procedure'})).toHaveAttribute('href','/procedures/actual');
  expect(document.querySelector('.daily-report img')).toBeNull();
});
test('Payments loads server pagination and plan controls from admin endpoints',async()=>{
  billingApi.mockImplementation(async path=>path.includes('/plans')?{plans,configured:{secret:true,webhook:true}}:path.includes('/overview')?{payments:{total:0,successful:0,failed:0},subscriptions:{active:0,cancelled:0},revenue:[],recurring:[]}:{rows:[],total:0,page:1,limit:25});
  render(<PaymentsTab/>);await waitFor(()=>expect(screen.getByDisplayValue('Monthly fixture')).toBeInTheDocument());
  expect(screen.getByDisplayValue('Annual fixture')).toBeInTheDocument();expect(billingApi.mock.calls.every(([path])=>path.startsWith('/api/admin/payments/'))).toBe(true);
});
