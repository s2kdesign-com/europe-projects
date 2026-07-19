// Glossary + правила „какво да НЕ се превежда". Използва се и от клиента (за да не
// праща излишни неща), и от Worker-а (за cache ключ и защита на кодове).
//
// GLOSSARY_VERSION участва в cache ключа — при промяна на термините новите
// преводи получават нов ключ (старите не се трият, просто не се ползват).

export const GLOSSARY_VERSION = "1";

// Термини, които държим устойчиви (bg → предпочитан превод/оставяне). Реалният
// Google glossary ресурс се създава от този списък (виж TRANSLATION-SETUP.md);
// тук е и source of truth за версията.
export const GLOSSARY_TERMS = [
  "Euro-Funding", "европейско финансиране", "национално финансиране", "процедура",
  "допустими кандидати", "безвъзмездна финансова помощ", "собствено финансиране",
  "съфинансиране", "краен срок", "управляващ орган", "междинно звено", "бюджет",
  "документи за кандидатстване", "условия за кандидатстване", "държавна помощ",
  "минимална помощ", "МСП", "НПО", "община", "ИСУН", "ПКИП", "ПРЧР", "Фонд на фондовете",
];

// Не се превеждат (остават без промяна): продуктови имена, кодове, идентификатори.
export const DO_NOT_TRANSLATE = ["Euro-Funding", "S2K Design"];

// Кодове на процедури/програми: BG05SFPR001-2.005, BG16FFPR002-3.024 и подобни.
const CODE_RE = /^[A-Z]{2,}[0-9][A-Z0-9]*(?:[.\-][A-Z0-9]+)*$/;
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMERIC_RE = /^[\s0-9.,%€$+\-/–—]+$/; // само числа/символи/валута

// true → текстът НЕ бива да се праща за превод (безсмислено или вредно).
export function isNonTranslatable(text) {
  const s = String(text == null ? "" : text).trim();
  if (!s) return true;
  if (NUMERIC_RE.test(s)) return true;
  if (CODE_RE.test(s)) return true;
  if (URL_RE.test(s)) return true;
  if (EMAIL_RE.test(s)) return true;
  return false;
}

// Трябва ли изобщо да превеждаме този елемент?
export function shouldTranslate(text, targetLanguage, sourceLanguage = "bg") {
  if (!targetLanguage || targetLanguage === sourceLanguage) return false;
  if (isNonTranslatable(text)) return false;
  return true;
}
