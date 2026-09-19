import { getCountry } from './country/countries.js';

export const DEFAULT_NOTIFICATION_HOUR = 10;
export function notificationHour(value) {
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : DEFAULT_NOTIFICATION_HOUR;
}
// Country civil time is explicit in Profile; never infer it from UI language,
// browser timezone, a fixed UTC offset, or the AI model's execution schedule.
export function notificationTimezone(country) { return getCountry(country).timezone; }
export function localNotificationTime(now, country, hour) {
  const timezone = notificationTimezone(country);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const part = type => parts.find(p => p.type === type).value;
  const localHour = Number(part('hour'));
  return { timezone, day: `${part('year')}-${part('month')}-${part('day')}`,
    hour: localHour, due: localHour >= notificationHour(hour) };
}
