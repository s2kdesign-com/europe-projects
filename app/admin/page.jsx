"use client";

import { useCallback, useEffect, useState } from "react";
import AccountHeader from "../components/AccountHeader.jsx";
import Icon from "../components/Icon.jsx";
import { GoogleG } from "../components/UserMenu.jsx";
import { useSession } from "../hooks/useSession.js";
import { APP_VERSION } from "../lib/version.js";

const ROLES = [
  { key: "user", label: "Потребител" },
  { key: "premium", label: "Премиум" },
  { key: "admin", label: "Администратор" },
];

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TABS = [
  ["system", "Система", "grid"],
  ["users", "Потребители", "users"],
  ["errors", "Exceptions", "alert"],
  ["feedback", "Сигнали", "document"],
];

export default function AdminPage() {
  const session = useSession();
  const [tab, setTab] = useState("system");

  if (session.loading) return <><AccountHeader session={session} /><main id="main" className="container page"><p className="prose">Зареждане…</p></main></>;

  if (!session.authenticated)
    return (
      <>
        <AccountHeader session={session} />
        <main id="main" className="auth-wrap">
          <section className="auth-card">
            <span className="auth-mark" aria-hidden="true"><Icon name="filter" size={26} /></span>
            <h1>Вход е необходим</h1>
            <p className="auth-desc">Настройките са достъпни само за администратори.</p>
            <button className="btn btn-google btn-google-lg" onClick={() => session.login("/admin")}><GoogleG size={20} /> Продължи с Google</button>
            <a className="auth-secondary" href="/">Към таблото</a>
          </section>
        </main>
      </>
    );

  if (!session.isAdmin)
    return (
      <>
        <AccountHeader session={session} />
        <main id="main" className="auth-wrap">
          <section className="auth-card">
            <span className="auth-mark" aria-hidden="true" style={{ background: "linear-gradient(135deg,var(--red),#8a1420)" }}><Icon name="alert" size={26} /></span>
            <h1>Няма достъп</h1>
            <p className="auth-desc">Тази страница е само за администратори. Ако смятате, че това е грешка, свържете се с администратор.</p>
            <a className="btn btn-primary" href="/">Към таблото</a>
          </section>
        </main>
      </>
    );

  return (
    <>
      <AccountHeader session={session} />
      <main id="main" className="container page admin">
        <div className="page-head"><h1>Настройки · Администрация</h1><p>Системни настройки, потребители, журнал на грешките и сигнали.</p></div>

        <div className="admin-tabs" role="tablist" aria-label="Раздели">
          {TABS.map(([k, l, ic]) => (
            <button key={k} role="tab" aria-selected={tab === k} className="admin-tab" onClick={() => setTab(k)}>
              <Icon name={ic} size={16} /> <span className="tab-label">{l}</span>
            </button>
          ))}
        </div>

        {tab === "system" && <SystemTab session={session} />}
        {tab === "users" && <UsersTab />}
        {tab === "errors" && <ErrorsTab />}
        {tab === "feedback" && <FeedbackTab />}
      </main>
    </>
  );
}

function SystemTab({ session }) {
  const [stats, setStats] = useState(null);
  const [sys, setSys] = useState(null);
  const [build, setBuild] = useState(null);
  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then((d) => {
      const p = d.projects || [];
      setStats({ total: p.length, open: p.filter((x) => x.status === "open" || x.status === "closing_soon").length, docs: p.filter((x) => x.doc_count > 0).length, snapshot: d.snapshot?.run_date || "—" });
    }).catch(() => setStats({ total: "—", open: "—", docs: "—", snapshot: "—" }));
    fetch("/api/admin/system", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setSys(d.system || null)).catch(() => setSys(null));
    fetch("/version.json", { cache: "no-store" }).then((r) => r.json()).then(setBuild).catch(() => setBuild(null));
  }, []);
  const tr = sys?.translation;
  const c = sys?.counts;
  return (
    <>
      <section className="prof-card">
        <h2 className="prof-section-title">Системна информация</h2>
        <dl className="sys-grid">
          <div><dt>Версия</dt><dd>{APP_VERSION}</dd></div>
          <div><dt>Влезли сте като</dt><dd>{session.user?.email} <span className="role-chip">админ</span></dd></div>
          <div><dt>Билд (build ID)</dt><dd className="mono">{build?.buildId || "…"}</dd></div>
          <div><dt>Домейн</dt><dd className="mono">{sys?.appUrl ? sys.appUrl.replace(/^https?:\/\//, "") : "euro-funds.eu"}</dd></div>
          <div><dt>Съхранение</dt><dd>Cloudflare D1 + Worker</dd></div>
          <div><dt>Източници</dt><dd>eufunds.bg, esf.bg, az.government.bg, ПКИП</dd></div>
          <div><dt>Общо процедури</dt><dd>{stats ? stats.total : "…"}</dd></div>
          <div><dt>Отворени</dt><dd>{stats ? stats.open : "…"}</dd></div>
          <div><dt>С документи</dt><dd>{stats ? stats.docs : "…"}</dd></div>
          <div><dt>Последно обновяване</dt><dd>{stats ? stats.snapshot : "…"}</dd></div>
        </dl>
      </section>

      <section className="prof-card">
        <h2 className="prof-section-title">Многоезичност и превод</h2>
        <dl className="sys-grid">
          <div><dt>Статус на превода</dt><dd>{tr ? (tr.configured ? <span className="role-chip" style={{ background: "var(--green-bg,#dcfce7)", color: "var(--green-ink,#15803d)" }}>активен</span> : <span className="role-chip" style={{ background: "var(--amber-bg,#fef3c7)", color: "var(--amber-ink,#92400e)" }}>неактивен</span>) : "…"}</dd></div>
          <div><dt>Доставчик</dt><dd>{tr?.provider || "…"}</dd></div>
          <div><dt>Поддържани езици</dt><dd>{tr ? tr.languages : "…"}</dd></div>
          <div><dt>Локация</dt><dd className="mono">{tr?.location || "…"}</dd></div>
          <div><dt>Речник (glossary)</dt><dd>{tr ? (tr.glossaryEnabled ? `включен · v${tr.glossaryVersion}` : `изключен · v${tr.glossaryVersion}`) : "…"}</dd></div>
          <div><dt>Кеширани преводи</dt><dd>{tr ? tr.cacheEntries : "…"}</dd></div>
          <div><dt>Езици в кеша</dt><dd>{tr ? tr.cacheLanguages : "…"}</dd></div>
        </dl>
        {tr && !tr.configured && <p className="chart-note"><Icon name="alert" size={13} /> Секретите за Google Cloud Translation не са зададени — интерфейсът ползва български fallback. Виж TRANSLATION-SETUP.md.</p>}
      </section>

      <section className="prof-card">
        <h2 className="prof-section-title">База данни</h2>
        <dl className="sys-grid">
          <div><dt>Потребители</dt><dd>{c ? c.users : "…"}</dd></div>
          <div><dt>Запазени процедури</dt><dd>{c ? c.saved : "…"}</dd></div>
          <div><dt>Документи</dt><dd>{c ? c.documents : "…"}</dd></div>
          <div><dt>Записи в changelog</dt><dd>{c ? c.changelog : "…"}</dd></div>
        </dl>
        <h2 className="prof-section-title" style={{ marginTop: 20 }}>Роли</h2>
        <p className="prose">Достъпът се управлява чрез роли: <strong>Потребител</strong> (базов достъп + профил и запазени), <strong>Премиум</strong> (за бъдещи разширени функции) и <strong>Администратор</strong> (тази конзола). Управлявайте ролите в раздел „Потребители".</p>
        <p className="chart-note"><Icon name="info" size={13} /> Данните за процедурите се обновяват автоматично всеки ден от насрочената задача. Тук няма деструктивни действия върху публичните данни.</p>
      </section>
    </>
  );
}

function UsersTab() {
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => { fetch("/api/admin/users", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setUsers(d.users || [])).catch(() => setUsers([])); }, []);
  useEffect(() => { load(); }, [load]);

  const changeRole = async (id, role) => {
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, role, _saving: true } : u)));
    try {
      const r = await fetch("/api/admin/users/" + encodeURIComponent(id), { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify({ role }) });
      if (!r.ok) throw new Error();
      setMsg("Ролята е обновена."); setTimeout(() => setMsg(null), 2000);
    } catch { setMsg("Промяната не бе записана."); load(); }
    finally { setUsers((us) => us.map((u) => (u.id === id ? { ...u, _saving: false } : u))); }
  };

  if (users == null) return <section className="prof-card"><p className="prose">Зареждане…</p></section>;
  return (
    <section className="prof-card">
      <div className="ov-section-head"><h2 className="prof-section-title" style={{ margin: 0 }}>Потребители</h2><span className="count-dot">{users.length}</span>{msg && <span className="save-ok" role="status"><Icon name="check" size={14} /> {msg}</span>}</div>
      <div className="table-scroll">
        <table className="admin-table">
          <thead><tr><th>Потребител</th><th>Имейл</th><th>Роля</th><th>Регистриран</th><th>Последен вход</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><div className="u-cell">{u.avatar_url ? <img src={u.avatar_url} alt="" width={28} height={28} className="um-avatar" referrerPolicy="no-referrer" /> : <span className="um-avatar um-initials">{(u.display_name || u.email || "?").charAt(0).toUpperCase()}</span>}<span>{u.display_name || "—"}</span></div></td>
                <td className="mono">{u.email}</td>
                <td>
                  <select className="inp inp-sm" value={u.role} disabled={u._saving} onChange={(e) => changeRole(u.id, e.target.value)} aria-label={`Роля на ${u.email}`}>
                    {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </td>
                <td>{fmt(u.created_at)}</td>
                <td>{fmt(u.last_login_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ErrorsTab() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => { fetch("/api/admin/errors?limit=200", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setRows(d.errors || [])).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  const clear = async () => { if (!confirm("Да изчистя ли журнала с грешки?")) return; await fetch("/api/admin/errors", { method: "DELETE", credentials: "same-origin", headers: { "X-Requested-With": "fetch" } }); load(); };

  if (rows == null) return <section className="prof-card"><p className="prose">Зареждане…</p></section>;
  return (
    <section className="prof-card">
      <div className="ov-section-head">
        <h2 className="prof-section-title" style={{ margin: 0 }}>Exceptions</h2>
        <span className="count-dot">{rows.length}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={load}><Icon name="refresh" size={16} /> Обнови</button>
          {rows.length > 0 && <button className="btn btn-danger" onClick={clear}><Icon name="close" size={16} /> Изчисти</button>}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="state ov-empty"><Icon name="check" size={26} /><h3>Няма записани грешки</h3><p>Системата не е регистрирала грешки. Тук се събират сървърни и клиентски изключения.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Време</th><th>Източник</th><th>Метод/Път</th><th>Статус</th><th>Съобщение</th></tr></thead>
            <tbody>
              {rows.map((e) => [
                <tr key={e.id} className="err-row" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <td className="nowrap">{fmt(e.created_at)}</td>
                  <td><span className={"badge " + (e.source === "server" ? "amber" : "blue")}>{e.source || "?"}</span></td>
                  <td className="mono">{e.method} {e.path}</td>
                  <td>{e.status || "—"}</td>
                  <td className="err-msg">{e.message}</td>
                </tr>,
                open === e.id && e.detail ? <tr key={e.id + "-d"}><td colSpan={5}><pre className="err-detail">{e.detail}</pre></td></tr> : null,
              ])}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FeedbackTab() {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => { fetch("/api/admin/feedback?limit=200", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setRows(d.feedback || [])).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  const TYPE = { bug: "Грешка", data: "Неточни данни", idea: "Предложение" };
  const TONE = { bug: "red", data: "amber", idea: "blue" };

  if (rows == null) return <section className="prof-card"><p className="prose">Зареждане…</p></section>;
  return (
    <section className="prof-card">
      <div className="ov-section-head">
        <h2 className="prof-section-title" style={{ margin: 0 }}>Сигнали</h2>
        <span className="count-dot">{rows.length}</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={load}><Icon name="refresh" size={16} /> Обнови</button>
      </div>
      {rows.length === 0 ? (
        <div className="state ov-empty"><Icon name="check" size={26} /><h3>Няма сигнали</h3><p>Тук се показват подадените сигнали от потребителите (бутон „Подай сигнал за проблем").</p></div>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Време</th><th>Тип</th><th>Заглавие</th><th>Описание</th><th>Адрес / версия</th><th>Имейл</th></tr></thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td className="nowrap">{fmt(f.created_at)}</td>
                  <td><span className={"badge " + (TONE[f.type] || "neutral")}>{TYPE[f.type] || f.type}</span></td>
                  <td>{f.title || "—"}</td>
                  <td className="fb-desc">{f.description}</td>
                  <td className="mono">{f.url}{f.app_version ? ` · v${f.app_version}` : ""}</td>
                  <td className="mono">{f.email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
