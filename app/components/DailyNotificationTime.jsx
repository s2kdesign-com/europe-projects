"use client";
import { notificationHour, notificationTimezone } from '../lib/notification-time.js';
import { useUiTranslate } from '../lib/i18n/ui-translate.js';

export const TIME_LABELS = ['Час за дневните известия',
  'Дневните известия се изпращат след избрания час според часовата зона на държавата за финансиране. Лятното часово време се отчита автоматично.',
  'Часова зона', 'Запазете профила, за да приложите часа. Ако отчетът се подготви по-късно, ще бъдете уведомени, когато е готов.'];
export default function DailyNotificationTime({ value, country, onChange }) {
  const tl = useUiTranslate(TIME_LABELS);
  return <div className="notification-time">
    <label className="field" htmlFor="daily-notification-hour">
      <span className="field-label">{tl(TIME_LABELS[0])}</span>
      <select id="daily-notification-hour" className="inp" value={notificationHour(value)}
        aria-describedby="notification-time-help" onChange={e => onChange(Number(e.target.value))}>
        {Array.from({length:24},(_,hour)=><option key={hour} value={hour}>{String(hour).padStart(2,'0')}:00</option>)}
      </select>
    </label>
    <div id="notification-time-help">
      <p><strong>{tl('Часова зона')}: {notificationTimezone(country)}</strong></p>
      <p>{tl(TIME_LABELS[1])}</p><p className="chart-note">{tl(TIME_LABELS[3])}</p>
    </div>
  </div>;
}
