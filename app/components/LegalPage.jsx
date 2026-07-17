"use client";

import AccountHeader from "./AccountHeader.jsx";
import Icon from "./Icon.jsx";
import { useSession } from "../hooks/useSession.js";

// Общ изглед за правните страници (Условия, Поверителност, Бисквитки).
// Всяка секция може да има стабилен id (за anchor/TOC). Футърът е глобален.
function renderBody(body) {
  if (body == null) return null;
  if (Array.isArray(body)) return body.map((p, j) => <p key={j}>{p}</p>);
  if (typeof body === "string") return <p>{body}</p>;
  return body; // готов React възел (напр. параграфи с линкове)
}

export default function LegalPage({ title, subtitle, effective, updated, version, sections, footerNote }) {
  const session = useSession();
  const toc = sections.filter((s) => s.id && s.h);

  return (
    <>
      <AccountHeader session={session} />
      <main id="main" className="container page legal">
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
