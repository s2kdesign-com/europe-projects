"use client";

// Обвива готово JSX съдържание (напр. статична правна/информационна проза, писана
// директно като възли с линкове и списъци) и при en/de превежда текстовите му възли
// пакетно през същия кеширан pipeline като останалия UI. Оригиналният български се
// пази и се възстановява при връщане към bg. Ползвай за страници, където статичното
// обвиване на всеки низ в tl() е непрактично.

import { useEffect, useRef } from "react";
import { useLanguage } from "./I18nProvider.jsx";
import { translateItems } from "../../lib/i18n/translate-client.js";

export default function AutoTranslateRegion({ as: Tag = "div", resetKey, children, ...rest }) {
  const { lang } = useLanguage();
  const ref = useRef(null);
  const originals = useRef(new WeakMap());

  useEffect(() => {
    const root = ref.current;
    if (!root || typeof document === "undefined") return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest("script,style,noscript")) return NodeFilter.FILTER_REJECT;
        return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let cur;
    while ((cur = walker.nextNode())) nodes.push(cur);
    for (const n of nodes) if (!originals.current.has(n)) originals.current.set(n, n.nodeValue);

    if (!lang || lang === "bg") {
      for (const n of nodes) { const o = originals.current.get(n); if (o != null) n.nodeValue = o; }
      return;
    }
    let alive = true;
    const items = nodes.map((n, i) => ({ key: "n" + i, text: (originals.current.get(n) || "").trim() }));
    translateItems(lang, items).then((m) => {
      if (!alive) return;
      nodes.forEach((n, i) => {
        const r = m.get("n" + i);
        if (!r || !r.translated) return;
        const orig = originals.current.get(n) || "";
        const lead = (orig.match(/^\s*/) || [""])[0];
        const trail = (orig.match(/\s*$/) || [""])[0];
        n.nodeValue = lead + r.text + trail;
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, [lang, resetKey]);

  return <Tag ref={ref} {...rest}>{children}</Tag>;
}
