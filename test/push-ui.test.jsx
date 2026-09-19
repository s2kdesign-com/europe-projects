import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PushControls from '../app/components/PushControls.jsx';
import PushActivationPrompt from '../app/components/PushActivationPrompt.jsx';
import { PUSH_PROMPT_KEY, PUSH_DAY } from '../app/services/push-client.js';
const state=vi.hoisted(()=>({push:null}));
vi.mock('../app/components/PushNotificationsProvider.jsx',()=>({usePushNotifications:()=>state.push}));
vi.mock('../app/lib/i18n/ui-translate.js',()=>({useUiTranslate:()=>s=>s}));
vi.mock('../app/components/Icon.jsx',()=>({default:()=>null}));
beforeEach(()=>{
  localStorage.clear();state.push={status:'not-enabled',permission:'default',busy:false,session:{loading:false,authenticated:true,login:vi.fn()},claimPrompt:vi.fn(async()=>({claimed:true})),enable:vi.fn(async()=>({status:'enabled'})),sendTest:vi.fn(),disable:vi.fn()};
  Object.defineProperty(document,'scrollingElement',{configurable:true,value:{scrollHeight:1200,clientHeight:200,scrollTop:499}});
});
test('profile test button uses verified status; denied state offers settings guidance',()=>{
  const view=render(<PushControls/>);expect(screen.getByText('Изпрати тестово известие')).toBeDisabled();expect(screen.getByText('Активирай известията')).toBeEnabled();
  state.push.status='enabled';view.rerender(<PushControls/>);fireEvent.click(screen.getByText('Изпрати тестово известие'));expect(state.push.sendTest).toHaveBeenCalledWith('test');
  state.push.status='blocked';view.rerender(<PushControls/>);expect(screen.queryByText('Активирай известията')).toBeNull();expect(screen.getByText(/Разрешете известията от настройките/)).toBeVisible();
});
test('welcome and other modals block activation; 50 percent triggers once and Not now never requests permission',async()=>{
  const view=render(<PushActivationPrompt welcomeComplete={false} blocked={false}/>);document.scrollingElement.scrollTop=500;fireEvent.scroll(window);expect(state.push.claimPrompt).not.toHaveBeenCalled();
  view.rerender(<PushActivationPrompt welcomeComplete blocked/>);fireEvent.scroll(window);expect(state.push.claimPrompt).not.toHaveBeenCalled();
  view.rerender(<PushActivationPrompt welcomeComplete blocked={false}/>);await screen.findByRole('dialog');expect(state.push.claimPrompt).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByText('Не сега'));expect(screen.queryByRole('dialog')).toBeNull();fireEvent.scroll(window);expect(state.push.enable).not.toHaveBeenCalled();expect(state.push.claimPrompt).toHaveBeenCalledTimes(1);
});
test('recent prompt, granted and denied permissions suppress onboarding',async()=>{
  document.scrollingElement.scrollTop=500;localStorage.setItem(PUSH_PROMPT_KEY,String(Date.now()-PUSH_DAY+10000));
  const view=render(<PushActivationPrompt welcomeComplete blocked={false}/>);await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(state.push.claimPrompt).not.toHaveBeenCalled();view.unmount();
  localStorage.clear();for(const permission of ['granted','denied']){state.push.permission=permission;const v=render(<PushActivationPrompt welcomeComplete blocked={false}/>);expect(screen.queryByRole('dialog')).toBeNull();v.unmount();}expect(state.push.claimPrompt).not.toHaveBeenCalled();
});
test('enable is a user action and closes only after successful subscription',async()=>{
  const view=render(<PushActivationPrompt welcomeComplete blocked={false}/>);expect(state.push.claimPrompt).not.toHaveBeenCalled();document.scrollingElement.scrollTop=500;fireEvent.scroll(window);await screen.findByRole('dialog');expect(state.push.enable).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Активирай известията'));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(state.push.enable).toHaveBeenCalledTimes(1);view.unmount();
});
