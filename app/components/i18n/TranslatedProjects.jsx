"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useLanguage } from "./I18nProvider.jsx";
import { translateItems } from "../../lib/i18n/translate-client.js";

// Batch превод на публичните текстови полета на процедурите (име, бюджет, кандидати,
// срок-текст) за текущия език — една заявка вместо по една на карта. Резултатът се
// кешира (клиент + D1). При bg връща празно (оригиналът). Кодове/програми не се пращат.
const Ctx = createContext(null);
const FIELDS = ["name", "budget", "eligible", "deadline"];

export function useTranslatedProject(id) {
  const map = useContext(Ctx);
  return (map && map.get(id)) || null;
}

export default function TranslatedProjectsProvider({ projects, children }) {
  const { lang } = useLanguage();
  const [map, setMap] = useState(() => new Map());

  const sig = (projects || []).length + ":" + lang;

  useEffect(() => {
    if (!lang || lang === "bg") { setMap(new Map()); return; }
    let alive = true;
    const items = [];
    for (const p of projects || []) {
      for (const f of FIELDS) if (p[f]) items.push({ key: p.id + "|" + f, text: String(p[f]) });
    }
    (async () => {
      const result = new Map();
      for (let i = 0; i < items.length; i += 100) {
        const part = items.slice(i, i + 100);
        const m = await translateItems(lang, part);
        for (const [k, v] of m) {
          const sep = k.indexOf("|");
          const id = k.slice(0, sep), field = k.slice(sep + 1);
          const o = result.get(id) || {};
          if (v && v.translated) o[field] = v.text;
          result.set(id, o);
        }
      }
      if (alive) setMap(result);
    })();
    return () => { alive = false; };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={map}>{children}</Ctx.Provider>;
}
