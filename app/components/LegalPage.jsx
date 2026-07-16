"use client";

import AccountHeader from "./AccountHeader.jsx";
import Icon from "./Icon.jsx";
import { useSession } from "../hooks/useSession.js";

// Общ изглед за правните страници (Условия, Поверителност, Бисквитки).
// Футърът се рендира глобално от layout.
export default function LegalPage({ title, subtitle, updated, sections, footerNote }) {
  const session = useSession();
  return (
    <>
      <AccountHeader session={session} />
      <main id="main" className="container page legal">
        <div className="page-head">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          {updated && <p className="legal-updated"><Icon name="clock" size={13} /> Последна редакция: {updated}</p>}
        </div>
        <article className="legal-body prose">
          {sections.map((s, i) => (
            <section key={i} className="legal-sec">
              <h2>{s.h}</h2>
              {Array.isArray(s.body) ? s.body.map((p, j) => <p key={j}>{p}</p>) : <p>{s.body}</p>}
              {s.list && <ul>{s.list.map((li, j) => <li key={j}>{li}</li>)}</ul>}
              {s.action}
            </section>
          ))}
          {footerNote}
        </article>
      </main>
    </>
  );
}
