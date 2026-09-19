"use client";
import { useState } from 'react';
import { usePushNotifications } from './PushNotificationsProvider.jsx';
import { useUiTranslate } from '../lib/i18n/ui-translate.js';
import Icon from './Icon.jsx';

export const PUSH_STATUS = {
  checking:'Проверка на известията…',enabled:'Известията са активни в този браузър.',
  'not-enabled':'Известията не са активирани.',disabled:'Известията са изключени в този браузър.',
  setup:'Известията се нуждаят от настройка или подновяване.',blocked:'Известията са блокирани в браузъра.',
  unsupported:'Този браузър не поддържа Web Push. На iPhone или iPad добавете сайта на началния екран и го отворете оттам.',
  unavailable:'Известията временно не са достъпни.',login:'Влезте, за да получавате известия за запазените си процедури.',
};
export const PUSH_ERRORS={
  permission_denied:'Разрешете известията от настройките за този сайт в браузъра, след което опитайте отново.',
  permission_dismissed:'Разрешението не е дадено. Може да опитате отново, когато пожелаете.',
  network:'Проблем с връзката. Опитайте отново.',rate_limited:'Изчакайте една минута преди следващия тест.',
  storage_unavailable:'Разрешете локалното съхранение за сайта, за да запазим изключването на известията.',
  subscription_required:'Абонаментът се нуждае от подновяване. Активирайте известията отново.',
  service_worker_unavailable:'Известията не успяха да се подготвят. Презаредете страницата и опитайте отново.',
  service_worker_conflict:'Има друга активна инсталация на сайта. Обновете я преди активиране на известията.',
  push_not_configured:'Известията временно не са достъпни.',
  device_limit:'Достигнат е лимитът от 10 браузъра. Изключете известията на старо устройство.',
  login_required:'Влезте, за да активирате известията.',unauthorized:'Влезте отново, за да управлявате известията.',
  delivery_failed:'Тестовото известие не можа да бъде изпратено. Опитайте отново.',
  push_unavailable:'Известията временно не са достъпни. Опитайте отново.',
};
const TEST_RESULT={queued:'Тестът изчаква повторен опит за доставка. Все още няма потвърждение от push услугата.',accepted:'Тестовото известие е изпратено. Изчаква се потвърждение от браузъра…',displayed:'Браузърът потвърди показването на тестовото известие.',waiting:'Push услугата прие известието, но показването още не е потвърдено. Проверете известията и режима „Не безпокойте“.',suppressed:'Не е изпратено известие: запазените настройки или срокът на процедурата не позволяват този тип.',no_saved:'Запазете процедура, за да проверите известията за промени или срокове.'};
const SCENARIOS={test:'Общ тест',change:'Промяна по запазена процедура',deadline:'Напомняне за срок'};
const LABELS=[...Object.values(PUSH_STATUS),...Object.values(PUSH_ERRORS),...Object.values(TEST_RESULT),'Известия в браузъра','Активирай известията','Изпрати тестово известие','Изключи в този браузър','Вход за активиране','Настройките по-горе управляват известията след „Запази профила“. Активирането важи за този браузър.'];

export default function PushControls() {
  const push=usePushNotifications();
  const [scenario,setScenario]=useState('test');
  const tl=useUiTranslate([...LABELS,...Object.values(SCENARIOS),'Тип тест']);
  if (!push) return null;
  const canEnable=['not-enabled','setup','disabled'].includes(push.status);
  return <div className="push-controls" aria-busy={push.busy}>
    <h3>{tl('Известия в браузъра')}</h3>
    <p role="status"><Icon name={push.status==='enabled'?'check':'info'} size={16} /> {tl(PUSH_STATUS[push.status] || PUSH_STATUS.setup)}</p>
    {push.status==='blocked' && <p className="chart-note">{tl(PUSH_ERRORS.permission_denied)}</p>}
    <div className="push-actions">
      {push.status==='login' && <button type="button" className="btn btn-primary" onClick={()=>push.session.login('/profile')}>{tl('Вход за активиране')}</button>}
      {canEnable && <button type="button" className="btn btn-primary" onClick={push.enable} disabled={push.busy}>{tl('Активирай известията')}</button>}
      {push.status==='enabled' && <label>{tl('Тип тест')} <select value={scenario} onChange={event=>setScenario(event.target.value)} disabled={push.busy}>{Object.entries(SCENARIOS).map(([value,label])=><option key={value} value={value}>{tl(label)}</option>)}</select></label>}
      <button type="button" className="btn" onClick={()=>push.sendTest(scenario)} disabled={push.busy || push.status!=='enabled'}>{tl('Изпрати тестово известие')}</button>
      {push.status==='enabled' && <button type="button" className="btn btn-ghost" onClick={push.disable} disabled={push.busy}>{tl('Изключи в този браузър')}</button>}
    </div>
    {push.error && <p role="alert">{tl(PUSH_ERRORS[push.error] || PUSH_ERRORS.push_unavailable)}</p>}
    {push.testResult && <p role="status">{tl(TEST_RESULT[push.testResult])}</p>}
    <p className="chart-note">{tl('Настройките по-горе управляват известията след „Запази профила“. Активирането важи за този браузър.')}</p>
  </div>;
}
