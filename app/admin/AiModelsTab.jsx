"use client";

// Админ таб „AI модели": доставчици (ключове), активни модели по предназначение,
// дневна процедура и AI логове. Ключовете никога не се показват — само last four.

import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";

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
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => {
    api("/api/admin/ai/providers").then(setData).catch(() => setData({ providers: [], configurations: [], cryptoConfigured: false, purposes: [] }));
    api("/api/admin/ai/summary").then(setSummary).catch(() => setSummary(null));
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  if (data == null) return <section className="prof-card"><p className="prose">Зареждане…</p></section>;

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
        <h2 style={{ margin: 0 }}>AI модели</h2>
        <p>Управление на AI доставчиците, моделите, дневните задачи и бъдещите AI функции на системата.</p>
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
          <h3 className="prof-section-title">Дневен преглед</h3>
          <dl className="sys-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div><dt>Модел</dt><dd>{daily ? `${daily.display_name}` : "—"} <span className="role-chip">Anthropic</span></dd></div>
            <div><dt>Model ID</dt><dd className="mono">{daily?.model_id || "—"}</dd></div>
            <div><dt>Управление</dt><dd><span className="badge amber">Управлява се от Claude Scheduled Tasks</span></dd></div>
            <div><dt>Последно изпълнение</dt><dd>{lastSync ? `${fmtTs(lastSync.started_at)} · ${lastSync.status}` : "Няма налични данни"}</dd></div>
            <div><dt>Реален модел (последен отчет)</dt><dd className="mono">{lastDaily?.model_id || "Няма отчетен"}</dd></div>
          </dl>
          {lastDaily && daily && lastDaily.model_id && lastDaily.model_id !== daily.model_id && (
            <p className="chart-note"><Icon name="alert" size={13} /> Реалният модел ({lastDaily.model_id}) се различава от желания ({daily.model_id}).</p>
          )}
        </section>
        <section className="prof-card" style={{ margin: 0 }}>
          <h3 className="prof-section-title">Системен AI анализ</h3>
          <dl className="sys-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div><dt>Модел</dt><dd>{sysAI ? sysAI.display_name : "—"} <span className="role-chip">OpenAI</span></dd></div>
            <div><dt>Model ID</dt><dd className="mono">{sysAI?.model_id || "—"}</dd></div>
            <div><dt>Статус</dt><dd>{sysAI?.active && sysAI?.validation_status === "validated" ? <span className="badge green">Активен</span> : <span className="badge neutral">Конфигуриран (неактивен до валидация)</span>}</dd></div>
            <div><dt>Валидация</dt><dd>{sysAI?.validation_status || "—"}{sysAI?.last_validated_at ? ` · ${fmtTs(sysAI.last_validated_at)}` : ""}</dd></div>
          </dl>
        </section>
        <section className="prof-card" style={{ margin: 0 }}>
          <h3 className="prof-section-title">Бъдещ AI чат</h3>
          <dl className="sys-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div><dt>Статус</dt><dd><span className="badge neutral">Изключен</span> (feature flag AI_CHAT_ENABLED)</dd></div>
            <div><dt>Подготвен модел</dt><dd>{chat ? `${chat.display_name}` : "—"}</dd></div>
          </dl>
        </section>
        <section className="prof-card" style={{ margin: 0 }}>
          <h3 className="prof-section-title">AI заявки днес</h3>
          <dl className="sys-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div><dt>Успешни</dt><dd>{t ? (t.ok ?? 0) : "Няма налични данни"}</dd></div>
            <div><dt>Неуспешни</dt><dd>{t ? (t.failed ?? 0) : "—"}</dd></div>
            <div><dt>Токени</dt><dd>{t && t.tokens != null ? t.tokens : "Няма налични данни"}</dd></div>
            <div><dt>Средна латентност</dt><dd>{t && t.avg_latency != null ? Math.round(t.avg_latency) + " ms" : "Няма налични данни"}</dd></div>
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

      {/* Дневна процедура + логове */}
      <DailyRuns summary={summary} />
      <RunsLog />
    </>
  );
}

function ProviderCard({ p, cryptoConfigured, onChanged, flash }) {
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
    if (!confirm("Ключът ще бъде премахнат, доставчикът — деактивиран, а зависимите модели ще станат unavailable. Продължавате ли?")) return;
    setBusy(true);
    try { await api(`/api/admin/ai/providers/${p.provider_key}/key`, { method: "DELETE" }); flash("Ключът е премахнат."); onChanged(); }
    catch (e) { flash(errText(e.code)); }
    finally { setBusy(false); }
  };

  return (
    <section className="prof-card" style={{ margin: 0 }}>
      <div className="ov-section-head"><h3 className="prof-section-title" style={{ margin: 0 }}>{p.display_name}</h3>
        {configured ? <span className="badge green">Конфигуриран</span> : <span className="badge neutral">API ключът не е конфигуриран</span>}
        {p.connection_status === "ok" && <span className="badge blue">Връзка OK</span>}
        {p.connection_status === "error" && <span className="badge red">Грешка при връзка</span>}
      </div>
      <dl className="sys-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><dt>Ключ</dt><dd className="mono">{configured && p.credential ? `•••• ${p.credential.lastFour || ""}` : "—"}</dd></div>
        <div><dt>Последна смяна</dt><dd>{p.credential ? fmtTs(p.credential.rotatedAt || p.credential.updatedAt) : "—"}</dd></div>
        <div><dt>Последен тест</dt><dd>{p.last_tested_at ? `${fmtTs(p.last_tested_at)} · ${p.last_test_status}` : "—"}</dd></div>
        <div><dt>Модели (кеш)</dt><dd>{p.available_models ? `${p.available_models.length} · ${fmtTs(p.models_refreshed_at)}` : "—"}</dd></div>
      </dl>
      <label className="field" style={{ marginTop: 8 }}>
        <span className="field-label">{p.display_name} API key</span>
        <span style={{ display: "flex", gap: 6 }}>
          <input className="inp" type={show ? "text" : "password"} value={key} placeholder="Въведете нов API ключ" autoComplete="off" name={"new-ai-key-" + p.provider_key} onChange={(e) => setKey(e.target.value)} />
          {key && <button type="button" className="btn btn-ghost" onClick={() => setShow((v) => !v)} aria-label={show ? "Скрий" : "Покажи"}>{show ? "Скрий" : "Покажи"}</button>}
        </span>
      </label>
      <div className="prof-actions" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-primary" disabled={busy || !key || !cryptoConfigured} onClick={saveKey}><Icon name="check" size={15} /> {configured ? "Замени ключа" : "Запази"}</button>
        <button className="btn" disabled={busy || !configured} onClick={test}><Icon name="refresh" size={15} /> Провери връзката</button>
        {configured && <button className="btn btn-danger" disabled={busy} onClick={removeKey}><Icon name="close" size={15} /> Премахни ключа</button>}
      </div>
      <p role="status" aria-live="polite" style={{ margin: "6px 0 0", minHeight: 18 }}>
        {testResult && (testResult.ok
          ? <span className="save-ok"><Icon name="check" size={14} /> Успешна връзка{testResult.latency ? ` · ${testResult.latency} ms` : ""}</span>
          : <span className="badge red">{errText(testResult.code)}</span>)}
      </p>
    </section>
  );
}

function ActiveModels({ data, onChanged, flash }) {
  const [purpose, setPurpose] = useState("procedure_analysis");
  const [provider, setProvider] = useState("openai");
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const prov = data.providers.find((p) => p.provider_key === provider);
  const models = (prov?.available_models || []).filter((m) => provider !== "openai" || m.family === "gpt-5.6" || !m.family?.startsWith("gpt-5.6"));
  const gptModels = provider === "openai" ? (prov?.available_models || []).filter((m) => m.family === "gpt-5.6") : (prov?.available_models || []);
  const list = gptModels.length ? gptModels : (prov?.available_models || []);

  const refreshModels = async () => {
    setBusy(true);
    try { await api(`/api/admin/ai/providers/${provider}/models/refresh`, { method: "POST" }); flash("Списъкът с модели е обновен."); onChanged(); }
    catch (e) { flash(errText(e.code)); }
    finally { setBusy(false); }
  };
  const apply = async (activate) => {
    setBusy(true);
    try {
      const m = list.find((x) => x.id === modelId);
      await api(`/api/admin/ai/configurations/${purpose}`, { method: "PATCH", body: JSON.stringify({ provider_key: provider, model_id: modelId, display_name: displayName || (m ? m.displayName : modelId), model_family: m?.family || null, model_tier: m?.tier || null, activate }) });
      flash(activate ? "Моделът е активиран." : "Конфигурацията е записана (неактивна).");
      onChanged();
    } catch (e) { flash(errText(e.code)); }
    finally { setBusy(false); }
  };

  return (
    <section className="prof-card">
      <h3 className="prof-section-title">Активни AI модели</h3>
      <p className="prose">Този модел се използва за ежедневната проверка и анализ на процедурите, когато Scheduled Task архитектурата позволява изборът да се управлява от системата. Дневният преглед носи бадж „Управлява се от Claude Scheduled Tasks“ — изборът тук е desired модел и не се прилага автоматично върху задачата.</p>
      <div className="table-scroll">
        <table className="admin-table">
          <thead><tr><th>Предназначение</th><th>Доставчик</th><th>Модел (display)</th><th>Model ID</th><th>Статус</th><th>Валидация</th></tr></thead>
          <tbody>
            {Object.keys(PURPOSE_LABELS).filter((k) => k !== "fallback").map((k) => {
              const rows = data.configurations.filter((c) => c.purpose === k);
              if (!rows.length) return <tr key={k}><td>{PURPOSE_LABELS[k]}</td><td colSpan={5} className="row-sub">Няма конфигурация (наследява системния модел)</td></tr>;
              return rows.map((c) => (
                <tr key={c.id}>
                  <td>{PURPOSE_LABELS[k]}{k === "daily_review" ? <div className="row-sub"><span className="badge amber">Claude Scheduled Tasks</span></div> : null}</td>
                  <td>{c.provider_key === "anthropic" ? "Anthropic" : "OpenAI"}</td>
                  <td>{c.display_name}</td>
                  <td className="mono">{c.model_id}</td>
                  <td>{c.active ? <span className="badge green">Активен</span> : <span className="badge neutral">Неактивен</span>}</td>
                  <td>{c.validation_status}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      <h4 style={{ margin: "16px 0 8px" }}>Смени модела</h4>
      <div className="form-grid">
        <label className="field"><span className="field-label">Предназначение</span>
          <select className="inp" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {Object.keys(PURPOSE_LABELS).filter((k) => k !== "fallback").map((k) => <option key={k} value={k}>{PURPOSE_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Доставчик</span>
          <select className="inp" value={provider} onChange={(e) => { setProvider(e.target.value); setModelId(""); }}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label className="field"><span className="field-label">Модел (от реално достъпните)</span>
          <select className="inp" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            <option value="">— изберете —</option>
            {provider === "anthropic" && !list.length && <option value="claude-opus-4-8">claude-opus-4-8 (Claude Opus 4.8)</option>}
            {list.map((m) => <option key={m.id} value={m.id}>{m.id}{m.tier ? ` · ${m.tier}` : ""}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Display name (не се превежда)</span>
          <input className="inp" value={displayName} placeholder="напр. GPT-5.6" onChange={(e) => setDisplayName(e.target.value)} />
        </label>
      </div>
      <div className="prof-actions" style={{ flexWrap: "wrap" }}>
        <button className="btn" disabled={busy} onClick={refreshModels}><Icon name="refresh" size={15} /> Обнови списъка с модели</button>
        <button className="btn" disabled={busy || !modelId} onClick={() => apply(false)}>Запази (неактивен)</button>
        <button className="btn btn-primary" disabled={busy || !modelId} onClick={() => apply(true)}><Icon name="check" size={15} /> Активирай модела</button>
      </div>
      <p className="chart-note"><Icon name="info" size={13} /> Активирането валидира точния model ID срещу доставчика. GPT-5.6 има нива (Sol/Terra/Luna) — изберете реално достъпния ID от списъка, не предполагаем.</p>
    </section>
  );
}

function DailyRuns({ summary }) {
  const s = summary?.lastSyncRun;
  const cursor = summary?.cursor;
  const BADGE = { completed: ["green", "Успешно"], success: ["green", "Успешно"], partial: ["amber", "Частично"], running: ["blue", "В процес"], error: ["red", "Неуспешно"], blocked: ["red", "Блокирано"], skipped: ["neutral", "Пропуснато"] };
  const b = s ? (BADGE[s.status] || ["neutral", s.status]) : null;
  return (
    <section className="prof-card">
      <h3 className="prof-section-title">Дневна процедура</h3>
      {!s ? <p className="prose">Няма налични данни</p> : (
        <dl className="sys-grid">
          <div><dt>Статус</dt><dd><span className={"badge " + b[0]}>{b[1]}</span></dd></div>
          <div><dt>График</dt><dd>Всеки ден в 08:00 (Claude Scheduled Tasks)</dd></div>
          <div><dt>Последно изпълнение</dt><dd>{fmtTs(s.started_at)} — {fmtTs(s.completed_at)}</dd></div>
          <div><dt>Държави (начало → край)</dt><dd>{s.start_country_code || "—"} → {s.end_country_code || "—"} · следваща: {s.continuation_country_code || "—"}</dd></div>
          <div><dt>Обработени източници</dt><dd>{s.sources_attempted ?? "—"} (успешни: {s.sources_succeeded ?? "—"})</dd></div>
          <div><dt>Записи</dt><dd>видени {s.records_seen ?? 0} · нови {s.records_inserted ?? 0} · обновени {s.records_updated ?? 0} · непроменени {s.records_unchanged ?? 0} · невалидни {s.records_invalid ?? 0}</dd></div>
          <div><dt>Цикъл</dt><dd>№{s.cycle_number ?? "—"} {cursor ? `· завършени ${cursor.completed_countries_in_cycle}/${cursor.total_countries_in_cycle || "?"}` : ""}</dd></div>
          <div><dt>Резюме</dt><dd style={{ fontSize: 13 }}>{s.safe_summary || "—"}</dd></div>
        </dl>
      )}
    </section>
  );
}

function RunsLog() {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fSource, setFSource] = useState("");
  const [fStatus, setFStatus] = useState("");
  const PAGE = 25;
  const load = useCallback(() => {
    const qs = new URLSearchParams({ limit: String(PAGE), offset: String((page - 1) * PAGE) });
    if (fSource) qs.set("source", fSource);
    if (fStatus) qs.set("status", fStatus);
    api("/api/admin/ai/runs?" + qs).then((d) => { setRows(d.runs || []); setTotal(d.total || 0); }).catch(() => { setRows([]); setTotal(0); });
  }, [page, fSource, fStatus]);
  useEffect(() => { load(); }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <section className="prof-card">
      <div className="ov-section-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3 className="prof-section-title" style={{ margin: 0 }}>AI логове</h3>
        <span className="count-dot">{total}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <select className="inp inp-sm" value={fSource} onChange={(e) => { setFSource(e.target.value); setPage(1); }} aria-label="Източник на изпълнение">
            <option value="">Всички източници</option>
            {["claude_scheduled_task", "worker_api", "admin_manual", "ingestion_pipeline", "future_chat"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="inp inp-sm" value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }} aria-label="Статус">
            <option value="">Всички статуси</option>
            {["success", "partial", "error", "blocked"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={load}><Icon name="refresh" size={15} /> Обнови</button>
        </div>
      </div>
      {rows == null ? <p className="prose">Зареждане…</p> : rows.length === 0 ? (
        <div className="state ov-empty"><Icon name="sparkle" size={26} /><h3>Няма AI логове</h3><p>Тук се записват дневните прегледи и runtime AI заявките (без prompts и без отговори).</p></div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>Дата</th><th>Предназначение</th><th>Източник</th><th>Държава</th><th>Модел</th><th>Статус</th><th>Време</th><th>Токени</th><th>Резултат</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtTs(r.started_at)}</td>
                    <td>{PURPOSE_LABELS[r.purpose] || r.purpose}</td>
                    <td className="mono">{r.execution_source || "—"}</td>
                    <td>{r.country_code || "—"}</td>
                    <td className="mono">{r.model_id || "—"}</td>
                    <td>{r.status === "success" ? <span className="badge green">Успешно</span> : r.status === "error" ? <span className="badge red">Грешка</span> : <span className="badge neutral">{r.status}</span>}</td>
                    <td>{r.duration_ms != null ? r.duration_ms + " ms" : "—"}</td>
                    <td>{r.input_tokens != null || r.output_tokens != null ? `${r.input_tokens ?? 0}/${r.output_tokens ?? 0}` : "—"}</td>
                    <td style={{ maxWidth: 260, fontSize: 12.5 }}>{r.safe_error_summary || (r.procedures_reviewed != null ? `процедури: ${r.procedures_reviewed}, промени: ${r.changes_detected ?? 0}` : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > PAGE && (
            <div className="admin-pager">
              <span className="pg-info">{(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} от {total}</span>
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Предишна</button>
              <span className="pg-info" style={{ margin: 0 }}>стр. {page} / {pages}</span>
              <button className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Следваща</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
