"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AccountHeader from "../components/AccountHeader.jsx";
import Icon from "../components/Icon.jsx";
import { GoogleG } from "../components/UserMenu.jsx";
import LanguageRegionSection from "../components/LanguageRegionSection.jsx";
import { useSession } from "../hooks/useSession.js";
import { downloadTextFile } from "../lib/browser.js";
import { ORGANIZATION_TYPES, ORG_SIZES, EMPLOYEE_RANGES, revenueRanges, SECTORS, APPLICANT_TYPES, INTERESTS } from "../lib/profile-taxonomy.js";
import { useCountry } from "../components/country/CountryProvider.jsx";
import { countryAdminLabels } from "../lib/country/countries.js";
import { useUiTranslate, UiTrContext, useUiTr } from "../lib/i18n/ui-translate.js";

// Всички български етикети на страницата (структура + таксономия) — за batch превод.
const TAXONOMY_LABELS = [
  ...ORGANIZATION_TYPES.map((x) => x.label), ...ORG_SIZES.map((x) => x.label),
  ...EMPLOYEE_RANGES.map((x) => x.label),
  ...SECTORS, ...APPLICANT_TYPES.map((x) => x.label), ...INTERESTS.map((x) => x.label),
];
const STRUCT_LABELS = [
  "Моят профил", "Използва се за препоръки и филтриране. Данните се пазят в акаунта ви.",
  "потвърден", "Попълненост:", "Имейлът и името идват от Google и не се редактират тук.",
  "Организация", "Име на организацията", "Тип организация", "Регион", "Община", "Размер",
  "Брой служители", "Годишен оборот (по избор)", "Основен сектор", "Допълнителни сектори",
  "Интереси за финансиране", "Предпочитания за финансиране", "Предпочитани програми",
  "Тип кандидат", "Мин. бюджет (EUR)", "Макс. бюджет (EUR)", "Макс. собствено финансиране (%)",
  "Минималният бюджет е по-голям от максималния.", "Предпочитани региони", "Известия",
  "Промени по запазени процедури", "Наближаващи срокове", "Имейл известия",
  "Напомняне (дни преди срок)",
  "Предпочитанията се запазват, но изпращането на имейли изисква бъдеща имейл инфраструктура и все още не е активно.",
  "Запази профила", "Запазване…", "Акаунт и поверителност", "Изтегли моите данни", "Изход",
  "Изтрий акаунта", "Към таблото", "Зареждане…", "Вход е необходим",
  "Влезте, за да управлявате своя профил и предпочитания.", "Продължи с Google",
  "Потвърден от Google", "Минималният бюджет е по-голям от максималния.",
  "Настройка на профила — попълнете основните полета (организация, интереси, предпочитания) и натиснете „Запази“. Може да пропуснете и да го направите по-късно.",
  "Влезли сте като", "Google ни предоставя само основна идентичност; паролата ви никога не достига до нас.",
  "Запазените процедури и профилът се пазят в базата (Cloudflare D1), обвързани с акаунта ви. Преди вход временните запазвания живеят само в текущия браузър.",
  "Изтриване на акаунта",
  "Това ще изтрие профила, предпочитанията и запазените ви процедури. Публичните данни за процедурите не се засягат. Действието е необратимо.",
  "Отказ", "Изтрий окончателно", "Имате незапазени промени", "Профилът е запазен.",
  "Профилът не можа да бъде запазен.", "Проблем с връзката. Опитайте отново.", "Невалиден бюджетен диапазон.",
  "Минималният бюджет не може да е по-голям от максималния.",
];
const ALL_PROFILE_LABELS = [...STRUCT_LABELS, ...TAXONOMY_LABELS];

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
  // Country-aware профилни опции: региони, програми и валута за избраната държава
  // (НЕ hardcoded български области/BGN). Виж /api/countries/profile-options.
  const { selectedCountry } = useCountry();
  const [copts, setCopts] = useState({ regions: [], programmes: [], currency: "EUR", coverageStatus: "none" });
  const prevCountryRef = useRef(null);
  const [baseline, setBaseline] = useState(JSON.stringify(EMPTY_PROFILE));
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    fetch("/api/countries/profile-options?country=" + encodeURIComponent(selectedCountry), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => { if (alive && d.ok) setCopts(d); })
      .catch(() => {});
    return () => { alive = false; controller.abort(); };
  }, [selectedCountry]);
  // Смяна на държавата при попълнени country-specific стойности → потвърждение +
  // изчистване САМО на несъвместимите (региони/община/програми); универсалните остават.
  useEffect(() => {
    if (prevCountryRef.current == null) { prevCountryRef.current = selectedCountry; return; }
    if (prevCountryRef.current === selectedCountry) return;
    const hadCountryData = profile.region || profile.municipality || (profile.preferred_regions || []).length || (profile.preferred_programs || []).length;
    if (hadCountryData) {
      const okd = confirm("Промяна на държавата за финансиране\n\nРегионите, програмите и част от финансовите предпочитания са специфични за държавата. При промяната несъвместимите стойности ще бъдат изчистени.");
      if (okd) setProfile((f) => ({ ...f, region: "", municipality: "", preferred_regions: [], preferred_programs: [] }));
    }
    prevCountryRef.current = selectedCountry;
  }, [selectedCountry]); // eslint-disable-line react-hooks/exhaustive-deps
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
          fetch("/api/projects?country=" + encodeURIComponent(selectedCountry)).then((r) => r.json()).catch(() => ({ projects: [] })),
        ]);
        if (!alive) return;
        if (p.profile) {
          const loaded = { ...EMPTY_PROFILE, ...clean(p.profile) };
          setProfile(loaded);
          setBaseline(JSON.stringify(loaded));
          setCompletion(p.profile.profile_completion_percentage || 0);
        }
        if (pr.preferences) setPrefs({ ...EMPTY_PREFS, ...pr.preferences });
        setPrograms([...new Set((proj.projects || []).map((x) => x.program).filter(Boolean))].sort((a, b) => a.localeCompare(b, "bg"))); // fallback; профилът ползва copts.programmes
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [session.loading, session.authenticated]);

  const set = (k, v) => setProfile((f) => ({ ...f, [k]: v }));
  const toggleArr = (k, val) => setProfile((f) => ({ ...f, [k]: (f[k] || []).includes(val) ? f[k].filter((x) => x !== val) : [...(f[k] || []), val] }));
  const setPref = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));

  const adminL = countryAdminLabels(selectedCountry);
  // value = стабилен код; ако старата запазена стойност е име (стар BG формат) —
  // добавяме я като опция, за да не се "губи" визуално, докато не бъде презаписана.
  const regionOptions = useMemo(() => {
    const opts = (copts.regions || []).map((r) => ({ key: r.code, label: r.name }));
    const known = new Set(opts.flatMap((o) => [o.key, o.label]));
    if (profile.region && !known.has(profile.region)) opts.unshift({ key: profile.region, label: profile.region });
    return opts;
  }, [copts.regions, profile.region]);
  const regionValue = profile.region;
  const programmeOptions = useMemo(() => {
    const fromCountry = (copts.programmes || []).map((p2) => ({ key: p2.name, label: p2.name }));
    if (fromCountry.length) return fromCountry;
    return programs.map((p2) => ({ key: p2, label: p2 }));
  }, [copts.programmes, programs]);
  // Динамичните имена (региони/програми) също минават през batch превода.
  const dynamicLabels = useMemo(() => [
    ...regionOptions.map((o) => o.label),
    ...programmeOptions.map((o) => o.label),
    adminL.region, adminL.municipality,
    `Годишен оборот (${copts.currency || "EUR"}, по избор)`,
    ...revenueRanges(copts.currency).map((x) => x.label),
  ], [regionOptions, programmeOptions, adminL, copts.currency]);

  const dirty = useMemo(() => JSON.stringify(profile) !== baseline, [profile, baseline]);

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
      setBaseline(JSON.stringify(profile));
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

  const tl = useUiTranslate([...ALL_PROFILE_LABELS, ...dynamicLabels]);

  // --- Състояния ---
  if (session.loading) return <><AccountHeader session={session} /><main id="main" className="container page"><p className="prose">{tl("Зареждане…")}</p></main></>;
  if (!session.authenticated)
    return (
      <>
        <AccountHeader session={session} />
        <main id="main" className="auth-wrap">
          <section className="auth-card">
            <span className="auth-mark" aria-hidden="true"><Icon name="users" size={26} /></span>
            <h1>{tl("Вход е необходим")}</h1>
            <p className="auth-desc">{tl("Влезте, за да управлявате своя профил и предпочитания.")}</p>
            <button className="btn btn-google btn-google-lg" onClick={() => session.login("/profile")}><GoogleG size={20} /> {tl("Продължи с Google")}</button>
            <a className="auth-secondary" href="/">{tl("Към таблото")}</a>
          </section>
        </main>
      </>
    );

  const u = session.user || {};
  const initial = (u.display_name || u.email || "?").charAt(0).toUpperCase();

  return (
    <UiTrContext.Provider value={tl}>
      <AccountHeader session={session} />
      <main id="main" className="container page profile">
        <div className="page-head"><h1>{tl("Моят профил")}</h1><p>{tl("Използва се за препоръки и филтриране. Данните се пазят в акаунта ви.")}</p></div>

        {onboarding && (
          <div className="ov-since" style={{ marginBottom: 16 }}>
            <Icon name="sparkle" size={18} />
            <p>{tl("Настройка на профила — попълнете основните полета (организация, интереси, предпочитания) и натиснете „Запази“. Може да пропуснете и да го направите по-късно.")}</p>
          </div>
        )}

        {/* 1. Обобщение */}
        <section className="prof-card">
          <div className="prof-summary">
            {u.avatar_url ? <img className="prof-avatar" src={u.avatar_url} alt="" width={64} height={64} referrerPolicy="no-referrer" /> : <span className="prof-avatar prof-initials">{initial}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="prof-name">{u.display_name || "—"}</div>
              <div className="prof-email">{u.email} <span className="verified" title={tl("Потвърден от Google")}><Icon name="check" size={12} /> {tl("потвърден")}</span></div>
              <div className="prof-completion">
                <div className="pc-bar"><div className="pc-fill" style={{ width: completion + "%" }} /></div>
                <span>{tl("Попълненост:")} <strong>{completion}%</strong></span>
              </div>
            </div>
          </div>
          <p className="chart-note"><Icon name="info" size={13} /> {tl("Имейлът и името идват от Google и не се редактират тук.")}</p>
        </section>

        {formError && <div className="auth-error" role="alert" style={{ marginBottom: 12 }}><Icon name="alert" size={18} /> {tl(formError)}</div>}

        {/* 2. Организация */}
        <Section title="Организация">
          <div className="form-grid">
            <Field label="Име на организацията"><input className="inp" value={profile.organization_name} onChange={(e) => set("organization_name", e.target.value)} /></Field>
            <Field label="Тип организация"><Select value={profile.organization_type} onChange={(v) => set("organization_type", v)} options={ORGANIZATION_TYPES} /></Field>
            <Field label={adminL.region}><Select value={regionValue} onChange={(v) => set("region", v)} options={regionOptions} /></Field>
            <Field label={adminL.municipality}><input className="inp" value={profile.municipality} onChange={(e) => set("municipality", e.target.value)} /></Field>
            <Field label="Размер"><Select value={profile.organization_size} onChange={(v) => set("organization_size", v)} options={ORG_SIZES} /></Field>
            <Field label="Брой служители"><Select value={profile.employee_count_range} onChange={(v) => set("employee_count_range", v)} options={EMPLOYEE_RANGES} /></Field>
            <Field label={`Годишен оборот (${copts.currency || "EUR"}, по избор)`}><Select value={profile.annual_revenue_range} onChange={(v) => set("annual_revenue_range", v)} options={revenueRanges(copts.currency)} /></Field>
            <Field label="Основен сектор"><Select value={profile.primary_sector} onChange={(v) => set("primary_sector", v)} options={SECTORS.map((s) => ({ key: s, label: s }))} /></Field>
          </div>
          <CheckGroup legend="Допълнителни сектори" items={SECTORS.map((s) => ({ key: s, label: s }))} selected={profile.additional_sectors} onToggle={(v) => toggleArr("additional_sectors", v)} />
        </Section>

        {/* 3. Интереси */}
        <Section title="Интереси за финансиране">
          <div className="check-cols">
            {INTERESTS.map((it) => (
              <label className="check" key={it.key}><input type="checkbox" checked={!!profile[it.key]} onChange={(e) => set(it.key, e.target.checked)} /><span>{tl(it.label)}</span></label>
            ))}
          </div>
        </Section>

        {/* 4. Предпочитания за финансиране */}
        <Section title="Предпочитания за финансиране">
          <CheckGroup legend="Предпочитани програми" items={programmeOptions} selected={profile.preferred_programs} onToggle={(v) => toggleArr("preferred_programs", v)} />
          <CheckGroup legend="Тип кандидат" items={APPLICANT_TYPES} selected={profile.applicant_types} onToggle={(v) => toggleArr("applicant_types", v)} />
          <div className="form-grid">
            <Field label="Мин. бюджет (EUR)"><input className="inp" type="number" min="0" value={profile.minimum_project_budget} onChange={(e) => set("minimum_project_budget", e.target.value)} /></Field>
            <Field label="Макс. бюджет (EUR)"><input className="inp" type="number" min="0" value={profile.maximum_project_budget} onChange={(e) => set("maximum_project_budget", e.target.value)} /></Field>
            <Field label="Макс. собствено финансиране (%)"><input className="inp" type="number" min="0" max="100" value={profile.maximum_self_financing_percentage} onChange={(e) => set("maximum_self_financing_percentage", e.target.value)} /></Field>
          </div>
          {budgetInvalid && <p className="field-err"><Icon name="alert" size={13} /> {tl("Минималният бюджет е по-голям от максималния.")}</p>}
          <CheckGroup legend="Предпочитани региони" items={regionOptions} selected={profile.preferred_regions} onToggle={(v) => toggleArr("preferred_regions", v)} />
        </Section>

        {/* 5. Известия */}
        <Section title="Известия">
          <div className="check-cols">
            <label className="check"><input type="checkbox" checked={!!prefs.change_notifications_enabled} onChange={(e) => setPref("change_notifications_enabled", e.target.checked)} /><span>{tl("Промени по запазени процедури")}</span></label>
            <label className="check"><input type="checkbox" checked={!!prefs.deadline_notifications_enabled} onChange={(e) => setPref("deadline_notifications_enabled", e.target.checked)} /><span>{tl("Наближаващи срокове")}</span></label>
            <label className="check"><input type="checkbox" checked={!!prefs.email_notifications_enabled} onChange={(e) => setPref("email_notifications_enabled", e.target.checked)} /><span>{tl("Имейл известия")}</span></label>
          </div>
          <Field label="Напомняне (дни преди срок)"><input className="inp inp-sm" type="number" min="0" max="60" value={prefs.notification_days_before} onChange={(e) => setPref("notification_days_before", e.target.value)} /></Field>
          <p className="chart-note"><Icon name="info" size={13} /> {tl("Предпочитанията се запазват, но изпращането на имейли изисква бъдеща имейл инфраструктура и все още не е активно.")}</p>
        </Section>

        {/* 5b. Език и регион */}
        <LanguageRegionSection />

        <div className="prof-actions">
          <button className="btn btn-primary" onClick={save} disabled={saving}><Icon name="check" size={16} /> {saving ? tl("Запазване…") : tl("Запази профила")}</button>
          {dirty && !saving ? (
            <div className="profile-savebar" role="status" aria-live="polite">
              <span className="psb-dot" aria-hidden="true" />
              <span>{tl("Имате незапазени промени")}</span>
              <button className="btn btn-primary btn-sm" onClick={save}>{tl("Запази профила")}</button>
            </div>
          ) : null}
          {msg && <span className="save-ok" role="status"><Icon name="check" size={16} /> {tl(msg)}</span>}
        </div>

        {/* 6. Акаунт и поверителност */}
        <Section title="Акаунт и поверителност" id="privacy">
          <p className="prose">{tl("Влезли сте като")} <strong>{u.email}</strong>. {tl("Google ни предоставя само основна идентичност; паролата ви никога не достига до нас.")}</p>
          <p className="prose">{tl("Запазените процедури и профилът се пазят в базата (Cloudflare D1), обвързани с акаунта ви. Преди вход временните запазвания живеят само в текущия браузър.")}</p>
          <div className="prof-actions prof-actions-privacy">
            <button className="btn" onClick={exportData}><Icon name="download" size={16} /> {tl("Изтегли моите данни")}</button>
            <button className="btn" onClick={() => session.logout()}><Icon name="external" size={16} /> {tl("Изход")}</button>
            <button className="btn btn-danger prof-delete" onClick={() => setConfirmDelete(true)}><Icon name="close" size={16} /> {tl("Изтрий акаунта")}</button>
          </div>
        </Section>
      </main>

      {confirmDelete && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDelete(false)}>
          <div className="confirm" role="dialog" aria-modal="true" aria-labelledby="del-title">
            <h2 id="del-title">{tl("Изтриване на акаунта")}</h2>
            <p>{tl("Това ще изтрие профила, предпочитанията и запазените ви процедури. Публичните данни за процедурите не се засягат. Действието е необратимо.")}</p>
            <div className="prof-actions">
              <button className="btn" onClick={() => setConfirmDelete(false)}>{tl("Отказ")}</button>
              <button className="btn btn-danger" onClick={doDelete}><Icon name="close" size={16} /> {tl("Изтрий окончателно")}</button>
            </div>
          </div>
        </div>
      )}
    </UiTrContext.Provider>
  );
}

function clean(p) {
  const o = { ...p };
  for (const k of ["minimum_project_budget", "maximum_project_budget", "maximum_self_financing_percentage"]) o[k] = p[k] == null ? "" : p[k];
  return o;
}
function numOrNull(v) { const n = Number(v); return v === "" || !Number.isFinite(n) ? null : Math.floor(n); }

function Section({ title, id, children }) {
  const tl = useUiTr();
  return (
    <section className="prof-card" id={id}>
      <h2 className="prof-section-title">{tl(title)}</h2>
      {children}
    </section>
  );
}
function Field({ label, children }) {
  const tl = useUiTr();
  return <label className="field"><span className="field-label">{tl(label)}</span>{children}</label>;
}
function Select({ value, onChange, options }) {
  const tl = useUiTr();
  return (
    <select className="inp" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {options.map((o) => <option key={o.key} value={o.key}>{tl(o.label)}</option>)}
    </select>
  );
}
function CheckGroup({ legend, items, selected, onToggle }) {
  const tl = useUiTr();
  return (
    <fieldset className="checkgroup">
      <legend className="field-label">{tl(legend)}</legend>
      <div className="check-cols">
        {items.map((it) => (
          <label className="check" key={it.key}><input type="checkbox" checked={(selected || []).includes(it.key)} onChange={() => onToggle(it.key)} /><span>{tl(it.label)}</span></label>
        ))}
      </div>
    </fieldset>
  );
}
