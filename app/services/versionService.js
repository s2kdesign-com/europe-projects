// Услуга за откриване на нов deployment: чете /version.json без кеш и сравнява
// уникалния buildId. Без странични ефекти върху приложението при грешка.

import { CONSENT_KEY } from "../lib/version.js";

// Взима информацията за текущия публикуван build. Хвърля при грешка/HTTP != ok,
// за да може извикващият тихо да пропусне (без известие при временна грешка).
export async function fetchRemoteVersion(signal) {
  const r = await fetch(`/version.json?t=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
    signal,
  });
  if (!r.ok) throw new Error("http_" + r.status);
  return r.json();
}

// Нова версия = наличен и различен buildId (не разчитаме на semver).
export function isNewer(remote, currentBuildId) {
  return !!(remote && typeof remote.buildId === "string" && remote.buildId && remote.buildId !== currentBuildId);
}

// Чисто решение дали да покажем известие (лесно за тестване, без DOM).
// critical пренебрегва snooze/лимита; иначе спазваме брой затваряния и отлагане.
export function shouldNotify(remote, currentBuildId, opts = {}) {
  const { dismisses = 0, snoozeUntil = 0, now = Date.now(), maxDismiss = 3 } = opts;
  if (!isNewer(remote, currentBuildId)) return false;
  if (remote.critical) return true;
  if (dismisses >= maxDismiss) return false;
  if (snoozeUntil && now < snoozeUntil) return false;
  return true;
}

// Анонимна аналитика — само ако има аналитично съгласие И наличен gtag.
// Не изпраща лични данни, email, ID или пълни URL-и. No-op, ако нещо липсва.
export function trackUpdate(name, params = {}) {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    const consent = raw ? JSON.parse(raw) : null;
    if (!consent || !consent.analytics) return;
    if (typeof window.gtag !== "function") return;
    window.gtag("event", name, params);
  } catch { /* аналитиката никога не бива да чупи приложението */ }
}
