"use client";

// Batch превод на списък български UI етикети (за страници с много статични, но
// генерирани от данни етикети — напр. профилната форма с таксономии). Една заявка,
// кеширано (клиент + D1). При bg връща оригинала. Използвай tl(bgText) при рендер.

import { createContext, useContext, useEffect, useState } from "react";
import { useLanguage } from "../../components/i18n/I18nProvider.jsx";
import { translateItems } from "./translate-client.js";

// Контекст, за да могат вложените компоненти (полета/секции) да превеждат етикетите
// си без изрично подаване на функцията.
export const UiTrContext = createContext((x) => x);
export function useUiTr() { return useContext(UiTrContext); }

export function useUiTranslate(labels) {
  const { lang } = useLanguage();
  const [map, setMap] = useState(() => new Map());
  const uniq = [...new Set((labels || []).filter(Boolean))];
  const sig = lang + "|" + uniq.length;

  useEffect(() => {
    if (!lang || lang === "bg") { setMap(new Map()); return; }
    let alive = true;
    const items = uniq.map((text, i) => ({ key: "u" + i, text }));
    translateItems(lang, items).then((m) => {
      if (!alive) return;
      const byText = new Map();
      items.forEach((it) => { const r = m.get(it.key); if (r && r.translated) byText.set(it.text, r.text); });
      setMap(byText);
    }).catch(() => {});
    return () => { alive = false; };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  return (bg) => map.get(bg) || bg;
}
