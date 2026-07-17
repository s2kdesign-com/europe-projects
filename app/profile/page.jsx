"use client";

import { useEffect, useMemo, useState } from "react";
import AccountHeader from "../components/AccountHeader.jsx";
import Icon from "../components/Icon.jsx";
import { GoogleG } from "../components/UserMenu.jsx";
import LanguageRegionSection from "../components/LanguageRegionSection.jsx";
import { useSession } from "../hooks/useSession.js";
import { downloadTextFile } from "../lib/browser.js";
import { ORGANIZATION_TYPES, ORG_SIZES, EMPLOYEE_RANGES, REVENUE_RANGES, SECTORS, REGIONS, APPLICANT_TYPES, INTERESTS } from "../lib/profile-taxonomy.js";

const EMPTY_PROFILE = {
  organization_name: "", organization_type: "", region: "", municipality: "", organization_size: "",
  employee_count_range: "", annual_revenue_range: "", primary_sector: "", additional_sectors: [],
  preferred_programs: [], applicant_types: [], minimum_project_budget: "", maximum_project_budget: "",
  maximum_self_financing_percentage: "", preferred_activities: [], preferred_regions: [], notes: "",
  youth_employment_interest: false, innovation_interest: false, digitalization_interest: false,
  green_transition_interest: false, research_interest: false, training_interest: false,
};
const EMPTY_PREFS = { change_notifications_enabled: true, deadline_notifications_enabled: true, email_notifications_enabled: false, notification_days_before: 7, language: "bg" };

export default function ProfilePage() {
  const session = useSession();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [prefs, setPrefs] = useState(EMPTY_PREFS);
  const [completion, setCompletion] = useState(0);
  const [programs, setPrograms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [formError, setFormError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    setOnboarding(new URLSearchParams(window.location.search).get("onboarding") === "1");
  }, []);

  useEffect(() => {
    if (session.loading || !session.authenticated) return;
    let alive = true;
    (async () => {
      try {
        const [p, pr, proj] = await Promise.all([
          fetch("/api/profile", { credentials: "same-origin" }).then((r) => r.json()),
          fetch("/api/preferences", { credentials: "same-origin" }).then((r) => r.json()),
          fetch("/api/projects").then((r) => r.json()).catch(() => ({ projects: [] })),
        ]);
        if (!alive) return;
        if (p.profile) {
          setProfile({ ...EMPTY_PROFILE, ...clean(p.profile) });
          setCompletion(p.profile.profile_completion_percentage || 0);
        }
        if (pr.preferences) setPrefs({ ...EMPTY_PREFS, ...pr.preferences });
        setPrograms([...new Set((proj.projects || []).map((x) => x.program).filter(Boolean))].sort((a, b) => a.localeCompare(b, "bg")));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [session.loading, session.authenticated]);

  const set = (k, v) => setProfile((f) => ({ ...f, [k]: v }));
  const toggleArr = (k, val) => setProfile((f) => ({ ...f, [k]: (f[k] || []).includes(val) ? f[k].filter((x) => x !== val) : [...(f[k] || []), val] }));
  const setPref = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));

  const budgetInvalid = useMemo(() => {
    const mn = Number(profile.minimum_project_budget), mx = Number(profile.maximum_project_budget);
    return profile.minimum_project_budget !== "" && profile.maximum_project_budget !== "" && Number.isFinite(mn) && Number.isFinite(mx) && mn > mx;
  }, [profile.minimum_project_budget, profile.maximum_project_budget]);

  const save = async () => {
    setFormError(null);
    if (budgetInvalid) { setFormError("Минималният бюджет не може да е по-голям от максималния."); return; }
    setSaving(true);
    try {
      const body = { ...profile,
        minimum_project_budget: numOrNull(profile.minimum_project_budget),
        maximum_project_budget: numOrNull(profile.maximum_project_budget),
        maximum_self_financing_percentage: numOrNull(profile.maximum_self_financing_percentage),
      };
      const rp = await fetch("/api/profile", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const dp = await rp.json();
      if (!rp.ok) { setFormError(dp.error === "budget_range_invalid" ? "Невалиден бюджетен диапазон." : "Профилът не можа да бъде запазен."); setSaving(false); return; }
      if (dp.profile) setCompletion(dp.profile.profile_completion_percentage || 0);
      await fetch("/api/preferences", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(prefs) });
      setMsg("Профилът е запазен."); setTimeout(() => setMsg(null), 2500);
      if (onboarding) window.location.href = "/";
    } catch {
      setFormError("Проблем с връзката. Опитайте отново.");
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    const saved = await fetch("/api/saved-procedures", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({ saved: [] }));
    downloadTextFile("evroproekti-moite-danni.json", JSON.stringify({ user: session.user, profile, preferences: prefs, saved: saved.saved || [] }, null, 2), "application/json");
  };

  const doDelete = async () => {
    await fetch("/api/account", { method: "DELETE", credentials: "same-origin", headers: { "X-Requested-With": "fetch" } });
    window.location.href = "/";
  };

  // --- Състояния ---
  if (session.loading) return <><AccountHeader session={session} /><main id="main" className="container page"><p className="prose">Зареждане…</p></main></>;
  if (!session.authenticated)
    return (
      <>
        <AccountHeader session={session} />
        <main id="main" className="auth-wrap">
          <section className="auth-card">
            <span className="auth-mark" aria-hidden="true"><Icon name="users" size={26} /></span>
            <h1>Вход е необходим</h1>
            <p className="auth-desc">Влезте, за да управлявате своя профил и предпочитания.</p>
            <button className="btn btn-google btn-google-lg" onClick={() => session.login("/profile")}><GoogleG size={20} /> Продължи с Google</button>
            <a className="auth-secondary" href="/">Към таблото</a>
          </section>
        </main>
      </>
    );

  const u = session.user || {};
  const initial = (u.display_name || u.email || "?").charAt(0).toUpperCase();

  return (
    <>
      <AccountHeader session={session} />
      <main id="main" className="container page profile">
        <div className="page-head"><h1>Моят профил</h1><p>Използва се за препоръки и филтриране. Данните се пазят в акаунта ви.</p></div>

        {onboarding && (
          <div className="ov-since" style={{ marginBottom: 16 }}>
            <Icon name="sparkle" size={18} />
            <p>Настройка на профила — попълнете основните полета (организация, интереси, предпочитания) и натиснете „Запази". Може да пропуснете и да го направите по-късно.</p>
          </div>
        )}

        {/* 1. Обобщение */}
        <section className="prof-card">
          <div className="prof-summary">
            {u.avatar_url ? <img className="prof-avatar" src={u.avatar_url} alt="" width={64} height={64} referrerPolicy="no-referrer" /> : <span className="prof-avatar prof-initials">{initial}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="prof-name">{u.display_name || "—"}</div>
              <div className="prof-email">{u.email} <span className="verified" title="Потвърден от Google"><Icon name="check" size={12} /> потвърден</span></div>
              <div className="prof-completion">
                <div className="pc-bar"><div className="pc-fill" style={{ width: completion + "%" }} /></div>
                <span>Попълненост: <strong>{completion}%</strong></span>
              </div>
            </div>
          </div>
          <p className="chart-note"><Icon name="info" size={13} /> Имейлът и името идват от Google и не се редактират тук.</p>
        </section>

        {formError && <div className="auth-error" role="alert" style={{ marginBottom: 12 }}><Icon name="alert" size={18} /> {formError}</div>}

        {/* 2. Организация */}
        <Section title="Организация">
          <div className="form-grid">
            <Field label="Име на организацията"><input className="inp" value={profile.organization_name} onChange={(e) => set("organization_name", e.target.value)} /></Field>
            <Field label="Тип организация"><Select value={profile.organization_type} onChange={(v) => set("organization_type", v)} options={ORGANIZATION_TYPES} /></Field>
            <Field label="Регион"><Select value={profile.region} onChange={(v) => set("region", v)} options={REGIONS.map((r) => ({ key: r, label: r }))} /></Field>
            <Field label="Община"><input className="inp" value={profile.municipality} onChange={(e) => set("municipality", e.target.value)} /></Field>
            <Field label="Размер"><Select value={profile.organization_size} onChange={(v) => set("organization_size", v)} options={ORG_SIZES} /></Field>
            <Field label="Брой служители"><Select value={profile.employee_count_range} onChange={(v) => set("employee_count_range", v)} options={EMPLOYEE_RANGES} /></Field>
            <Field label="Годишен оборот (по избор)"><Select value={profile.annual_revenue_range} onChange={(v) => set("annual_revenue_range", v)} options={REVENUE_RANGES} /></Field>
            <Field label="Основен сектор"><Select value={profile.primary_sector} onChange={(v) => set("primary_sector", v)} options={SECTORS.map((s) => ({ key: s, label: s }))} /></Field>
          </div>
          <CheckGroup legend="Допълнителни сектори" items={SECTORS.map((s) => ({ key: s, label: s }))} selected={profile.additional_sectors} onToggle={(v) => toggleArr("additional_sectors", v)} />
        </Section>

        {/* 3. Интереси */}
        <Section title="Интереси за финансиране">
          <div className="check-cols">
            {INTERESTS.map((it) => (
              <label className="check" key={it.key}><input type="checkbox" checked={!!profile[it.key]} onChange={(e) => set(it.key, e.target.checked)} /><span>{it.label}</span></label>
            ))}
          </div>
        </Section>

        {/* 4. Предпочитания за финансиране */}
        <Section title="Предпочитания за финансиране">
          <CheckGroup legend="Предпочитани програми" items={programs.map((p) => ({ key: p, label: p }))} selected={profile.preferred_programs} onToggle={(v) => toggleArr("preferred_programs", v)} />
          <CheckGroup legend="Тип кандидат" items={APPLICANT_TYPES} selected={profile.applicant_types} onToggle={(v) => toggleArr("applicant_types", v)} />
          <div className="form-grid">
            <Field label="Мин. бюджет (EUR)"><input className="inp" type="number" min="0" value={profile.minimum_project_budget} onChange={(e) => set("minimum_project_budget", e.target.value)} /></Field>
            <Field label="Макс. бюджет (EUR)"><input className="inp" type="number" min="0" value={profile.maximum_project_budget} onChange={(e) => set("maximum_project_budget", e.target.value)} /></Field>
            <Field label="Макс. собствено финансиране (%)"><input className="inp" type="number" min="0" max="100" value={profile.maximum_self_financing_percentage} onChange={(e) => set("maximum_self_financing_percentage", e.target.value)} /></Field>
          </div>
          {budgetInvalid && <p className="field-err"><Icon name="alert" size={13} /> Минималният бюджет е по-голям от максималния.</p>}
          <CheckGroup legend="Предпочитани региони" items={REGIONS.map((r) => ({ key: r, label: r }))} selected={profile.preferred_regions} onToggle={(v) => toggleArr("preferred_regions", v)} />
        </Section>

        {/* 5. Известия */}
        <Section title="Известия">
          <div className="check-cols">
            <label className="check"><input type="checkbox" checked={!!prefs.change_notifications_enabled} onChange={(e) => setPref("change_notifications_enabled", e.target.checked)} /><span>Промени по запазени процедури</span></label>
            <label className="check"><input type="checkbox" checked={!!prefs.deadline_notifications_enabled} onChange={(e) => setPref("deadline_notifications_enabled", e.target.checked)} /><span>Наближаващи срокове</span></label>
            <label className="check"><input type="checkbox" checked={!!prefs.email_notifications_enabled} onChange={(e) => setPref("email_notifications_enabled", e.target.checked)} /><span>Имейл известия</span></label>
          </div>
          <Field label="Напомняне (дни преди срок)"><input className="inp inp-sm" type="number" min="0" max="60" value={prefs.notification_days_before} onChange={(e) => setPref("notification_days_before", e.target.value)} /></Field>
          <p className="chart-note"><Icon name="info" size={13} /> Предпочитанията се запазват, но изпращането на имейли изисква бъдеща имейл инфраструктура и все още не е активно.</p>
        </Section>

        {/* 5b. Език и регион */}
        <LanguageRegionSection />

        <div className="prof-actions">
          <button className="btn btn-primary" onClick={save} disabled={saving}><Icon name="check" size={16} /> {saving ? "Запазване…" : "Запази профила"}</button>
          {msg && <span className="save-ok" role="status"><Icon name="check" size={16} /> {msg}</span>}
        </div>

        {/* 6. Акаунт и поверителност */}
        <Section title="Акаунт и поверителност" id="privacy">
          <p className="prose">Влезли сте като <strong>{u.email}</strong>. Google ни предоставя само основна идентичност; паролата ви никога не достига до нас.</p>
          <p className="prose">Запазените процедури и профилът се пазят в базата (Cloudflare D1), обвързани с акаунта ви. Преди вход временните запазвания живеят само в текущия браузър.</p>
          <div className="prof-actions">
            <button className="btn" onClick={exportData}><Icon name="download" size={16} /> Изтегли моите данни</button>
            <button className="btn" onClick={() => session.logout()}><Icon name="external" size={16} /> Изход</button>
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}><Icon name="close" size={16} /> Изтрий акаунта</button>
          </div>
        </Section>
      </main>

      {confirmDelete && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDelete(false)}>
          <div className="confirm" role="dialog" aria-modal="true" aria-labelledby="del-title">
            <h2 id="del-title">Изтриване на акаунта</h2>
            <p>Това ще изтрие профила, предпочитанията и запазените ви процедури. Публичните данни за процедурите не се засягат. Действието е необратимо.</p>
            <div className="prof-actions">
              <button className="btn" onClick={() => setConfirmDelete(false)}>Отказ</button>
              <button className="btn btn-danger" onClick={doDelete}><Icon name="close" size={16} /> Изтрий окончателно</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function clean(p) {
  const o = { ...p };
  for (const k of ["minimum_project_budget", "maximum_project_budget", "maximum_self_financing_percentage"]) o[k] = p[k] == null ? "" : p[k];
  return o;
}
function numOrNull(v) { const n = Number(v); return v === "" || !Number.isFinite(n) ? null : Math.floor(n); }

function Section({ title, id, children }) {
  return (
    <section className="prof-card" id={id}>
      <h2 className="prof-section-title">{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, children }) {
  return <label className="field"><span className="field-label">{label}</span>{children}</label>;
}
function Select({ value, onChange, options }) {
  return (
    <select className="inp" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}
function CheckGroup({ legend, items, selected, onToggle }) {
  return (
    <fieldset className="checkgroup">
      <legend className="field-label">{legend}</legend>
      <div className="check-cols">
        {items.map((it) => (
          <label className="check" key={it.key}><input type="checkbox" checked={(selected || []).includes(it.key)} onChange={() => onToggle(it.key)} /><span>{it.label}</span></label>
        ))}
      </div>
    </fieldset>
  );
}
