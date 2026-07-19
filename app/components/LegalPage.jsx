"use client";

import { useEffect, useRef } from "react";
import AccountHeader from "./AccountHeader.jsx";
import Icon from "./Icon.jsx";
import { useSession } from "../hooks/useSession.js";
import { useLanguage } from "./i18n/I18nProvider.jsx";
import { translateItems } from "../lib/i18n/translate-client.js";

// Общ изглед за правните страници (Условия, Поверителност, Бисквитки).
// Всяка секция може да има стабилен id (за anchor/TOC). Футърът е глобален.
function renderBody(body) {
  if (body == null) return null;
  if (Array.isArray(body)) return body.map((p, j) => <p key={j}>{p}</p>);
  if (typeof body === "string") return <p>{body}</p>;
  return body; // готов React възел (напр. параграфи с линкове)
}

// Правните страници се пишат като готови JSX възли (параграфи с линкове/списъци),
// затова статичното обвиване в tl() не е практично. Вместо това при en/de обхождаме
// текстовите възли на рендирания документ и ги превеждаме пакетно (същият кеширан
// pipeline като останалия UI). Оригиналният български се пази и се възстановява при bg.
function useLegalAutoTranslate(ref, lang, resetKey) {
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
  }, [ref, lang, resetKey]);
}

export default function LegalPage({ title, subtitle, effective, updated, version, sections, footerNote }) {
  const session = useSession();
  const { lang } = useLanguage();
  const mainRef = useRef(null);
  const toc = sections.filter((s) => s.id && s.h);
  // resetKey: при промяна в сесията родителят пре-рендира → текстовете се връщат на
  // български; повторно превеждаме след като сесията се уталожи.
  useLegalAutoTranslate(mainRef, lang, `${session.loading}|${session.authenticated}`);

  return (
    <>
      <AccountHeader session={session} />
      <main id="main" className="container page legal" ref={mainRef}>
        <div className="page-head">
          <h1>{title}</h1>
          {subtitle && <p className="legal-sub">{subtitle}</p>}
          <p className="legal-meta">
            {effective && <span><Icon name="clock" size={13} aria-hidden="true" /> В сила от: {effective}</span>}
            {updated && <span>Последна редакция: {updated}</span>}
            {version && <span>Версия: {version}</span>}
          </p>
        </div>

        <div className="legal-layout">
          {toc.length > 1 && (
            <details className="legal-toc" open>
              <summary>Съдържание</summary>
              <ol>
                {toc.map((s) => (<li key={s.id}><a href={"#" + s.id}>{s.h}</a></li>))}
              </ol>
            </details>
          )}

          <article className="legal-body prose">
            {sections.map((s, i) => (
              <section key={s.id || i} id={s.id} className={"legal-sec" + (s.variant === "contact" ? " legal-contact" : "")}>
                {s.h && <h2>{s.h}</h2>}
                {renderBody(s.body)}
                {s.list && <ul>{s.list.map((li, j) => <li key={j}>{li}</li>)}</ul>}
                {s.action}
              </section>
            ))}
            {footerNote}
          </article>
        </div>
      </main>
    </>
  );
}
