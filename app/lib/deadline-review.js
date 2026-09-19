export const DEADLINE_REVIEW_LABEL = 'Обявеният срок е изтекъл';
export const DEADLINE_REVIEW_NOTICE = 'Обявеният срок е изтекъл. Проверете официалния източник за удължаване или следващ прием.';

// An elapsed date is not evidence that a rolling or multi-window call is closed.
export function needsDeadlineReview(p, now = new Date()) {
  if (!['open', 'closing_soon'].includes(p?.status)) return false;
  const date = String(p.deadline_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === date && date < new Date(now).toISOString().slice(0,10);
}
