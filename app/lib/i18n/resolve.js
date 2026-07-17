// Определяне на началния език. Използва се и в клиента (no-flash), и в Worker-а
// (Accept-Language). Автоматичното разпознаване се прилага САМО когато няма ръчен
// избор — след ръчна смяна изборът никога не се заменя автоматично.

import { normalizeLocale, isSupported, DEFAULT_LOCALE, LOCALE_CODES } from "./locales.js";

// Разбива "de-DE,de;q=0.9,en;q=0.8" → ["de-DE","de","en"] (по низходящо q).
export function parseAcceptLanguage(header) {
  if (!header) return [];
  return String(header)
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      let q = 1;
      for (const p of params) {
        const m = /^q=([0-9.]+)$/.exec(p.trim());
        if (m) q = parseFloat(m[1]);
      }
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
}

// Първият поддържан език от подреден списък кандидати (масив от locale низове).
function firstSupported(list) {
  for (const c of list || []) {
    const n = normalizeLocale(c);
    if (n) return n;
  }
  return null;
}

// Fallback верига за неподдържано устройство:
//   първи поддържан от browser preferences → английски → български.
function unsupportedFallback(browserLanguages, fallback) {
  const fromBrowser = firstSupported(browserLanguages);
  if (fromBrowser) return fromBrowser;
  if (isSupported("en")) return "en";
  return isSupported(fallback) ? fallback : DEFAULT_LOCALE;
}

// Основна приоритетна логика.
//   1. Изричен URL параметър (?lang=de)
//   2. Профил на логнат потребител (manual)
//   3. Ръчен guest език (localStorage/cookie)
//   4. Browser настройки (navigator.languages / navigator.language)
//   5. HTTP Accept-Language (в Worker-а)
//   6. Fallback (bg)
export function resolveLanguage({
  urlLanguage,
  profileLanguage,
  storedGuestLanguage,
  browserLanguages,
  acceptLanguage,
  fallback = DEFAULT_LOCALE,
} = {}) {
  // 1–3: изрични/ръчни избори — с предимство и точна нормализация.
  for (const explicit of [urlLanguage, profileLanguage, storedGuestLanguage]) {
    const n = normalizeLocale(explicit);
    if (n) return n;
  }

  // 4: browser preferences (масив или единичен низ).
  const browserList = Array.isArray(browserLanguages)
    ? browserLanguages
    : browserLanguages
    ? [browserLanguages]
    : [];
  const fromBrowser = firstSupported(browserList);
  if (fromBrowser) return fromBrowser;

  // 5: Accept-Language (Worker).
  const acceptList = parseAcceptLanguage(acceptLanguage);
  const fromAccept = firstSupported(acceptList);
  if (fromAccept) return fromAccept;

  // 6: ако устройството е дало език, но той е неподдържан → en → bg.
  //    ако НЯМА никакъв сигнал за език → директно fallback (bg).
  const hadDeviceSignal = browserList.length > 0 || acceptList.length > 0;
  if (hadDeviceSignal) return unsupportedFallback([...browserList, ...acceptList], fallback);
  return isSupported(fallback) ? fallback : DEFAULT_LOCALE;
}

export { LOCALE_CODES };
