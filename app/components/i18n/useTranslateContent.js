"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./I18nProvider.jsx";
import { translateItems } from "../../lib/i18n/translate-client.js";

// Превежда batch от публични текстове за текущия език. items: [{key,text}].
// Връща { map: Map<key,{text,translated}>, loading }. При bg или грешка показва
// оригинала. Abort при смяна на език/навигация.
export function useTranslateContent(items) {
  const { lang } = useLanguage();
  const [map, setMap] = useState(() => new Map());
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  const sig = (items || []).map((i) => i.key + " " + i.text).join("") + "|" + lang;

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let alive = true;
    setLoading(true);
    translateItems(lang, items || [], { signal: ctrl.signal })
      .then((m) => { if (alive) { setMap(m); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; ctrl.abort(); };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  return { map, loading };
}
