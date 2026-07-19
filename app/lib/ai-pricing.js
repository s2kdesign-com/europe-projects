// Ориентировъчни API цени (USD за 1M токена, вход/изход, STANDARD tier) —
// ВЕРСИОНИРАНА таблица. Приблизителна стойност за ориентир, НЕ фактура.
// Източник: официалната ценова страница на OpenAI (developers.openai.com/api/docs/pricing)
// към датата по-долу. Модели без запис показват "—".
export const AI_PRICING_VERSION = "2026-07";
export const AI_PRICING_DATE = "2026-07-18";

export const AI_PRICING = {
  "gpt-5.6-sol":   { in: 2.5,   out: 15.0 },
  "gpt-5.6-terra": { in: 1.25,  out: 7.5 },
  "gpt-5.6-luna":  { in: 0.5,   out: 3.0 },
  "gpt-5.5":       { in: 2.5,   out: 15.0 },
  "gpt-5.5-pro":   { in: 15.0,  out: 90.0 },
  "gpt-5.4":       { in: 1.25,  out: 7.5 },
  "gpt-5.4-mini":  { in: 0.375, out: 2.25 },
  "gpt-5.4-nano":  { in: 0.10,  out: 0.625 },
  "gpt-5.4-pro":   { in: 15.0,  out: 90.0 },
};

// Кратко „най-добро за" — ориентир при избор (не се превежда автоматично).
export const AI_USE_FOR = {
  "gpt-5.6-sol":   "Най-висока точност — сложни анализи, дълги документи и трудни извличания.",
  "gpt-5.6-terra": "Баланс цена/качество — препоръчан за системния анализ на процедури.",
  "gpt-5.6-luna":  "Бърз и икономичен — масови леки задачи, кратки резюмета, класификация.",
  "gpt-5.5":       "Предишен флагман — стабилно качество, същата цена като Sol.",
  "gpt-5.5-pro":   "Максимална прецизност на висока цена — само за специални случаи.",
  "gpt-5.4":       "По-старо поколение — икономична алтернатива за стандартни задачи.",
  "gpt-5.4-mini":  "Много леки задачи — етикетиране, кратки трансформации.",
  "gpt-5.4-nano":  "Най-евтин — прости класификации при голям обем.",
  "gpt-5.4-pro":   "Прецизен, но скъп — по-старо поколение; предпочетете 5.6 Sol.",
};

export function priceLabel(modelId) {
  const p = AI_PRICING[modelId];
  if (!p) return null;
  return `$${p.in}/$${p.out} за 1M`;
}
export function useForLabel(modelId) {
  return AI_USE_FOR[modelId] || null;
}

// Приблизителен разход в USD от реалните токени (input/output) по официалните цени
// за 1M токена. Връща null, ако моделът няма ценова конфигурация.
export function estimateCost(modelId, inputTokens = 0, outputTokens = 0) {
  const p = AI_PRICING[modelId];
  if (!p) return null;
  return (Number(inputTokens || 0) / 1e6) * p.in + (Number(outputTokens || 0) / 1e6) * p.out;
}
// Форматира разход в USD (по-малките суми с повече знаци).
export function costLabel(usd) {
  if (usd == null) return null;
  if (usd === 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  return "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: usd < 1 ? 4 : 2 });
}
