"use client";

import { useCallback, useEffect, useState } from "react";
import AccountHeader from "../components/AccountHeader.jsx";
import Icon from "../components/Icon.jsx";
import { GoogleG } from "../components/UserMenu.jsx";
import { useSession } from "../hooks/useSession.js";
import { APP_VERSION } from "../lib/version.js";
import AiModelsTab from "./AiModelsTab.jsx";

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
  ["sources", "Източници", "layers"],
  ["ai", "AI модели", "sparkle"],
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
        {tab === "sources" && <SourcesTab />}
        {tab === "ai" && <AiModelsTab />}
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

// --- Източници (funding_sources) — преглед, филтри, активиране, добавяне, редакция ---
const HEALTH_OPTIONS = ["unknown", "healthy", "degraded", "failing", "blocked"];
const PAGE_SIZE = 25;

// Кратък URL (домейн) + стрелка за разгъване на пълните адреси.
function UrlCell({ source }) {
  const [open, setOpen] = useState(false);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const urls = [["Base", source.base_url], ["Покани", source.calls_url], ["Програми", source.programmes_url]].filter(([, u]) => u);
  return (
    <td className="url-cell">
      <span className="url-short">
        <a href={source.base_url} target="_blank" rel="noopener noreferrer nofollow" className="mono">{host(source.base_url)}</a>
        <button type="button" className="url-toggle" aria-expanded={open} aria-label={open ? "Скрий пълните адреси" : "Покажи пълните адреси"} onClick={() => setOpen((v) => !v)}>
          <Icon name="chevronRight" size={13} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
        </button>
      </span>
      {open && (
        <div className="url-full">
          {urls.map(([label, u]) => (
            <a key={label} href={u} target="_blank" rel="noopener noreferrer nofollow"><strong>{label}:</strong> {u}</a>
          ))}
        </div>
      )}
    </td>
  );
}
const EMPTY_SOURCE = { id: "", country_code: "", name: "", authority_name: "", base_url: "", calls_url: "", source_type: "portal", source_level: "national", source_language: "", coverage_description: "", priority: 100, verified: false, enabled: false, requires_javascript: false, primary_source: false };

function SourcesTab() {
  const [data, setData] = useState(null); // {sources, countries}
  const [country, setCountry] = useState("");
  const [flt, setFlt] = useState("all"); // all | enabled | disabled | verified | unverified | unhealthy
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // id на редактирания или "new"
  const [form, setForm] = useState(EMPTY_SOURCE);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/sources", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setData({ sources: d.sources || [], countries: d.countries || [] })).catch(() => setData({ sources: [], countries: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };

  const patch = async (id, body) => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/sources/" + encodeURIComponent(id), { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      flash("Записано."); load();
    } catch { flash("Промяната не бе записана."); }
    finally { setSaving(false); }
  };

  const create = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/sources", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error();
      flash("Източникът е добавен."); setEditing(null); setForm(EMPTY_SOURCE); load();
    } catch { flash("Добавянето не бе успешно (дублирано id или невалидни полета)."); }
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    const b = { ...form }; delete b.id; delete b.country_code;
    await patch(editing, b);
    setEditing(null); setForm(EMPTY_SOURCE);
  };

  if (data == null) return <section className="prof-card"><p className="prose">Зареждане…</p></section>;

  const rows = data.sources.filter((s) => {
    if (country && s.country_code !== country) return false;
    if (flt === "enabled" && !s.enabled) return false;
    if (flt === "disabled" && s.enabled) return false;
    if (flt === "verified" && !s.verified) return false;
    if (flt === "unverified" && s.verified) return false;
    if (flt === "unhealthy" && ["healthy", "unknown"].includes(s.source_health)) return false;
    if (q) { const h = `${s.id} ${s.name} ${s.authority_name || ""} ${s.base_url}`.toLowerCase(); if (!h.includes(q.toLowerCase())) return false; }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const cName = (code) => (data.countries.find((c) => c.code === code)?.name_bg) || code;
  const healthTone = (h) => (h === "healthy" ? "green" : h === "degraded" ? "amber" : h === "failing" || h === "blocked" ? "red" : "neutral");

  const editForm = (isNew) => (
    <section className="prof-card">
      <h2 className="prof-section-title">{isNew ? "Нов източник" : `Редакция: ${editing}`}</h2>
      <div className="form-grid">
        {isNew && <label className="field"><span className="field-label">ID (слъг, напр. gr-espa)</span><input className="inp" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} /></label>}
        {isNew && (
          <label className="field"><span className="field-label">Държава</span>
            <select className="inp" value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value })}>
              <option value="">—</option>
              {data.countries.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name_bg}</option>)}
            </select>
          </label>
        )}
        <label className="field"><span className="field-label">Име</span><input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="field"><span className="field-label">Орган (authority)</span><input className="inp" value={form.authority_name || ""} onChange={(e) => setForm({ ...form, authority_name: e.target.value })} /></label>
        <label className="field"><span className="field-label">Base URL</span><input className="inp" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} /></label>
        <label className="field"><span className="field-label">Calls URL (покани)</span><input className="inp" value={form.calls_url || ""} onChange={(e) => setForm({ ...form, calls_url: e.target.value })} /></label>
        <label className="field"><span className="field-label">Тип</span>
          <select className="inp" value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
            {["portal", "authority", "agency", "application_system", "monitoring", "system", "rss", "api"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Ниво</span>
          <select className="inp" value={form.source_level} onChange={(e) => setForm({ ...form, source_level: e.target.value })}>
            {["national", "regional", "programme"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Език (код)</span><input className="inp inp-sm" value={form.source_language || ""} onChange={(e) => setForm({ ...form, source_language: e.target.value })} /></label>
        <label className="field"><span className="field-label">Приоритет</span><input className="inp inp-sm" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></label>
        <label className="field" style={{ gridColumn: "1 / -1" }}><span className="field-label">Покритие (описание)</span><input className="inp" value={form.coverage_description || ""} onChange={(e) => setForm({ ...form, coverage_description: e.target.value })} /></label>
      </div>
      <div className="check-cols" style={{ marginTop: 8 }}>
        <label className="check"><input type="checkbox" checked={!!form.verified} onChange={(e) => setForm({ ...form, verified: e.target.checked })} /><span>Проверен (verified)</span></label>
        <label className="check"><input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /><span>Активен (enabled — production sync)</span></label>
        <label className="check"><input type="checkbox" checked={!!form.primary_source} onChange={(e) => setForm({ ...form, primary_source: e.target.checked })} /><span>Основен източник</span></label>
        <label className="check"><input type="checkbox" checked={!!form.requires_javascript} onChange={(e) => setForm({ ...form, requires_javascript: e.target.checked })} /><span>Изисква JavaScript</span></label>
      </div>
      <div className="prof-actions">
        <button className="btn btn-primary" disabled={saving} onClick={isNew ? create : saveEdit}><Icon name="check" size={16} /> {isNew ? "Добави източника" : "Запази промените"}</button>
        <button className="btn" onClick={() => { setEditing(null); setForm(EMPTY_SOURCE); }}>Отказ</button>
      </div>
      <p className="chart-note"><Icon name="info" size={13} /> Добавяйте само официални източници (държавни портали и управляващи органи). „Активен“ включва източника в автоматичната синхронизация — само след проверка и QA.</p>
    </section>
  );

  return (
    <>
      <section className="prof-card">
        <div className="ov-section-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <h2 className="prof-section-title" style={{ margin: 0 }}>Източници</h2>
          <span className="count-dot">{rows.length}</span>
          {msg && <span className="save-ok" role="status"><Icon name="check" size={14} /> {msg}</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="inp inp-sm" value={country} onChange={(e) => { setCountry(e.target.value); setPage(1); }} aria-label="Филтър по държава">
              <option value="">Всички държави</option>
              {data.countries.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name_bg} ({data.sources.filter((s) => s.country_code === c.code).length})</option>)}
            </select>
            <select className="inp inp-sm" value={flt} onChange={(e) => { setFlt(e.target.value); setPage(1); }} aria-label="Филтър по статус">
              <option value="all">Всички статуси</option>
              <option value="enabled">Само активни</option>
              <option value="disabled">Само неактивни</option>
              <option value="verified">Само проверени</option>
              <option value="unverified">Непроверени</option>
              <option value="unhealthy">Проблемни (health)</option>
            </select>
            <input className="inp inp-sm" placeholder="Търсене…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Търсене в източниците" />
            <button className="btn btn-ghost" onClick={load}><Icon name="refresh" size={16} /> Обнови</button>
            <button className="btn btn-primary" onClick={() => { setEditing("new"); setForm(EMPTY_SOURCE); }}><Icon name="sparkle" size={16} /> Добави</button>
          </div>
        </div>

        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Държава</th><th>Източник</th><th>URL</th><th>Тип/Ниво</th><th>Приор.</th><th>Verified</th><th>Активен</th><th>Health</th><th>Посл. успех</th><th></th></tr></thead>
            <tbody>
              {pageRows.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap">{s.country_code} · {cName(s.country_code)}</td>
                  <td><strong>{s.name}</strong>{s.authority_name ? <div className="row-sub">{s.authority_name}</div> : null}{s.requires_javascript ? <span className="badge amber" style={{ marginTop: 2 }}>JS</span> : null}</td>
                  <UrlCell source={s} />
                  <td className="nowrap">{s.source_type}<div className="row-sub">{s.source_level}</div></td>
                  <td>{s.priority}</td>
                  <td>
                    <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={!!s.verified} disabled={saving} onChange={(e) => patch(s.id, { verified: e.target.checked })} /><span className="sr-only">verified</span></label>
                  </td>
                  <td>
                    <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={!!s.enabled} disabled={saving} onChange={(e) => { if (e.target.checked && !s.verified) { flash("Първо маркирайте източника като проверен."); return; } patch(s.id, { enabled: e.target.checked }); }} /><span className="sr-only">enabled</span></label>
                  </td>
                  <td>
                    <select className={"inp inp-sm health-select h-" + s.source_health} value={s.source_health} disabled={saving} onChange={(e) => patch(s.id, { source_health: e.target.value })} aria-label="Source health">
                      {HEALTH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                    {s.consecutive_failures > 0 && <div className="row-sub"><span className={"badge " + healthTone(s.source_health)}>{s.consecutive_failures} грешки</span></div>}
                  </td>
                  <td className="nowrap">{s.last_success_at ? fmt(s.last_success_at) : "—"}</td>
                  <td><button className="btn btn-ghost" onClick={() => { setEditing(s.id); setForm({ ...EMPTY_SOURCE, ...s }); }}><Icon name="document" size={14} /> Редакция</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="state ov-empty"><Icon name="layers" size={26} /><h3>Няма източници по този филтър</h3><p>Променете филтрите или добавете нов източник.</p></div>}
        {rows.length > PAGE_SIZE && (
          <div className="admin-pager">
            <span className="pg-info">{(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, rows.length)} от {rows.length}</span>
            <button className="btn btn-ghost" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}><Icon name="chevronRight" size={14} style={{ transform: "rotate(180deg)" }} /> Предишна</button>
            <span className="pg-info" style={{ margin: 0 }}>стр. {curPage} / {totalPages}</span>
            <button className="btn btn-ghost" disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)}>Следваща <Icon name="chevronRight" size={14} /></button>
          </div>
        )}
      </section>

      {editing === "new" && editForm(true)}
      {editing && editing !== "new" && editForm(false)}
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
