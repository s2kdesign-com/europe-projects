"use client";

// Админ таб „AI модели": доставчици (ключове), активни модели по предназначение,
// дневна процедура и AI логове. Ключовете никога не се показват — само last four.

import React, { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import { priceLabel, useForLabel, AI_PRICING_DATE } from "../lib/ai-pricing.js";
import { useUiTr } from "../lib/i18n/ui-translate.js";

// Само chat-подходящи модели за системния анализ (без audio/tts/image/и т.н.).
const NON_CHAT = /(audio|realtime|tts|transcribe|whisper|image|moderation|embedding|sora|codex|search-api|search-preview|deep-research|davinci|babbage|instruct)/;
function chatModels(models) {
  const rank = (id) => (id.startsWith("gpt-5.6") ? 0 : id.startsWith("gpt-5.5") ? 1 : id.startsWith("gpt-5.4") ? 2 : id.startsWith("gpt-5.") ? 3 : id.startsWith("gpt-5") ? 4 : id.startsWith("o") ? 5 : 6);
  return (models || [])
    .filter((m) => !NON_CHAT.test(m.id) && /^(gpt-|o\d|chat-latest)/.test(m.id) && !/\d{4}-\d{2}-\d{2}/.test(m.id))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

const fmtTs = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const PURPOSE_LABELS = {
  daily_review: "Дневен преглед", procedure_analysis: "Системен AI анализ", document_analysis: "Преглед на документи",
  budget_analysis: "Анализ на бюджети", recommendation: "Персонализирани препоръки", future_chat: "Бъдещ AI чат", fallback: "Резервен",
};
const TEST_ERRORS = {
  invalid_key: "Ключът е невалиден", model_not_available: "Няма достъп до избрания модел", rate_limited: "Rate limit — опитайте по-късно",
  provider_unavailable: "Доставчикът е недостъпен", timeout: "Изтекло време (timeout)", configuration_error: "Грешка в конфигурацията",
  invalid_key_format: "Невалиден формат на ключа", master_key_not_configured: "AI_CREDENTIALS_MASTER_KEY не е зададен (wrangler secret put)",
  not_configured: "Ключът не е конфигуриран", provider_not_configured: "Първо конфигурирайте API ключ за доставчика",
};
const errText = (code) => TEST_ERRORS[code] || ("Грешка: " + code);

async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: "same-origin", headers: { "content-type": "application/json", "X-Requested-With": "fetch" }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "error"), { code: d.error });
  return d;
}

export default function AiModelsTab() {
  const tl = useUiTr();
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => {
    api("/api/admin/ai/providers").then(setData).catch(() => setData({ providers: [], configurations: [], cryptoConfigured: false, purposes: [] }));
    api("/api/admin/ai/summary").then(setSummary).catch(() => setSummary(null));
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  if (data == null) return <section className="prof-card"><p className="prose">{tl("Зареждане…")}</p></section>;

  const cfgFor = (purpose) => data.configurations.filter((c) => c.purpose === purpose);
  const activeFor = (purpose) => cfgFor(purpose).find((c) => c.active);
  const daily = activeFor("daily_review");
  const sysAI = activeFor("procedure_analysis") || cfgFor("procedure_analysis")[0];
  const chat = activeFor("future_chat") || cfgFor("future_chat")[0];
  const t = summary?.today;
  const lastDaily = summary?.lastDailyRun;
  const lastSync = summary?.lastSyncRun;

  return (
    <>
      <div className="page-head" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{tl("AI модели")}</h2>
        <p>{tl("Управление на AI доставчиците, моделите, дневните задачи и бъдещите AI функции на системата.")}</p>
      </div>
      {msg && <div className="ov-since" role="status" style={{ marginBottom: 10 }}><Icon name="info" size={16} /><p>{msg}</p></div>}
      {!data.cryptoConfigured && (
        <div className="auth-error" role="alert" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={18} /> Cloudflare secret <code>AI_CREDENTIALS_MASTER_KEY</code> не е зададен — добавянето на API ключове е блокирано. Задайте го с <code>wrangler secret put AI_CREDENTIALS_MASTER_KEY</code>.
        </div>
      )}

      {/* Обобщение */}
      <div className="sys-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 14 }}>
        <section className="prof-card" style={{ margin: 0 }}>
          <h3 className="prof-section-title">{tl("Дневен преглед")}</h3>
          <dl className="sys-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div><dt>{tl("Модел")}</dt><dd>{daily ? `${daily.display_name}` : "—"} <span className="role-chip">Anthropic</span></dd></div>
            <div><dt>Model ID</dt><dd className="mono">{daily?.model_id || "—"}</dd></div>
            <div><dt>{tl("Управление")}</dt><dd><span className="badge amber">{tl("Управлява се от Claude Scheduled Tasks")}</span></dd></div>
            <div><dt>{tl("Последно изпълнение")}</dt><dd>{lastSync ? `${fmtTs(lastSync.started_at)} · ${lastSync.status}` : tl("Няма налични данни")}</dd></div>
            <div><dt>{tl("Реален модел (последен отчет)")}</dt><dd className="mono">{lastDaily?.model_id || tl("Няма налични данни")}</dd></div>
          </dl>
          {lastDaily && daily && lastDaily.model_id && lastDaily.model_id !== daily.model_id && (
            <p className="chart-note"><Icon name="alert" size={13} /> {tl("Реалният модел се различава от желания:")} {lastDaily.model_id} ≠ {daily.model_id}</p>
          )}
        </section>
        <section className="prof-card" style={{ margin: 0 }}>
          <h3 className="prof-section-title">{tl("Системен AI анализ")}</h3>
          <dl className="sys-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div><dt>{tl("Модел")}</dt><dd>{sysAI ? sysAI.display_name : "—"} <span className="role-chip">OpenAI</span></dd></div>
            <div><dt>Model ID</dt><dd className="mono">{sysAI?.model_id || "—"}</dd></div>
            <div><dt>{tl("Статус")}</dt><dd>{sysAI?.active && sysAI?.validation_status === "validated" ? <span className="badge green">{tl("Активен")}</span> : <span className="badge neutral">{tl("Конфигуриран (неактивен до валидация)")}</span>}</dd></div>
            <div><dt>{tl("Валидация")}</dt><dd>{sysAI?.validation_status || "—"}{sysAI?.last_validated_at ? ` · ${fmtTs(sysAI.last_validated_at)}` : ""}</dd></div>
          </dl>
        </section>
        <section className="prof-card" style={{ margin: 0 }}>
          <h3 className="prof-section-title">{tl("Бъдещ AI чат")}</h3>
          <dl className="sys-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div><dt>{tl("Статус")}</dt><dd><span className="badge neutral">{tl("Изключен")}</span> (feature flag AI_CHAT_ENABLED)</dd></div>
            <div><dt>{tl("Подготвен модел")}</dt><dd>{chat ? `${chat.display_name}` : "—"}</dd></div>
          </dl>
        </section>
        <section className="prof-card" style={{ margin: 0 }}>
          <h3 className="prof-section-title">{tl("AI заявки днес")}</h3>
          <dl className="sys-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div><dt>{tl("Успешни")}</dt><dd>{t ? (t.ok ?? 0) : tl("Няма налични данни")}</dd></div>
            <div><dt>{tl("Неуспешни")}</dt><dd>{t ? (t.failed ?? 0) : "—"}</dd></div>
            <div><dt>{tl("Токени")}</dt><dd>{t && t.tokens != null ? t.tokens : tl("Няма налични данни")}</dd></div>
            <div><dt>{tl("Средна латентност")}</dt><dd>{t && t.avg_latency != null ? Math.round(t.avg_latency) + " ms" : tl("Няма налични данни")}</dd></div>
          </dl>
        </section>
      </div>

      {/* Доставчици */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 14 }}>
        {data.providers.map((p) => (
          <ProviderCard key={p.provider_key} p={p} cryptoConfigured={data.cryptoConfigured} onChanged={load} flash={flash} />
        ))}
      </div>

      {/* Активни модели */}
      <ActiveModels data={data} onChanged={load} flash={flash} />

      {/* Вечерен AI pipeline: контроли, live статус, автоматизация */}
      <PipelinePanel data={data} flash={flash} />

      {/* Задачи (jobs) */}
      <JobsPanel flash={flash} />

      {/* Дневна процедура + логове */}
      <DailyRuns summary={summary} />
      <RunsLog />
    </>
  );
}

// ---------- Вечерен AI pipeline ----------
const RUNNABLE_PURPOSES = ["procedure_analysis", "document_analysis", "budget_analysis", "recommendation"];
const SCOPES = [
  { key: "new_and_changed", label: "Нови, променени и чакащи" },
  { key: "pending", label: "Само чакащи" },
  { key: "failed", label: "Само неуспешни" },
  { key: "all", label: "Всички допустими записи" },
  { key: "full_reanalysis", label: "Повторен анализ (независимо от промени)" },
];

// Локализирано обяснение на текущия етап.
const STAGE_DESC = {
  procedure_analysis: "Анализира новите и променени процедури, извлича срокове, кандидати, дейности и структурирана информация.",
  document_analysis: "Класифицира документите, извлича условия, приложения и промени между версиите.",
  budget_analysis: "Структурира публикуваните бюджети, разграничава общ бюджет от помощ на проект и извлича валута и съфинансиране.",
  recommendation: "Сравнява процедурите със структурирания профил и обяснява защо са подходящи.",
};
const RUN_STATUS_LABEL = {
  running: "Pipeline-ът работи", stopping: "Pipeline-ът спира", completed: "Pipeline-ът е завършен",
  partial: "Pipeline-ът е частично завършен", stopped: "Pipeline-ът е спрян", failed: "Pipeline-ът е неуспешен",
};

function PipelinePanel({ data, flash }) {
  const tl = useUiTr();
  const [pipe, setPipe] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [jobSum, setJobSum] = useState(null);
  const [modal, setModal] = useState(null); // { kind: purpose|all|pipeline|stop|stopPurpose|stats }
  const [stuck, setStuck] = useState(0);
  const load = useCallback(() => {
    api("/api/admin/ai/pipelines").then((d) => setPipe(d)).catch(() => setPipe({ pipelines: [], active: null }));
    api("/api/admin/ai/schedules").then((d) => setSchedules(d.schedules || [])).catch(() => setSchedules([]));
    api("/api/admin/ai/pipelines/active").then((d) => setStuck(d.stuck || 0)).catch(() => {});
  }, []);
  const loadJobSum = useCallback((runId) => {
    api("/api/admin/ai/jobs/summary" + (runId ? "?run=" + runId : "")).then(setJobSum).catch(() => setJobSum(null));
  }, []);
  useEffect(() => { load(); }, [load]);
  const active = pipe?.active;
  useEffect(() => { if (active) loadJobSum(active.id); }, [active?.id, loadJobSum]); // eslint-disable-line
  // Авто-refresh докато има активен run (спира при terminal статус).
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => {
      api("/api/admin/ai/pipelines").then(setPipe).catch(() => {});
      if (active.id) loadJobSum(active.id);
    }, 6000);
    return () => clearInterval(iv);
  }, [active?.id, loadJobSum]); // eslint-disable-line

  const activeCfgs = (data.configurations || []).filter((c) => RUNNABLE_PURPOSES.includes(c.purpose) && c.active);
  const running = active && (active.status === "running" || active.status === "stopping");
  const stopping = active && active.status === "stopping";
  // Брой jobs per purpose+status (за stage indicators и действия).
  const bp = jobSum?.byPurpose || [];
  const countP = (purpose, statuses) => bp.filter((r) => r.purpose === purpose && statuses.includes(r.status)).reduce((s, r) => s + r.n, 0);
  const purposeActive = (purpose) => countP(purpose, ["queued", "waiting_dependency", "running", "retry_scheduled"]) > 0;

  const progressPct = active && active.total_jobs
    ? Math.round((active.completed_jobs + active.failed_jobs + active.skipped_jobs + active.cancelled_jobs) / active.total_jobs * 100) : 0;

  return (
    <section className="prof-card">
      <div className="ov-section-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3 className="prof-section-title" style={{ margin: 0 }}>{tl("Вечерен AI pipeline")}</h3>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => setModal({ kind: "stats" })}><Icon name="info" size={14} /> {tl("Преизчисли статистиките")}</button>
          {stuck > 0 && <button className="btn btn-ghost" onClick={() => api("/api/admin/ai/jobs/recover-stuck", { method: "POST" }).then((d) => { flash(tl("Възстановени задачи") + ": " + (d.requeued + d.orphaned)); load(); })}><Icon name="alert" size={14} /> {tl("Възстанови блокираните задачи")} ({stuck})</button>}
          {!running && <button className="btn btn-ghost" onClick={() => setModal({ kind: "all" })}>{tl("Стартирай всички активни AI задачи")}</button>}
          {running ? (
            <button className="btn btn-stop" disabled={stopping} onClick={() => setModal({ kind: "stop" })}>
              <Icon name={stopping ? "clock" : "close"} size={15} /> {stopping ? tl("Спиране…") : tl("Спри вечерния AI pipeline")}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setModal({ kind: "pipeline" })}><Icon name="sparkle" size={15} /> {tl("Стартирай вечерния AI pipeline")}</button>
          )}
        </div>
      </div>

      {/* Live статус */}
      {active ? (
        <div className="ai-pipe-live">
          <div className="apl-head">
            <span className={"badge " + (stopping ? "amber" : "blue")}>{tl(RUN_STATUS_LABEL[active.status] || active.status)}</span>
            <span className="apl-stage">{tl("Етап")}: {tl(PURPOSE_LABELS[active.current_stage] || active.current_stage || "—")}</span>
            {active.test_run ? <span className="badge neutral">{tl("Тестово изпълнение")}</span> : null}
            <span className="apl-el">{fmtTs(active.started_at)}</span>
          </div>
          {active.current_stage && STAGE_DESC[active.current_stage] && (
            <p className="apl-stage-desc">{tl(STAGE_DESC[active.current_stage])}</p>
          )}
          <div className="apl-bar"><span style={{ width: `${progressPct}%` }} /></div>
          <div className="apl-nums">
            <span>{tl("Общо")}: {active.total_jobs}</span>
            <span>{tl("Готови")}: {active.completed_jobs}</span>
            <span>{tl("Чакащи")}: {active.queued_jobs}</span>
            <span>{tl("В ход")}: {active.running_jobs}</span>
            <span>{tl("Неуспешни")}: {active.failed_jobs}</span>
            <span>{tl("Пропуснати")}: {active.skipped_jobs}</span>
            <span>{progressPct}%</span>
          </div>

          {/* Stage indicators по агент */}
          <div className="apl-stages">
            {RUNNABLE_PURPOSES.map((pp) => {
              const done = countP(pp, ["completed", "skipped_unchanged"]);
              const run = countP(pp, ["running"]);
              const wait = countP(pp, ["queued", "waiting_dependency", "retry_scheduled"]);
              const fail = countP(pp, ["failed"]);
              const total = done + run + wait + fail + countP(pp, ["cancelled", "requires_review"]);
              const st = run > 0 ? "работи" : wait > 0 ? "чака" : total > 0 && fail > 0 ? "частично" : total > 0 ? "завършен" : "няма задачи";
              return (
                <div key={pp} className="apl-stage-card">
                  <div className="apl-sc-top"><b>{tl(PURPOSE_LABELS[pp])}</b> <span className={"apl-sc-st " + (run ? "on" : "")}>{tl(st)}</span></div>
                  <div className="apl-sc-nums">{done} / {total || 0} {tl("готови")} · {run} {tl("работи")} · {wait} {tl("чакат")}{fail ? ` · ${fail} ${tl("неуспешни")}` : ""}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { load(); loadJobSum(active.id); }}><Icon name="refresh" size={14} /> {tl("Обнови")}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => api(`/api/admin/ai/pipelines/${active.id}/retry-failed`, { method: "POST" }).then(() => { load(); loadJobSum(active.id); })}>{tl("Повтори неуспешните")}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => api(`/api/admin/ai/pipelines/${active.id}/cancel-pending`, { method: "POST" }).then(() => { load(); loadJobSum(active.id); })}>{tl("Отмени чакащите задачи")}</button>
          </div>
        </div>
      ) : (
        <p className="prose" style={{ color: "var(--faint)" }}>{tl("В момента няма активен pipeline.")}</p>
      )}

      {/* Действия по агент */}
      <div className="table-scroll" style={{ marginTop: 12 }}>
        <table className="admin-table">
          <thead><tr><th>{tl("Предназначение")}</th><th>{tl("Модел")}</th><th>{tl("Автоматично")}</th><th>{tl("Час")}</th><th>{tl("Действия")}</th></tr></thead>
          <tbody>
            {activeCfgs.map((c) => {
              const sch = schedules.find((s) => s.purpose === c.purpose);
              const isActive = purposeActive(c.purpose);
              const waitDep = countP(c.purpose, ["waiting_dependency"]) > 0 && countP(c.purpose, ["running", "queued"]) === 0;
              return (
                <tr key={c.purpose}>
                  <td>{tl(PURPOSE_LABELS[c.purpose] || c.purpose)}</td>
                  <td className="mono">{c.model_id}</td>
                  <td>
                    <label className="switch-sm">
                      <input type="checkbox" checked={!!sch?.automatic_enabled} onChange={(e) => api(`/api/admin/ai/schedules/${c.purpose}`, { method: "PATCH", body: JSON.stringify({ automatic_enabled: e.target.checked ? 1 : 0 }) }).then(load).catch(() => flash(tl("Неуспешна промяна")))} />
                      <span>{sch?.automatic_enabled ? tl("Включено") : tl("Изключено")}</span>
                    </label>
                  </td>
                  <td>{sch?.preferred_time || "—"} <span className="row-sub">{sch?.timezone || "Europe/Sofia"}</span></td>
                  <td>
                    {waitDep ? <span className="row-sub">{tl("Изчаква зависимост")}</span>
                      : isActive ? <button className="btn btn-stop btn-sm" onClick={() => setModal({ kind: "stopPurpose", purpose: c.purpose, runId: active.id })}>{tl("Спри")}</button>
                      : <button className="btn btn-ghost btn-sm" disabled={running} onClick={() => setModal({ kind: "purpose", purpose: c.purpose })}>{tl("Стартирай сега")}</button>}
                  </td>
                </tr>
              );
            })}
            <tr style={{ opacity: 0.55 }}>
              <td>{tl(PURPOSE_LABELS.future_chat)}</td><td className="mono">—</td>
              <td><span className="badge neutral">{tl("Изключено")}</span></td><td>—</td>
              <td><span className="row-sub">{tl("Неактивен (feature flag)")}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      {modal?.kind === "stats" && <StatsModal onClose={() => setModal(null)} onDone={() => { setModal(null); flash(tl("Статистиките са преизчислени.")); }} flash={flash} tl={tl} />}
      {modal?.kind === "stop" && <StopModal active={active} jobSum={jobSum} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} tl={tl} flash={flash} />}
      {modal?.kind === "stopPurpose" && <StopPurposeModal modal={modal} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); loadJobSum(active?.id); }} tl={tl} flash={flash} />}
      {(modal?.kind === "purpose" || modal?.kind === "all" || modal?.kind === "pipeline") && <ScopeModal modal={modal} data={data} onClose={() => setModal(null)} onStarted={() => { setModal(null); load(); flash(tl("Задачата е стартирана.")); }} flash={flash} />}
    </section>
  );
}

// Обяснение „Какво се преизчислява?“ + безопасно преизчисляване без AI разход.
function StatsModal({ onClose, onDone, flash, tl }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { const d = await api("/api/admin/ai/recompute-aggregates", { method: "POST" }); onDone(); flash(tl("Преизчислени за") + " " + d.recomputed + " " + tl("държави")); }
    catch { flash(tl("Неуспешно преизчисляване")); setBusy(false); }
  };
  return (
    <div className="overlay" style={{ zIndex: 80 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" style={{ maxWidth: 520 }}>
        <h3 style={{ marginTop: 0 }}>{tl("Какво се преизчислява?")}</h3>
        <p className="prose">{tl("Агрегатите (статистиките) са обобщени стойности, изчислени от вече записаните процедури, документи, бюджети, източници и AI анализи. Използват се за по-бързо зареждане на Обзор, картата на Европа, „Относно системата“, броячите и диаграмите.")}</p>
        <ul className="stats-cats">
          <li><b>{tl("Процедури")}</b>: {tl("общ брой, активни, предстоящи, приключени, нови, променени")}</li>
          <li><b>{tl("Документи")}</b>: {tl("процедури с документи, общ брой, за проверка")}</li>
          <li><b>{tl("Бюджети")}</b>: {tl("общ публикуван бюджет, по държави, валидни структурирани записи")}</li>
          <li><b>{tl("Източници")}</b>: {tl("официални, активни, здрави, неуспешни")}</li>
          <li><b>{tl("Публични статистики")}</b>: {tl("Обзор, снапшоти по държави и Европа, /about, /sources, footer")}</li>
        </ul>
        <p className="scope-warn" style={{ color: "var(--green, #12764f)" }}><Icon name="check" size={14} /> {tl("Преизчисляването НЕ изпраща нови заявки към AI моделите и не води до разход за tokens.")}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose}>{tl("Отказ")}</button>
          <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? tl("Преизчисляване…") : tl("Преизчисли статистиките")}</button>
        </div>
      </div>
    </div>
  );
}

function StopModal({ active, jobSum, onClose, onDone, tl, flash }) {
  const [busy, setBusy] = useState(false);
  const s = jobSum?.byStatus || {};
  const pending = (s.queued || 0) + (s.waiting_dependency || 0) + (s.retry_scheduled || 0);
  const stop = async (cancelPending) => {
    setBusy(true);
    try { await api(`/api/admin/ai/pipelines/${active.id}/stop`, { method: "POST", body: JSON.stringify({ cancelPending }) }); onDone(); flash(tl("Pipeline-ът се спира.")); }
    catch { flash(tl("Неуспешно спиране")); setBusy(false); }
  };
  return (
    <div className="overlay" style={{ zIndex: 80 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>{tl("Спиране на вечерния AI pipeline")}</h3>
        <p className="prose">{tl("Новите и чакащите задачи ще бъдат отменени. Заявките, които вече са изпратени към AI доставчик, не могат винаги да бъдат прекъснати незабавно и ще приключат безопасно.")}</p>
        <div className="scope-est">
          <div>{tl("Изпълняващи се")}: <b>{s.running || 0}</b></div>
          <div>{tl("Чакащи")}: <b>{pending}</b></div>
          <div>{tl("Завършени")}: <b>{s.completed || 0}</b></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary" disabled={busy} onClick={() => stop(false)}>{tl("Спри след текущата задача")}</button>
          <button className="btn btn-stop" disabled={busy} onClick={() => stop(true)}>{tl("Отмени всички чакащи задачи")}</button>
          <button className="btn btn-ghost" onClick={onClose}>{tl("Продължи pipeline-а")}</button>
        </div>
      </div>
    </div>
  );
}

function StopPurposeModal({ modal, onClose, onDone, tl, flash }) {
  const [busy, setBusy] = useState(false);
  const stop = async () => {
    setBusy(true);
    try { await api(`/api/admin/ai/pipelines/${modal.runId}/stop-purpose`, { method: "POST", body: JSON.stringify({ purpose: modal.purpose }) }); onDone(); flash(tl("Агентът е спрян.")); }
    catch { flash(tl("Неуспешно спиране")); setBusy(false); }
  };
  return (
    <div className="overlay" style={{ zIndex: 80 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" style={{ maxWidth: 440 }}>
        <h3 style={{ marginTop: 0 }}>{tl("Спиране на агент")}: {tl(PURPOSE_LABELS[modal.purpose] || modal.purpose)}</h3>
        <p className="prose">{tl("Чакащите задачи на този агент ще бъдат отменени. Зависимите следващи агенти няма да продължат за незавършените записи.")}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose}>{tl("Отказ")}</button>
          <button className="btn btn-stop" disabled={busy} onClick={stop}>{busy ? tl("Спиране…") : tl("Спри агента")}</button>
        </div>
      </div>
    </div>
  );
}

function ScopeModal({ modal, data, onClose, onStarted, flash }) {
  const tl = useUiTr();
  const [scope, setScope] = useState("new_and_changed");
  const [country, setCountry] = useState("");
  const [est, setEst] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testRun, setTestRun] = useState(true);
  const purpose = modal.kind === "purpose" ? modal.purpose : "procedure_analysis";
  useEffect(() => {
    const qs = new URLSearchParams({ scope }); if (country) qs.set("country", country);
    api(`/api/admin/ai/purposes/${purpose}/estimate?` + qs).then(setEst).catch(() => setEst(null));
  }, [purpose, scope, country]);
  const title = modal.kind === "pipeline" ? tl("Стартирай вечерния AI pipeline") : modal.kind === "all" ? tl("Стартирай всички активни AI задачи") : tl(PURPOSE_LABELS[purpose] || purpose);
  const start = async () => {
    setBusy(true);
    try {
      const body = JSON.stringify({ scope, country: country || null, testRun });
      if (modal.kind === "purpose") await api(`/api/admin/ai/purposes/${purpose}/start`, { method: "POST", body });
      else await api("/api/admin/ai/pipelines/start", { method: "POST", body });
      onStarted();
    } catch (e) {
      flash(e.code === "daily_review_running" ? tl("Изчакайте дневният преглед да приключи") : tl("Неуспешно стартиране"));
      setBusy(false);
    }
  };
  return (
    <div className="overlay" style={{ zIndex: 80 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" style={{ maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <label className="fld-label">{tl("Обхват")}</label>
        <select className="inp" value={scope} onChange={(e) => setScope(e.target.value)}>
          {SCOPES.map((s) => <option key={s.key} value={s.key}>{tl(s.label)}</option>)}
        </select>
        <label className="fld-label" style={{ marginTop: 10 }}>{tl("Държава (по избор)")}</label>
        <select className="inp" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">{tl("Всички държави")}</option>
          {(data.configurations ? [] : []).map(() => null)}
          {["BG", "RO", "GR", "PL", "HR", "CZ", "PT", "SK", "HU", "SI", "IT", "ES", "DE", "FR", "LT", "LV", "EE", "NL", "BE", "SE", "FI", "AT", "IE", "DK", "CY", "MT", "LU"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="scope-est">
          <div><b>{est ? est.eligible : "—"}</b> {tl("допустими записа")}</div>
          {est?.model && <div className="row-sub">{tl("Модел")}: {est.model.model_id} · {est.model.provider_key}</div>}
          {est?.deps?.length ? <div className="row-sub">{tl("Зависимости")}: {est.deps.map((d) => tl(PURPOSE_LABELS[d] || d)).join(", ")}</div> : null}
          {scope === "full_reanalysis" && <div className="scope-warn"><Icon name="alert" size={14} /> {tl("Повторна обработка на вече анализирани записи.")}</div>}
        </div>
        <label className="test-mode">
          <input type="checkbox" checked={testRun} onChange={(e) => setTestRun(e.target.checked)} />
          <span>{tl("Тестово изпълнение с малък набор (до 3 записа)")}</span>
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose}>{tl("Отказ")}</button>
          <button className="btn btn-primary" disabled={busy} onClick={start}>{busy ? tl("Стартиране…") : (testRun ? tl("Стартирай тест") : tl("Стартирай"))}</button>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ p, cryptoConfigured, onChanged, flash }) {
  const tl = useUiTr();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const configured = p.credential_status === "configured";

  const saveKey = async () => {
    if (configured && !confirm("Старият ключ ще бъде заменен и няма да може да бъде възстановен. Продължавате ли?")) return;
    setBusy(true); setTestResult(null);
    try { const r = await api(`/api/admin/ai/providers/${p.provider_key}/key`, { method: "POST", body: JSON.stringify({ key }) }); setKey(""); flash(`Ключът е записан (••••${r.lastFour}). Връзката е успешна.`); onChanged(); }
    catch (e) { setTestResult({ ok: false, code: e.code }); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setTestResult(null);
    try { const r = await api(`/api/admin/ai/providers/${p.provider_key}/test`, { method: "POST" }); setTestResult({ ok: true, latency: r.latency }); onChanged(); }
    catch (e) { setTestResult({ ok: false, code: e.code }); }
    finally { setBusy(false); }
  };
  const removeKey = async () => {
    if (!confirm(tl("Ключът ще бъде премахнат, доставчикът — деактивиран, а зависимите модели ще станат unavailable. Продължавате ли?"))) return;
    setBusy(true);
    try { await api(`/api/admin/ai/providers/${p.provider_key}/key`, { method: "DELETE" }); flash(tl("Ключът е премахнат.")); onChanged(); }
    catch (e) { flash(tl(errText(e.code))); }
    finally { setBusy(false); }
  };

  return (
    <section className="prof-card" style={{ margin: 0 }}>
      <div className="ov-section-head"><h3 className="prof-section-title" style={{ margin: 0 }}>{p.display_name}</h3>
        {configured ? <span className="badge green">{tl("Конфигуриран")}</span> : <span className="badge neutral">{tl("API ключът не е конфигуриран")}</span>}
        {p.connection_status === "ok" && <span className="badge blue">{tl("Връзка OK")}</span>}
        {p.connection_status === "error" && <span className="badge red">{tl("Грешка при връзка")}</span>}
      </div>
      <dl className="sys-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><dt>{tl("Ключ")}</dt><dd className="mono">{configured && p.credential ? `•••• ${p.credential.lastFour || ""}` : "—"}</dd></div>
        <div><dt>{tl("Последна смяна")}</dt><dd>{p.credential ? fmtTs(p.credential.rotatedAt || p.credential.updatedAt) : "—"}</dd></div>
        <div><dt>{tl("Последен тест")}</dt><dd>{p.last_tested_at ? `${fmtTs(p.last_tested_at)} · ${p.last_test_status}` : "—"}</dd></div>
        <div><dt>{tl("Модели (кеш)")}</dt><dd>{p.available_models ? `${p.available_models.length} · ${fmtTs(p.models_refreshed_at)}` : "—"}</dd></div>
      </dl>
      <label className="field" style={{ marginTop: 8 }}>
        <span className="field-label">{p.display_name} API key</span>
        <span style={{ display: "flex", gap: 6 }}>
          <input className="inp" type={show ? "text" : "password"} value={key} placeholder={tl("Въведете нов API ключ")} autoComplete="off" name={"new-ai-key-" + p.provider_key} onChange={(e) => setKey(e.target.value)} />
          {key && <button type="button" className="btn btn-ghost" onClick={() => setShow((v) => !v)} aria-label={show ? tl("Скрий") : tl("Покажи")}>{show ? tl("Скрий") : tl("Покажи")}</button>}
        </span>
      </label>
      <div className="prof-actions" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-primary" disabled={busy || !key || !cryptoConfigured} onClick={saveKey}><Icon name="check" size={15} /> {configured ? tl("Замени ключа") : tl("Запази")}</button>
        <button className="btn" disabled={busy || !configured} onClick={test}><Icon name="refresh" size={15} /> {tl("Провери връзката")}</button>
        {configured && <button className="btn btn-danger" disabled={busy} onClick={removeKey}><Icon name="close" size={15} /> {tl("Премахни ключа")}</button>}
      </div>
      <p role="status" aria-live="polite" style={{ margin: "6px 0 0", minHeight: 18 }}>
        {testResult && (testResult.ok
          ? <span className="save-ok"><Icon name="check" size={14} /> {tl("Успешна връзка")}{testResult.latency ? ` · ${testResult.latency} ms` : ""}</span>
          : <span className="badge red">{tl(errText(testResult.code))}</span>)}
      </p>
    </section>
  );
}

function ActiveModels({ data, onChanged, flash }) {
  const tl = useUiTr();
  const [purpose, setPurpose] = useState("procedure_analysis");
  const [provider, setProvider] = useState("openai");
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const prov = data.providers.find((p) => p.provider_key === provider);
  // OpenAI: всички chat-подходящи модели (5.6 нива първи, после 5.5, 5.4…), с цена.
  const list = provider === "openai" ? chatModels(prov?.available_models) : (prov?.available_models || []);

  const refreshModels = async () => {
    setBusy(true);
    try { await api(`/api/admin/ai/providers/${provider}/models/refresh`, { method: "POST" }); flash(tl("Списъкът с модели е обновен.")); onChanged(); }
    catch (e) { flash(tl(errText(e.code))); }
    finally { setBusy(false); }
  };
  const apply = async (activate) => {
    setBusy(true);
    try {
      const m = list.find((x) => x.id === modelId);
      await api(`/api/admin/ai/configurations/${purpose}`, { method: "PATCH", body: JSON.stringify({ provider_key: provider, model_id: modelId, display_name: displayName || (m ? m.displayName : modelId), model_family: m?.family || null, model_tier: m?.tier || null, activate }) });
      flash(activate ? tl("Моделът е активиран.") : tl("Конфигурацията е записана (неактивна)."));
      onChanged();
    } catch (e) { flash(tl(errText(e.code))); }
    finally { setBusy(false); }
  };

  return (
    <section className="prof-card">
      <h3 className="prof-section-title">{tl("Активни AI модели")}</h3>
      <p className="prose">Този модел се използва за ежедневната проверка и анализ на процедурите, когато Scheduled Task архитектурата позволява изборът да се управлява от системата. Дневният преглед носи бадж „Управлява се от Claude Scheduled Tasks“ — изборът тук е desired модел и не се прилага автоматично върху задачата.</p>
      <div className="table-scroll">
        <table className="admin-table">
          <thead><tr><th>{tl("Предназначение")}</th><th>{tl("Доставчик")}</th><th>{tl("Модел (display)")}</th><th>Model ID</th><th>{tl("Цена (~1M)")}</th><th>{tl("Статус")}</th><th>{tl("Валидация")}</th><th>{tl("Използван")}</th></tr></thead>
          <tbody>
            {Object.keys(PURPOSE_LABELS).filter((k) => k !== "fallback").map((k) => {
              const rows = data.configurations.filter((c) => c.purpose === k);
              if (!rows.length) return <tr key={k}><td>{tl(PURPOSE_LABELS[k])}</td><td colSpan={7} className="row-sub">{tl("Няма конфигурация (наследява системния модел)")}</td></tr>;
              return rows.map((c) => {
                const u = (data.usage || []).find((x) => x.model_id === c.model_id);
                return (
                  <tr key={c.id}>
                    <td>{tl(PURPOSE_LABELS[k])}{k === "daily_review" ? <div className="row-sub"><span className="badge amber">Claude Scheduled Tasks</span></div> : null}</td>
                    <td>{c.provider_key === "anthropic" ? "Anthropic" : "OpenAI"}</td>
                    <td>{c.display_name}</td>
                    <td className="mono">{c.model_id}</td>
                    <td className="nowrap">{priceLabel(c.model_id) || "—"}</td>
                    <td>{c.active ? <span className="badge green">{tl("Активен")}</span> : <span className="badge neutral">{tl("Неактивен")}</span>}</td>
                    <td>{c.validation_status}</td>
                    <td className="nowrap">{u ? <>{u.runs} {tl("заявки")}{u.tokens ? <div className="row-sub">{u.tokens} {tl("токена")}</div> : null}<div className="row-sub">{fmtTs(u.last_used_at)}</div></> : "—"}</td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      <h4 style={{ margin: "16px 0 8px" }}>{tl("Смени модела")}</h4>
      <div className="form-grid">
        <label className="field"><span className="field-label">{tl("Предназначение")}</span>
          <select className="inp" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {Object.keys(PURPOSE_LABELS).filter((k) => k !== "fallback").map((k) => <option key={k} value={k}>{tl(PURPOSE_LABELS[k])}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">{tl("Доставчик")}</span>
          <select className="inp" value={provider} onChange={(e) => { setProvider(e.target.value); setModelId(""); }}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label className="field"><span className="field-label">{tl("Модел (от реално достъпните)")}</span>
          <select className="inp" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            <option value="">{tl("— изберете —")}</option>
            {provider === "anthropic" && !list.length && <option value="claude-opus-4-8">claude-opus-4-8 (Claude Opus 4.8)</option>}
            {list.map((m) => {
              const price = priceLabel(m.id);
              return <option key={m.id} value={m.id}>{m.id}{m.tier ? ` · ${m.tier}` : ""}{price ? ` · ~${price}` : ""}</option>;
            })}
          </select>
        </label>
        <label className="field"><span className="field-label">Display name (не се превежда)</span>
          <input className="inp" value={displayName} placeholder="напр. GPT-5.6" onChange={(e) => setDisplayName(e.target.value)} />
        </label>
      </div>
      {modelId && (priceLabel(modelId) || useForLabel(modelId)) && (
        <div className="ov-since" style={{ margin: "8px 0" }}>
          <Icon name="info" size={16} />
          <p>
            <strong>{modelId}</strong>
            {priceLabel(modelId) ? <> · ~{priceLabel(modelId)} (вход/изход)</> : null}
            {useForLabel(modelId) ? <><br />{tl(useForLabel(modelId))}</> : null}
          </p>
        </div>
      )}
      <div className="prof-actions" style={{ flexWrap: "wrap" }}>
        <button className="btn" disabled={busy} onClick={refreshModels}><Icon name="refresh" size={15} /> {tl("Обнови списъка с модели")}</button>
        <button className="btn" disabled={busy || !modelId} onClick={() => apply(false)}>{tl("Запази (неактивен)")}</button>
        <button className="btn btn-primary" disabled={busy || !modelId} onClick={() => apply(true)}><Icon name="check" size={15} /> {tl("Активирай модела")}</button>
      </div>
      <p className="chart-note"><Icon name="info" size={13} /> Активирането валидира точния model ID срещу доставчика. GPT-5.6 има нива (Sol/Terra/Luna) — изберете реално достъпния ID от списъка, не предполагаем. Цените са приблизителна стойност за ориентир (вход/изход за 1M токена, към {AI_PRICING_DATE}) — не са фактура.</p>
    </section>
  );
}

function DailyRuns({ summary }) {
  const tl = useUiTr();
  const s = summary?.lastSyncRun;
  const cursor = summary?.cursor;
  const BADGE = { completed: ["green", "Успешно"], success: ["green", "Успешно"], partial: ["amber", "Частично"], running: ["blue", "В процес"], error: ["red", "Неуспешно"], blocked: ["red", "Блокирано"], skipped: ["neutral", "Пропуснато"] };
  const b = s ? (BADGE[s.status] || ["neutral", s.status]) : null;
  return (
    <section className="prof-card">
      <h3 className="prof-section-title">{tl("Дневна процедура")}</h3>
      {!s ? <p className="prose">{tl("Няма налични данни")}</p> : (
        <dl className="sys-grid">
          <div><dt>{tl("Статус")}</dt><dd><span className={"badge " + b[0]}>{b[1]}</span></dd></div>
          <div><dt>{tl("График")}</dt><dd>{tl("Всеки ден в 08:00 (Claude Scheduled Tasks)")}</dd></div>
          <div><dt>{tl("Последно изпълнение")}</dt><dd>{fmtTs(s.started_at)} — {fmtTs(s.completed_at)}</dd></div>
          <div><dt>{tl("Държави (начало → край)")}</dt><dd>{s.start_country_code || "—"} → {s.end_country_code || "—"} · {tl("следваща")}: {s.continuation_country_code || "—"}</dd></div>
          <div><dt>{tl("Обработени източници")}</dt><dd>{s.sources_attempted ?? "—"} ({tl("успешни")}: {s.sources_succeeded ?? "—"})</dd></div>
          <div><dt>{tl("Записи")}</dt><dd>видени {s.records_seen ?? 0} · нови {s.records_inserted ?? 0} · обновени {s.records_updated ?? 0} · непроменени {s.records_unchanged ?? 0} · невалидни {s.records_invalid ?? 0}</dd></div>
          <div><dt>{tl("Цикъл")}</dt><dd>№{s.cycle_number ?? "—"} {cursor ? `· завършени ${cursor.completed_countries_in_cycle}/${cursor.total_countries_in_cycle || "?"}` : ""}</dd></div>
          <div><dt>{tl("Резюме")}</dt><dd style={{ fontSize: 13 }}>{s.safe_summary || "—"}</dd></div>
        </dl>
      )}
    </section>
  );
}

function RunsLog() {
  const tl = useUiTr();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fSource, setFSource] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [expanded, setExpanded] = useState(null);
  const PAGE = 10;
  const load = useCallback(() => {
    const qs = new URLSearchParams({ limit: String(PAGE), offset: String((page - 1) * PAGE) });
    if (fSource) qs.set("source", fSource);
    if (fStatus) qs.set("status", fStatus);
    api("/api/admin/ai/runs?" + qs).then((d) => { setRows(d.runs || []); setTotal(d.total || 0); setExpanded(null); }).catch(() => { setRows([]); setTotal(0); });
  }, [page, fSource, fStatus]);
  useEffect(() => { load(); }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <section className="prof-card">
      <div className="ov-section-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3 className="prof-section-title" style={{ margin: 0 }}>{tl("AI логове")}</h3>
        <span className="count-dot">{total}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <select className="inp inp-sm" value={fSource} onChange={(e) => { setFSource(e.target.value); setPage(1); }} aria-label="Източник на изпълнение">
            <option value="">{tl("Всички източници")}</option>
            {["claude_scheduled_task", "worker_api", "admin_manual", "ingestion_pipeline", "future_chat"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="inp inp-sm" value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }} aria-label="Статус">
            <option value="">{tl("Всички статуси")}</option>
            {["success", "partial", "error", "blocked"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={load}><Icon name="refresh" size={15} /> {tl("Обнови")}</button>
        </div>
      </div>
      {rows == null ? <p className="prose">{tl("Зареждане…")}</p> : rows.length === 0 ? (
        <div className="state ov-empty"><Icon name="sparkle" size={26} /><h3>{tl("Няма AI логове")}</h3><p>{tl("Тук се записват дневните прегледи и runtime AI заявките (без prompts и без отговори).")}</p></div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>{tl("Дата")}</th><th>{tl("Предназначение")}</th><th>{tl("Източник")}</th><th>{tl("Държава")}</th><th>{tl("Модел")}</th><th>{tl("Статус")}</th><th>{tl("Време")}</th><th>{tl("Токени")}</th><th>{tl("Резултат")}</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const summary = resultText(r, tl);
                  const canExpand = !!r.has_details;
                  const open = expanded === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={open ? "log-row-open" : ""}>
                        <td className="nowrap">{fmtTs(r.started_at)}</td>
                        <td>{tl(PURPOSE_LABELS[r.purpose] || r.purpose)}</td>
                        <td className="mono">{r.execution_source || "—"}</td>
                        <td>{r.country_code || "—"}</td>
                        <td className="mono" title={r.model_id || ""}>{r.model_id || "—"}</td>
                        <td>{r.status === "success" || r.status === "completed" ? <span className="badge green">{tl("Успешно")}</span> : r.status === "error" || r.status === "failed" ? <span className="badge red">{tl("Грешка")}</span> : <span className="badge neutral">{r.status}</span>}</td>
                        <td>{r.duration_ms != null ? r.duration_ms + " ms" : "—"}</td>
                        <td>{r.input_tokens != null || r.output_tokens != null ? `${r.input_tokens ?? 0}/${r.output_tokens ?? 0}` : "—"}</td>
                        <td className="log-result-cell">
                          <span className="log-result-txt">{summary}</span>
                          {canExpand && (
                            <button className="log-expand" aria-expanded={open} aria-controls={`logd-${r.id}`}
                              aria-label={open ? tl("Скрий подробностите за AI изпълнението") : tl("Покажи подробности за AI изпълнението")}
                              onClick={() => setExpanded(open ? null : r.id)}>
                              <Icon name={open ? "chevronDown" : "arrowRight"} size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="log-detail-row"><td colSpan={9} id={`logd-${r.id}`}><LogDetail id={r.id} tl={tl} /></td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > PAGE && (
            <div className="admin-pager">
              <span className="pg-info">{(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} {tl("от")} {total}</span>
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tl("Предишна")}</button>
              <span className="pg-info" style={{ margin: 0 }}>{tl("стр.")} {page} / {pages}</span>
              <button className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tl("Следваща")}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Детерминистичен текст за колоната „Резултат" (използва result_summary; fallback
// към старите daily_review броячи; „—" само когато наистина няма нищо).
function resultText(r, tl) {
  if (r.result_summary) return r.result_summary;
  if (r.status === "error" || r.status === "failed") return r.safe_error_summary ? "Неуспешно: " + r.safe_error_summary : tl("Неуспешно");
  if (r.procedures_reviewed != null) return `${tl("процедури")}: ${r.procedures_reviewed}, ${tl("промени")}: ${r.changes_detected ?? 0}`;
  return "—";
}

// Разгъващ се detail ред: зарежда safe подробностите от detail endpoint-а.
function LogDetail({ id, tl }) {
  const [state, setState] = useState({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    fetch(`/api/admin/ai/runs/${id}`, { credentials: "same-origin", signal: ac.signal, headers: { "X-Requested-With": "fetch" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => { if (alive) setState({ phase: "ready", run: d.run, details: d.details }); })
      .catch((e) => { if (alive && e.name !== "AbortError") setState({ phase: "error" }); });
    return () => { alive = false; ac.abort(); };
  }, [id]);

  if (state.phase === "loading") return <div className="log-detail skel"><div className="sk-line" /><div className="sk-line" /><div className="sk-line short" /></div>;
  if (state.phase === "error") return <div className="log-detail err">{tl("Подробностите временно не могат да бъдат заредени.")}</div>;
  const { run, details } = state;
  const ex = details?.execution || {};
  const sc = details?.scope || {};
  const items = details?.items || [];
  return (
    <div className="log-detail">
      <div className="ld-grid">
        <div className="ld-sec">
          <h4>{tl("Обобщение")}</h4>
          <dl>
            <div><dt>{tl("Резултат")}</dt><dd>{run.result_summary || "—"}</dd></div>
            <div><dt>{tl("Предназначение")}</dt><dd>{tl(PURPOSE_LABELS[run.purpose] || run.purpose)}</dd></div>
            <div><dt>{tl("Доставчик / Модел")}</dt><dd className="mono">{run.provider_key} · {run.model_id}</dd></div>
            <div><dt>{tl("Държава")}</dt><dd>{run.country_code || "—"}</dd></div>
            <div><dt>{tl("Старт / Край")}</dt><dd>{fmtTs(run.started_at)} → {fmtTs(run.completed_at)}</dd></div>
            <div><dt>{tl("Статус")}</dt><dd>{run.status}</dd></div>
          </dl>
        </div>
        <div className="ld-sec">
          <h4>{tl("Обработени записи")}</h4>
          <dl>
            <div><dt>{tl("Заявени")}</dt><dd>{sc.requested ?? "—"}</dd></div>
            <div><dt>{tl("Обработени")}</dt><dd>{sc.processed ?? "—"}</dd></div>
            <div><dt>{tl("Успешни")}</dt><dd>{sc.completed ?? "—"}</dd></div>
            <div><dt>{tl("Неуспешни")}</dt><dd>{sc.failed ?? "—"}</dd></div>
            <div><dt>{tl("Изискват проверка")}</dt><dd>{run.result_requires_review_count ?? "—"}</dd></div>
          </dl>
        </div>
        <div className="ld-sec">
          <h4>{tl("Използване")}</h4>
          <dl>
            <div><dt>{tl("Входни токени")}</dt><dd>{ex.inputTokens ?? run.input_tokens ?? "—"}</dd></div>
            <div><dt>{tl("Изходни токени")}</dt><dd>{ex.outputTokens ?? run.output_tokens ?? "—"}</dd></div>
            <div><dt>{tl("Време")}</dt><dd>{ex.durationMs ?? run.duration_ms ?? "—"} ms</dd></div>
            <div><dt>{tl("Опити")}</dt><dd>{(ex.retryCount ?? 0) + 1}</dd></div>
            <div><dt>{tl("Prompt версия")}</dt><dd className="mono">{ex.promptVersion || "—"}</dd></div>
            {ex.fallbackModel && <div><dt>{tl("Резервен модел")}</dt><dd className="mono">{ex.fallbackModel}</dd></div>}
          </dl>
        </div>
      </div>
      {items.length > 0 && (
        <div className="ld-items">
          <h4>{tl("Засегнати записи")}</h4>
          <ul>
            {items.map((it, i) => (
              <li key={i}>
                <span className="ldi-cc">{it.countryCode || ""}</span>
                <a className="ldi-title" href={`/procedures/${encodeURIComponent(it.entityId)}`} target="_blank" rel="noopener noreferrer">{it.title || it.entityId}</a>
                {it.summary ? <span className="ldi-sum">{it.summary}</span> : null}
                <span className={"badge " + (it.requiresReview ? "amber" : "green")}>{it.status}</span>
              </li>
            ))}
          </ul>
          {details.itemsTruncated && <p className="row-sub">{tl("Показани са първите записи.")}</p>}
        </div>
      )}
      {(run.safe_error_summary || (details?.safeErrors || []).length > 0) && (
        <div className="ld-errors">
          <h4>{tl("Предупреждения и грешки")}</h4>
          <p>{run.safe_error_summary || (details.safeErrors || []).join("; ")} {run.error_code ? `(${run.error_code})` : ""}</p>
        </div>
      )}
    </div>
  );
}

// ---------- Задачи (jobs) ----------
const JOB_STATUS = {
  queued: { label: "Готова", tone: "blue" },
  waiting_dependency: { label: "Изчаква зависимост", tone: "neutral" },
  running: { label: "Изпълнява се", tone: "blue" },
  completed: { label: "Завършена", tone: "green" },
  skipped_unchanged: { label: "Пропусната — без промяна", tone: "neutral" },
  retry_scheduled: { label: "Ще бъде повторена", tone: "amber" },
  failed: { label: "Неуспешна", tone: "red" },
  cancelled: { label: "Отменена", tone: "neutral" },
  requires_review: { label: "Изисква проверка", tone: "amber" },
  blocked_configuration: { label: "Липсва конфигурация", tone: "red" },
  blocked_dependency: { label: "Блокирана от предишна задача", tone: "neutral" },
};
const JOB_PAGE = 15;

function JobsPanel({ flash }) {
  const tl = useUiTr();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState(null);
  const [page, setPage] = useState(1);
  const [fPurpose, setFPurpose] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCountry, setFCountry] = useState("");
  const load = useCallback(() => {
    const qs = new URLSearchParams({ limit: String(JOB_PAGE), offset: String((page - 1) * JOB_PAGE) });
    if (fPurpose) qs.set("purpose", fPurpose);
    if (fStatus) qs.set("status", fStatus);
    if (fCountry) qs.set("country", fCountry);
    api("/api/admin/ai/jobs?" + qs).then((d) => { setRows(d.jobs || []); setTotal(d.total || 0); }).catch(() => { setRows([]); setTotal(0); });
    api("/api/admin/ai/jobs/summary").then(setSum).catch(() => setSum(null));
  }, [page, fPurpose, fStatus, fCountry]);
  useEffect(() => { load(); }, [load]);
  const pages = Math.max(1, Math.ceil(total / JOB_PAGE));
  const s = sum?.byStatus || {};

  return (
    <section className="prof-card">
      <div className="ov-section-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3 className="prof-section-title" style={{ margin: 0 }}>{tl("Задачи")}</h3>
        <span className="count-dot">{sum?.total ?? 0}</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={load}><Icon name="refresh" size={14} /> {tl("Обнови")}</button>
      </div>

      {/* Summary карти */}
      <div className="jobs-sum">
        {[["queued", "Готови"], ["waiting_dependency", "Изчакват"], ["running", "Изпълняват се"], ["completed", "Завършени"], ["skipped_unchanged", "Пропуснати"], ["failed", "Неуспешни"], ["cancelled", "Отменени"], ["requires_review", "За проверка"]].map(([k, lbl]) => (
          <div key={k} className="jobs-sum-card"><span className="jsc-n">{s[k] || 0}</span><span className="jsc-l">{tl(lbl)}</span></div>
        ))}
      </div>
      {sum && <p className="row-sub" style={{ margin: "4px 0 10px" }}>{sum.terminal} / {sum.total} {tl("приключени")} · {sum.percent}%</p>}

      {/* Филтри */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <select className="inp inp-sm" value={fPurpose} onChange={(e) => { setFPurpose(e.target.value); setPage(1); }} aria-label={tl("Предназначение")}>
          <option value="">{tl("Всички предназначения")}</option>
          {RUNNABLE_PURPOSES.map((p) => <option key={p} value={p}>{tl(PURPOSE_LABELS[p])}</option>)}
        </select>
        <select className="inp inp-sm" value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }} aria-label={tl("Статус")}>
          <option value="">{tl("Всички статуси")}</option>
          {Object.keys(JOB_STATUS).map((st) => <option key={st} value={st}>{tl(JOB_STATUS[st].label)}</option>)}
        </select>
        <select className="inp inp-sm" value={fCountry} onChange={(e) => { setFCountry(e.target.value); setPage(1); }} aria-label={tl("Държава")}>
          <option value="">{tl("Всички държави")}</option>
          {["BG", "RO", "GR", "PL", "HR", "CZ", "PT", "SK", "HU", "SI", "IT", "ES", "DE", "FR", "LT", "LV", "EE", "NL", "BE", "SE", "FI", "AT", "IE", "DK", "CY", "MT", "LU"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {rows == null ? <p className="prose">{tl("Зареждане…")}</p> : rows.length === 0 ? (
        <div className="state ov-empty"><Icon name="sparkle" size={24} /><h3>{tl("Няма задачи")}</h3><p>{tl("Тук се появяват задачите на вечерния AI pipeline.")}</p></div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>{tl("Създадена")}</th><th>{tl("Предназначение")}</th><th>{tl("Държава")}</th><th>{tl("Обект")}</th><th>{tl("Модел")}</th><th>{tl("Приоритет")}</th><th>{tl("Статус")}</th><th>{tl("Опит")}</th><th>{tl("Резултат")}</th></tr></thead>
              <tbody>
                {rows.map((j) => {
                  const st = JOB_STATUS[j.status] || { label: j.status, tone: "neutral" };
                  return (
                    <tr key={j.id}>
                      <td className="nowrap">{fmtTs(j.created_at)}</td>
                      <td>{tl(PURPOSE_LABELS[j.purpose] || j.purpose)}</td>
                      <td>{j.country_code || "—"}</td>
                      <td className="mono" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={j.entity_id}>{j.entity_type}</td>
                      <td className="mono">{j.model_id}</td>
                      <td>{j.priority}</td>
                      <td><span className={"badge " + st.tone}>{tl(st.label)}</span></td>
                      <td>{j.attempt_count}</td>
                      <td style={{ maxWidth: 220, fontSize: 12.5 }}>{j.safe_error_summary || (j.duration_ms != null ? j.duration_ms + " ms" : "—")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > JOB_PAGE && (
            <div className="admin-pager">
              <span className="pg-info">{(page - 1) * JOB_PAGE + 1}–{Math.min(page * JOB_PAGE, total)} {tl("от")} {total}</span>
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tl("Предишна")}</button>
              <span className="pg-info" style={{ margin: 0 }}>{tl("стр.")} {page} / {pages}</span>
              <button className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tl("Следваща")}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
