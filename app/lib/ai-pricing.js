// Ориентировъчни API цени (USD за 1M токена, вход/изход) — ВЕРСИОНИРАНА таблица.
// Това е приблизителна стойност за ориентир, НЕ фактура; цените се менят.
// Източник: публични ценови страници/агрегатори към датата по-долу.
export const AI_PRICING_VERSION = "2026-07";
export const AI_PRICING_DATE = "2026-07-18";

export const AI_PRICING = {
  "gpt-5.6-sol":   { in: 5.0,  out: 30.0 },
  "gpt-5.6-terra": { in: 2.5,  out: 15.0 },
  "gpt-5.6-luna":  { in: 1.0,  out: 6.0 },
  "gpt-5.5":       { in: 5.0,  out: 30.0 },
  "gpt-5.5-pro":   { in: 30.0, out: 180.0 },
};

export function priceLabel(modelId) {
  const p = AI_PRICING[modelId];
  if (!p) return null;
  return `$${p.in}/$${p.out} за 1M`;
}
