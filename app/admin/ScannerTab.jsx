"use client";

// Админ таб „Скенер" (v2.52.0) — какво точно е свършила дневната синхронизация.
// Всичко идва от D1 през /api/admin/sync/*; нищо не се смята и не се измисля тук.
//
// Подраздели: Изпълнения · Backlog · Аномалии · Промени · Източници · Качество.

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";

const VIEWS = [
  ["runs", "Изпълнения"],
  ["backlog", "Backlog"],
  ["anomalies", "Аномалии"],
  ["changes", "Промени"],
  ["sources", "Източници"],
  ["quality", "Качество"],
  ["candidates", "Нови източници"],
];

const QUALITY_STATUSES = ["complete", "good", "partial", "incomplete", "pending_review", "unknown"];
const PROCEDURE_STATUSES = ["open", "closing_soon", "upcoming", "closed"];
const ANOMALY_TYPES = [
  "budget_conflict", "budget_out_of_range", "zero_budget", "duplicate_budget",
  "project_budget_as_total", "currency_mismatch", "invalid_min_max",
  "missing_document", "date_inconsistency", "duplicate_document", "scope_unknown",
];
const CHANGE_TYPES = [
  "deadline_change", "budget_change", "status_change", "document_added",
  "eligibility_change", "amendment", "correction", "other",
];
const HEALTHS = ["healthy", "degraded", "failing", "blocked", "unknown"];

const fmtDT = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const num = (v) => (v === null || v === undefined ? "—" : new Intl.NumberFormat("bg-BG").format(v));
const pct = (v) => (v === null || v === undefined ? "—" : `${new Intl.NumberFormat("bg-BG").format(v)}%`);
const delta = (a, b) => {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  const d = Math.round((b - a) * 10) / 10;
  return `${d >= 0 ? "+" : ""}${d} п.п.`;
};

function useApi(path, deps = []) {
  const [state, setState] = useState({ loading: !!path, data: null, error: null });
  const load = useCallback(() => {
    let alive = true;
    if (!path) { setState({ loading: false, data: null, error: null }); return () => { alive = false; }; }
    setState((s) => ({ ...s, loading: true }));
    fetch(path, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => { if (alive) setState({ loading: false, data: d, error: d && d.ok === false ? d.error : null }); })
      .catch(() => { if (alive) setState({ loading: false, data: null, error: "network" }); });
    return () => { alive = false; };
  }, [path]);
  useEffect(() => load(), deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}

const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

function Select({ label, value, onChange, options, allLabel = "всички" }) {
  return (
    <label className="admin-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>
            {typeof o === "string" ? o : o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Empty({ children }) { return <p className="prose row-sub">{children}</p>; }

export default function ScannerTab() {
  const [view, setView] = useState("runs");
  const [country, setCountry] = useState("");
  const countries = useApi("/api/countries", []);
  const countryOptions = useMemo(
    () => ((countries.data && countries.data.countries) || []).map((c) => ({ value: c.code, label: `${c.code} — ${c.name_bg || c.english_name}` })),
    [countries.data]
  );

  return (
    <section className="prof-card">
      <div className="admin-head">
        <h2 className="prof-section-title"><Icon name="search" size={16} /> Скенер на дневната синхронизация</h2>
        <p className="row-sub">
          Какво е обходено при всяко изпълнение, какво остава, къде има противоречия и коя е следващата държава.
        </p>
      </div>

      <div className="admin-subtabs" role="tablist">
        {VIEWS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} className="admin-tab" onClick={() => setView(k)}>{l}</button>
        ))}
      </div>

      <div className="admin-filters">
        <Select label="Държава" value={country} onChange={setCountry} options={countryOptions} />
      </div>

      {view === "runs" && <RunsView country={country} />}
      {view === "backlog" && <BacklogView country={country} />}
      {view === "anomalies" && <AnomaliesView country={country} />}
      {view === "changes" && <ChangesView country={country} />}
      {view === "sources" && <SourcesHealthView country={country} />}
      {view === "quality" && <QualityView country={country} />}
      {view === "candidates" && <CandidatesView country={country} />}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Изпълнения + текущ cursor
// ─────────────────────────────────────────────────────────────────────────────
function RunsView({ country }) {
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState(null);
  const path = `/api/admin/sync/runs${qs({ country, status, limit: "25" })}`;
  const runs = useApi(path, [path]);
  const cursor = useApi("/api/admin/sync/cursor", []);

  const list = (runs.data && runs.data.runs) || [];
  return (
    <>
      <div className="admin-filters">
        <Select label="Статус" value={status} onChange={setStatus} options={["completed", "success", "partial", "error", "timeout", "running"]} />
      </div>

      <CursorPanel data={cursor.data} loading={cursor.loading} />

      {runs.loading ? <Empty>Зареждане…</Empty> : list.length === 0 ? (
        <Empty>Няма записани изпълнения за този филтър.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th><th>Начало</th><th>Статус</th><th>Държави</th><th>Източници</th>
                <th>Процедури</th><th>Документи</th><th>Бюджети</th><th>Качество</th>
                <th>Покритие док.</th><th>Покритие бюдж.</th><th>Аномалии</th><th>Следва</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <RunRow key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RunRow({ r, open, onToggle }) {
  const detail = useApi(open ? `/api/admin/sync/runs/${r.id}` : null, [open, r.id]);
  const d = open && detail.data && detail.data.run ? detail.data : null;
  return (
    <>
      <tr>
        <td>{r.id}</td>
        <td>{fmtDT(r.started_at)}</td>
        <td><span className={`badge ${r.status === "completed" || r.status === "success" ? "green" : r.status === "partial" ? "amber" : "red"}`}>{r.status || "—"}</span></td>
        <td title="засегнати / завършени">{num(r.countries_touched)} / {num(r.countries_fully_processed)}</td>
        <td title="проверени / нови / неуспешни">{num(r.sources_checked)} / {num(r.new_sources_discovered)} / {num(r.source_failures)}</td>
        <td title="нови / обновени / без промяна / допълнени">
          +{num(r.procedures_created)} / {num(r.procedures_updated)} / {num(r.procedures_unchanged)} / {num(r.procedures_revisited)}
        </td>
        <td title="свалени / открити / нови версии">{num(r.documents_downloaded)} / {num(r.documents_discovered)} / {num(r.document_versions_added)}</td>
        <td title="структурирани / конвертирани">{num(r.budgets_extracted)} / {num(r.budgets_converted)}</td>
        <td>{r.average_quality_score == null ? "—" : `${r.average_quality_score}/100`}</td>
        <td>{pct(r.document_coverage_after)}{delta(r.document_coverage_before, r.document_coverage_after) ? ` (${delta(r.document_coverage_before, r.document_coverage_after)})` : ""}</td>
        <td>{pct(r.budget_coverage_after)}{delta(r.budget_coverage_before, r.budget_coverage_after) ? ` (${delta(r.budget_coverage_before, r.budget_coverage_after)})` : ""}</td>
        <td>{num(r.anomalies_detected)}</td>
        <td>{r.next_country || r.continuation_country_code || "—"}{r.next_source ? ` / ${r.next_source}` : ""}</td>
        <td><button className="btn btn-ghost btn-sm" onClick={onToggle} aria-expanded={open}>{open ? "Скрий" : "Детайли"}</button></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={14}>
            <div className="admin-detail">
              <p className="prose">{r.safe_summary || "Няма резюме."}</p>
              {r.timeAllocation && (
                <p className="row-sub">
                  Разпределение на времето: нови {Math.round((r.timeAllocation.fresh || 0) / 1000)}s ·
                  допълване {Math.round((r.timeAllocation.backfill || 0) / 1000)}s ·
                  ниско покритие {Math.round((r.timeAllocation.lowCoverage || 0) / 1000)}s ·
                  откриване {Math.round((r.timeAllocation.discovery || 0) / 1000)}s
                </p>
              )}
              {Array.isArray(r.countries) && r.countries.length > 0 && (
                <>
                  <h4 className="prof-section-title">Обработени държави</h4>
                  <ul className="prose">
                    {r.countries.map((c, i) => (
                      <li key={i}>
                        <b>{c.code}</b> — процедури {num(c.procedures)} · документи {num(c.documents)} ·
                        бюджети {num(c.budgets)} · аномалии {num(c.anomalies)} · {c.status || "—"}
                        {c.cursor ? ` · cursor: ${c.cursor}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {Array.isArray(r.blockedSources) && r.blockedSources.length > 0 && (
                <>
                  <h4 className="prof-section-title">Блокирани източници</h4>
                  <ul className="prose">
                    {r.blockedSources.map((s, i) => <li key={i}><b>{s.country || "?"}</b> · {s.id || "?"} — {s.reason || "без причина"}</li>)}
                  </ul>
                </>
              )}
              {detail.loading && <p className="row-sub">Зареждане на детайлите…</p>}
              {d && d.anomalies && d.anomalies.length > 0 && (
                <>
                  <h4 className="prof-section-title">Аномалии от това изпълнение</h4>
                  <ul className="prose">{d.anomalies.map((a, i) => <li key={i}>{a.anomaly_type} ({a.severity}): {a.n}</li>)}</ul>
                </>
              )}
              {d && d.changes && d.changes.length > 0 && (
                <>
                  <h4 className="prof-section-title">Промени</h4>
                  <ul className="prose">{d.changes.map((c, i) => <li key={i}>{c.change_type} ({c.significance}): {c.n}</li>)}</ul>
                </>
              )}
              {d && d.sourceHealth && d.sourceHealth.length > 0 && (
                <>
                  <h4 className="prof-section-title">Източници</h4>
                  <ul className="prose">
                    {d.sourceHealth.map((s, i) => (
                      <li key={i}>
                        <b>{s.country_code}</b> {s.source_id} — {s.health || "?"} · HTTP {s.http_status || "—"} ·
                        {s.response_time_ms ? ` ${s.response_time_ms} ms ·` : ""} открити {num(s.procedures_found)} / валидни {num(s.procedures_valid)}
                        {s.error_summary ? ` · ${s.error_summary}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CursorPanel({ data, loading }) {
  if (loading) return <Empty>Зареждане на cursor-а…</Empty>;
  const cursors = (data && data.cursors) || [];
  const pages = (data && data.paginationCursors) || [];
  const last = data && data.lastRun;
  if (!cursors.length && !last) return <Empty>Още няма записан cursor.</Empty>;
  return (
    <div className="admin-detail">
      <h4 className="prof-section-title">Текущо състояние</h4>
      {cursors.map((c) => (
        <p className="prose" key={c.task_key}>
          <b>{c.task_key}</b> — цикъл {num(c.cycle_number)}, завършени {num(c.completed_countries_in_cycle)}/{num(c.total_countries_in_cycle)},
          последна завършена: <b>{c.last_completed_country_code || "—"}</b>,
          текуща: <b>{c.current_country_code || "—"}</b>
          {c.current_source_id ? ` / ${c.current_source_id}` : ""}
          {c.current_section ? ` · секция ${c.current_section}` : ""}
          {c.current_page ? ` · стр. ${c.current_page}` : ""}
          {c.current_item_offset ? ` · offset ${c.current_item_offset}` : ""}
          {c.last_processed_procedure_id ? ` · последна процедура ${c.last_processed_procedure_id}` : ""}
          {" · "}обновен {fmtDT(c.updated_at)}
        </p>
      ))}
      {last && (
        <p className="row-sub">
          Последно изпълнение #{last.id} ({last.status}) в {fmtDT(last.completed_at)} · следва:&nbsp;
          <b>{last.next_country || last.continuation_country_code || "—"}</b>
          {last.next_source ? ` / ${last.next_source}` : ""}
          {last.next_cursor ? ` · ${last.next_cursor}` : ""}
        </p>
      )}
      {pages.length > 0 && (
        <>
          <h4 className="prof-section-title">Незавършени страници</h4>
          <ul className="prose">
            {pages.map((p, i) => (
              <li key={i}>
                <b>{p.country_code}</b> · {p.source_id} · {p.section} — стр. {p.page}, offset {p.item_offset}
                {p.last_procedure_id ? ` · последна: ${p.last_procedure_id}` : ""} · {fmtDT(p.updated_at)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backlog
// ─────────────────────────────────────────────────────────────────────────────
function BacklogView({ country }) {
  const path = `/api/admin/sync/backlog${qs({ country })}`;
  const { loading, data } = useApi(path, [path]);
  const rows = (data && data.backlog) || [];
  if (loading) return <Empty>Зареждане…</Empty>;
  if (!rows.length) return <Empty>Няма данни.</Empty>;
  const totals = rows.reduce((a, r) => ({
    total: a.total + (r.total || 0),
    missing_documents: a.missing_documents + (r.missing_documents || 0),
    missing_budget: a.missing_budget + (r.missing_budget || 0),
    missing_quality: a.missing_quality + (r.missing_quality || 0),
    open_anomalies: a.open_anomalies + (r.open_anomalies || 0),
  }), { total: 0, missing_documents: 0, missing_budget: 0, missing_quality: 0, open_anomalies: 0 });
  return (
    <div className="table-scroll">
      <p className="row-sub">
        Общо {num(totals.total)} процедури · без документи {num(totals.missing_documents)} ·
        без бюджет {num(totals.missing_budget)} · без оценка {num(totals.missing_quality)} ·
        отворени аномалии {num(totals.open_anomalies)}
      </p>
      <table className="admin-table">
        <thead>
          <tr><th>Държава</th><th>Процедури</th><th>Без документи</th><th>Без бюджет</th><th>Без оценка</th><th>С основен документ</th><th>Аномалии</th><th>Последен sync</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <td><b>{r.code}</b></td>
              <td>{num(r.total)}</td>
              <td>{num(r.missing_documents)}</td>
              <td>{num(r.missing_budget)}</td>
              <td>{num(r.missing_quality)}</td>
              <td>{num(r.with_primary_document)}</td>
              <td>{num(r.open_anomalies)}</td>
              <td>{fmtDT(r.last_successful_sync_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Аномалии
// ─────────────────────────────────────────────────────────────────────────────
function AnomaliesView({ country }) {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("open");
  const [run, setRun] = useState("");
  const path = `/api/admin/sync/anomalies${qs({ country, type, status, run, limit: "100" })}`;
  const { loading, data } = useApi(path, [path]);
  const rows = (data && data.anomalies) || [];
  const summary = (data && data.summary) || [];
  return (
    <>
      <div className="admin-filters">
        <Select label="Тип" value={type} onChange={setType} options={ANOMALY_TYPES} />
        <Select label="Статус" value={status} onChange={setStatus} options={["open", "resolved", "ignored"]} allLabel="open" />
        <label className="admin-filter"><span>Run ID</span><input value={run} onChange={(e) => setRun(e.target.value)} placeholder="напр. 42" /></label>
      </div>
      {summary.length > 0 && (
        <p className="row-sub">{summary.map((s) => `${s.anomaly_type} (${s.severity}): ${s.n}`).join(" · ")}</p>
      )}
      {loading ? <Empty>Зареждане…</Empty> : rows.length === 0 ? <Empty>Няма аномалии за този филтър.</Empty> : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Тип</th><th>Важност</th><th>Държава</th><th>Процедура</th><th>Поле</th><th>Страница</th><th>Документ</th><th>Открита</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.anomaly_type}</td>
                  <td><span className={`badge ${a.severity === "critical" ? "red" : a.severity === "warning" ? "amber" : "neutral"}`}>{a.severity}</span></td>
                  <td>{a.country_code || "—"}</td>
                  <td title={a.project_id}>{a.project_name || a.project_id || "—"}</td>
                  <td>{a.field_name || "—"}</td>
                  <td>{a.page_value || a.observed_value || "—"}</td>
                  <td>{a.document_value || a.expected_value || "—"}</td>
                  <td>{fmtDT(a.detected_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// История на промените
// ─────────────────────────────────────────────────────────────────────────────
function ChangesView({ country }) {
  const [type, setType] = useState("");
  const [run, setRun] = useState("");
  const path = `/api/admin/sync/changes${qs({ country, type, run, limit: "100" })}`;
  const { loading, data } = useApi(path, [path]);
  const rows = (data && data.changes) || [];
  return (
    <>
      <div className="admin-filters">
        <Select label="Тип промяна" value={type} onChange={setType} options={CHANGE_TYPES} />
        <label className="admin-filter"><span>Run ID</span><input value={run} onChange={(e) => setRun(e.target.value)} placeholder="напр. 42" /></label>
      </div>
      {loading ? <Empty>Зареждане…</Empty> : rows.length === 0 ? <Empty>Няма записани промени за този филтър.</Empty> : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Кога</th><th>Държава</th><th>Процедура</th><th>Поле</th><th>Беше</th><th>Стана</th><th>Тип</th><th>Важност</th><th>Открито от</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDT(c.changed_at)}</td>
                  <td>{c.country_code || "—"}</td>
                  <td title={c.project_id}>{c.project_name || c.project_id}</td>
                  <td>{c.field_name}</td>
                  <td className="cell-clip" title={c.old_value || ""}>{c.old_value || "—"}</td>
                  <td className="cell-clip" title={c.new_value || ""}>{c.new_value || "—"}</td>
                  <td>{c.change_type}</td>
                  <td><span className={`badge ${c.significance === "critical" ? "red" : c.significance === "major" ? "amber" : "neutral"}`}>{c.significance}</span></td>
                  <td>{c.detected_from || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Източници и здраве
// ─────────────────────────────────────────────────────────────────────────────
function SourcesHealthView({ country }) {
  const [health, setHealth] = useState("");
  const path = `/api/admin/sync/sources${qs({ country, health, limit: "200" })}`;
  const { loading, data } = useApi(path, [path]);
  const rows = (data && data.sources) || [];
  const channels = (s) => [
    s.calls_url && "покани", s.archive_url && "архив", s.search_url && "търсене",
    s.rss_url && "RSS", s.api_url && "API", s.sitemap_url && "sitemap", s.documents_url && "документи",
  ].filter(Boolean).join(", ") || "—";
  return (
    <>
      <div className="admin-filters">
        <Select label="Здраве" value={health} onChange={setHealth} options={HEALTHS} />
      </div>
      {loading ? <Empty>Зареждане…</Empty> : rows.length === 0 ? <Empty>Няма източници за този филтър.</Empty> : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Държава</th><th>Източник</th><th>Орган</th><th>Канали</th><th>Достъп</th><th>Здраве</th><th>HTTP</th><th>ms</th><th>Открити/валидни</th><th>Проверен</th><th>Блокиран</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.country_code}</b></td>
                  <td title={s.base_url}>{s.name}</td>
                  <td>{s.authority_name || "—"}</td>
                  <td className="cell-clip">{channels(s)}</td>
                  <td>{s.access_method || (s.requires_javascript ? "JS" : "html")}</td>
                  <td><span className={`badge ${s.source_health === "healthy" ? "green" : s.source_health === "degraded" ? "amber" : "red"}`}>{s.source_health}</span></td>
                  <td>{s.last_http_status || "—"}</td>
                  <td>{s.avg_response_time_ms || "—"}</td>
                  <td>{num(s.last_procedures_found)} / {num(s.last_procedures_valid)}</td>
                  <td>{fmtDT(s.last_checked_at)}</td>
                  <td className="cell-clip" title={s.blocked_reason || ""}>{s.blocked_reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Качество
// ─────────────────────────────────────────────────────────────────────────────
function QualityView({ country }) {
  const [status, setStatus] = useState("");
  const [missing, setMissing] = useState("");
  const path = `/api/admin/sync/quality${qs({ country, status, missing, limit: "100" })}`;
  const { loading, data } = useApi(path, [path]);
  const dist = (data && data.distribution) || [];
  const rows = (data && data.procedures) || [];
  return (
    <>
      <div className="admin-filters">
        <Select label="Качество" value={status} onChange={setStatus} options={QUALITY_STATUSES} />
        <Select label="Липсва" value={missing} onChange={setMissing} options={[{ value: "documents", label: "документи" }, { value: "budget", label: "бюджет" }]} />
      </div>
      {dist.length > 0 && <p className="row-sub">{dist.map((d) => `${d.quality_status}: ${d.n}`).join(" · ")}</p>}
      {loading ? <Empty>Зареждане…</Empty> : rows.length === 0 ? <Empty>Няма процедури за този филтър.</Empty> : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Държава</th><th>Процедура</th><th>Статус</th><th>Срок</th><th>Оценка</th><th>Качество</th><th>Документи</th><th>Основен док.</th><th>Бюджет €</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.country_code}</b></td>
                  <td className="cell-clip" title={p.id}>{p.name}</td>
                  <td>{PROCEDURE_STATUSES.includes(p.status) ? p.status : (p.status || "—")}</td>
                  <td>{p.deadline_date || "—"}</td>
                  <td>{p.completeness_score == null ? "—" : `${p.completeness_score}/100`}</td>
                  <td>{p.quality_status || "—"}</td>
                  <td>{num(p.document_count)}</td>
                  <td>{p.has_primary_document ? "да" : "не"}</td>
                  <td>{p.budget_amount_eur == null ? "—" : num(Math.round(p.budget_amount_eur))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Кандидати за нови официални източници
// ─────────────────────────────────────────────────────────────────────────────
function CandidatesView({ country }) {
  const [status, setStatus] = useState("");
  const path = `/api/admin/sync/candidates${qs({ country, status, limit: "100" })}`;
  const { loading, data } = useApi(path, [path]);
  const rows = (data && data.candidates) || [];
  return (
    <>
      <div className="admin-filters">
        <Select label="Статус" value={status} onChange={setStatus} options={["new", "verified", "rejected", "promoted"]} />
      </div>
      {loading ? <Empty>Зареждане…</Empty> : rows.length === 0 ? <Empty>Още няма открити кандидати.</Empty> : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Държава</th><th>URL</th><th>Заглавие</th><th>Орган</th><th>Открит чрез</th><th>HTTP</th><th>Увереност</th><th>Статус</th><th>Първо видян</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.country_code}</b></td>
                  <td className="cell-clip"><a href={c.candidate_url} target="_blank" rel="noopener noreferrer nofollow">{c.normalized_url}</a></td>
                  <td className="cell-clip">{c.title || "—"}</td>
                  <td>{c.authority_name || "—"}</td>
                  <td>{c.discovery_method || "—"}</td>
                  <td>{c.http_status || "—"}</td>
                  <td>{c.official_confidence == null ? "—" : c.official_confidence}</td>
                  <td>{c.status}</td>
                  <td>{fmtDT(c.first_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
