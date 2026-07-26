"use client";

// Споделени градивни елементи за администраторските табове „API & Agents" и
// „SEO & Discovery". Пазят съществуващия визуален език: бели карти (.prof-card),
// фини граници, компактни бейджове (.role-chip), двуколонни dl блокове (.sys-grid)
// и таблици (.admin-table в .table-scroll). Без тежки ефекти.

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";

// ---------------------------------------------------------------------------
// Статуси
// ---------------------------------------------------------------------------

// Единна семантика за всички проверки. `unknown` = още няма валидация — НИКОГА
// не се показва като успех.
export const STATUS_TONE = {
  passed: { cls: "st-pass", labelKey: "Успешна" },
  warning: { cls: "st-warn", labelKey: "Изисква внимание" },
  failed: { cls: "st-fail", labelKey: "Неуспешна" },
  not_applicable: { cls: "st-na", labelKey: "Неприложима" },
  pending: { cls: "st-pending", labelKey: "Чака" },
  unknown: { cls: "st-na", labelKey: "Няма валидация" },
};

export function StatusChip({ status, tl, children }) {
  const tone = STATUS_TONE[status] || STATUS_TONE.unknown;
  return <span className={`disc-chip ${tone.cls}`}>{children || tl(tone.labelKey)}</span>;
}

export function SeverityChip({ severity, tl }) {
  const map = { critical: "st-fail", high: "st-fail", warning: "st-warn", info: "st-na" };
  const label = { critical: "Критичен", high: "Висок", warning: "Предупреждение", info: "Информация" };
  return <span className={`disc-chip ${map[severity] || "st-na"}`}>{tl(label[severity] || severity)}</span>;
}

/**
 * Обобщаваща карта. `status` идва от реална проверка; когато няма валидация,
 * подава се "unknown" и картата казва точно това.
 */
export function SummaryCard({ titleKey, status, value, hint, tl, checkedAt }) {
  return (
    <div className={`disc-sum ${(STATUS_TONE[status] || STATUS_TONE.unknown).cls}`}>
      <div className="disc-sum-top">
        <span className="disc-sum-title">{tl(titleKey)}</span>
        <StatusChip status={status} tl={tl} />
      </div>
      {value != null && <div className="disc-sum-value">{value}</div>}
      {hint && <div className="disc-sum-hint">{hint}</div>}
      {checkedAt && <div className="disc-sum-when">{tl("Проверено")}: <FormattedDate value={checkedAt} /></div>}
    </div>
  );
}

export function FormattedDate({ value, withTime = true }) {
  if (!value) return <>—</>;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return <>{String(value)}</>;
  const date = d.toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (!withTime) return <>{date}</>;
  return <>{date} {d.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" })}</>;
}

/** Двуколонен информационен блок — същият вид като „Системна информация". */
export function InfoGrid({ rows, tl }) {
  return (
    <dl className="sys-grid">
      {rows.filter(Boolean).map(([label, value, mono]) => (
        <div key={label}><dt>{tl(label)}</dt><dd className={mono ? "mono" : undefined}>{value == null || value === "" ? "—" : value}</dd></div>
      ))}
    </dl>
  );
}

/** Дълъг URL: скъсен изглед + копиране, за да не пречупва мобилния изглед. */
export function UrlValue({ href, label, className }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    try {
      navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* без clipboard достъп — потребителят може да отвори връзката */ }
  }, [href]);
  if (!href) return <>—</>;
  const short = label || String(href).replace(/^https?:\/\/[^/]+/, "") || "/";
  return (
    <span className="disc-url">
      <a href={href} target="_blank" rel="noopener noreferrer" className={className ? `mono ${className}` : "mono"}>{short}</a>
      <button type="button" className="disc-copy" onClick={copy} aria-label="Копирай адреса" title={href}>
        <Icon name={copied ? "check" : "document"} size={12} />
      </button>
    </span>
  );
}

export function Card({ titleKey, tl, actions, children, note }) {
  return (
    <section className="prof-card">
      <div className="disc-card-head">
        <h2 className="prof-section-title">{tl(titleKey)}</h2>
        {actions && <div className="disc-actions">{actions}</div>}
      </div>
      {children}
      {note && <p className="chart-note"><Icon name="info" size={13} /> {note}</p>}
    </section>
  );
}

export function EmptyState({ tl, titleKey, textKey }) {
  return (
    <div className="disc-empty">
      <strong>{tl(titleKey)}</strong>
      <p>{tl(textKey)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Резултати от проверки
// ---------------------------------------------------------------------------

// indexChecks живее в discovery-index.js (чист JS, за да е тестваем с node).
export { indexChecks } from "./discovery-index.js";

/** Прозрачен резултат: „8 от 9 проверки минаха" + разбивка, без подвеждащ процент. */
export function ReadinessScore({ checks, tl, categories, onRun, busy }) {
  const list = (checks || []).filter((c) => !categories || categories.includes(c.category));
  const counted = list.filter((c) => c.status !== "not_applicable" && c.status !== "pending");
  const passed = counted.filter((c) => c.status === "passed").length;
  const warning = counted.filter((c) => c.status === "warning").length;
  const failed = counted.filter((c) => c.status === "failed").length;
  const na = list.filter((c) => c.status === "not_applicable").length;
  // Преди първия одит страницата няма какво да покаже. Вместо десетина еднакви
  // празни блока — един ясен призив за действие, а секциите остават компактни.
  if (!list.length) {
    return (
      <div className="disc-cta">
        <div className="disc-cta-text">
          <strong>{tl("Още няма валидация")}</strong>
          <p>{tl("Пуснете първия одит, за да се провери какво реално връща продукцията. Дотогава не се показват статуси.")}</p>
        </div>
        {onRun && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onRun}>
            <Icon name="refresh" size={14} /> {tl(busy ? "Изпълнява се…" : "Пусни първия одит")}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="disc-score">
      <div className="disc-score-main">
        <strong>{passed}</strong> {tl("от")} <strong>{counted.length}</strong> {tl("проверки минаха")}
      </div>
      <div className="disc-score-parts">
        {warning > 0 && <span className="disc-chip st-warn">{warning} {tl("изискват внимание")}</span>}
        {failed > 0 && <span className="disc-chip st-fail">{failed} {tl("неуспешни")}</span>}
        {na > 0 && <span className="disc-chip st-na">{na} {tl("неприложими")}</span>}
        {warning === 0 && failed === 0 && <span className="disc-chip st-pass">{tl("Всички проверки минаха")}</span>}
      </div>
    </div>
  );
}

/** Таблица с проверки: код, статус, ресурс, време, детайли. */
export function CheckTable({ checks, tl, summaryText, standards }) {
  const [open, setOpen] = useState(null);
  if (!checks || !checks.length) return <EmptyState tl={tl} titleKey="Няма проверки" textKey="Тази група още не е валидирана." />;
  return (
    <div className="table-scroll">
      <table className="admin-table disc-table">
        <thead>
          <tr>
            <th>{tl("Проверка")}</th>
            {standards && <th>{tl("Стандарт")}</th>}
            <th>{tl("Статус")}</th>
            <th>{tl("Ресурс")}</th>
            <th className="nowrap">{tl("Отговор")}</th>
            <th className="nowrap">{tl("Време")}</th>
            <th>{tl("Детайли")}</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.code} className={open === c.code ? "log-row-open" : undefined}>
              <td className="mono disc-code">{c.code}</td>
              {standards && <td className="mono">{standards[c.code.split(":")[0]] || "—"}</td>}
              <td><StatusChip status={c.status} tl={tl} /></td>
              <td>{c.resourceUrl ? <UrlValue href={c.resourceUrl} /> : "—"}</td>
              <td className="nowrap">{c.responseStatus || "—"}</td>
              <td className="nowrap">{c.durationMs != null ? `${c.durationMs} ms` : "—"}</td>
              <td>
                <button type="button" className="log-expand" onClick={() => setOpen(open === c.code ? null : c.code)} aria-expanded={open === c.code}>
                  {summaryText(c)} <Icon name="chevronRight" size={12} style={{ transform: open === c.code ? "rotate(90deg)" : "none" }} />
                </button>
                {open === c.code && (
                  <pre className="disc-json">{JSON.stringify(c.safeDetails || {}, null, 2)}</pre>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Управление на одита (споделено между двата таба)
// ---------------------------------------------------------------------------

const GROUPS_API = ["api", "agents"];
const GROUPS_SEO = ["seo", "sitemap", "robots", "metadata", "structured_data", "social", "i18n_seo", "procedures"];
export const AUDIT_GROUPS = { api: GROUPS_API, seo: GROUPS_SEO };

/**
 * Зарежда прегледа и управлява одита. Истината за прогреса е СЪРВЪРНА — при
 * презареждане на страницата се възстановява активният одит от базата.
 */
export function useDiscovery(scope) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const driving = useRef(false);

  // Двата таба споделят една база, но всеки показва СВОИТЕ групи проверки.
  // Без scope одит от единия таб „изпразваше" картите на другия.
  const scopeQuery = scope ? `?scope=${encodeURIComponent(scope)}` : "";

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/discovery/overview${scopeQuery}`, { credentials: "same-origin", cache: "no-store" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "load_failed");
      setData(d);
      setProgress(d.activeRun ? { runId: d.activeRun.id, ...d.activeRun } : null);
      return d;
    } catch (e) {
      setError(String(e.message || e));
      return null;
    }
  }, [scopeQuery]);

  useEffect(() => { load(); }, [load]);

  // Продължава активен одит, дори ако е стартиран преди презареждането.
  const drive = useCallback(async (runId) => {
    if (driving.current) return;
    driving.current = true;
    try {
      for (;;) {
        const r = await fetch(`/api/admin/discovery/runs/${encodeURIComponent(runId)}/drive`, { method: "POST", credentials: "same-origin", cache: "no-store" });
        const d = await r.json();
        if (!d.ok) break;
        const run = await fetch(`/api/admin/discovery/runs/${encodeURIComponent(runId)}`, { credentials: "same-origin", cache: "no-store" }).then((x) => x.json());
        if (run.ok) setProgress({ runId, ...run.run, checks: run.checks });
        if (d.progress && d.progress.done) break;
      }
    } finally {
      driving.current = false;
      await load();
      setBusy(false);
    }
  }, [load]);

  useEffect(() => {
    if (data && data.activeRun && !driving.current) drive(data.activeRun.id);
  }, [data, drive]);

  const startAudit = useCallback(async (groups) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/discovery/runs", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "start_failed"); setBusy(false); return; }
      setProgress({ runId: d.runId, total: d.total, status: "running" });
      drive(d.runId);
    } catch (e) {
      setError(String(e.message || e));
      setBusy(false);
    }
  }, [drive]);

  const stopAudit = useCallback(async (runId) => {
    await fetch(`/api/admin/discovery/runs/${encodeURIComponent(runId)}/stop`, { method: "POST", credentials: "same-origin" }).catch(() => {});
    await load();
    setBusy(false);
  }, [load]);

  return { data, error, busy, progress, startAudit, stopAudit, reload: load, scope };
}

/** Живият прогрес на одита — сървърните числа, не клиентска догадка. */
export function AuditProgress({ progress, tl, onStop }) {
  if (!progress || progress.status !== "running") return null;
  const total = progress.total || 0;
  const done = (progress.passed || 0) + (progress.warning || 0) + (progress.failed || 0) + (progress.skipped || 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <section className="prof-card disc-progress">
      <div className="disc-card-head">
        <h2 className="prof-section-title">{tl("Одитът се изпълнява")}</h2>
        <button type="button" className="btn btn-danger" onClick={() => onStop(progress.runId || progress.id)}>{tl("Спри безопасно")}</button>
      </div>
      <div className="apl-bar"><span style={{ width: `${pct}%` }} /></div>
      <InfoGrid tl={tl} rows={[
        ["Текуща група", progress.currentCategory || "—"],
        ["Текущ ресурс", <span className="mono" key="r">{progress.currentResource || "—"}</span>],
        ["Изпълнени", `${done} / ${total}`],
        ["Чакащи", Math.max(0, total - done)],
        ["Неуспешни", progress.failed || 0],
        ["Стартиран", <FormattedDate value={progress.startedAt} key="s" />],
      ]} />
      <p className="chart-note"><Icon name="info" size={13} /> {tl("Одитът продължава на сървъра. Може да презаредите страницата — прогресът не се губи.")}</p>
    </section>
  );
}

/** История на валидациите. */
export function RunHistory({ history, tl }) {
  if (!history || !history.length) return <EmptyState tl={tl} titleKey="Няма записани одити" textKey="Историята се попълва след първия завършил одит." />;
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>{tl("Дата")}</th><th>{tl("Задействане")}</th><th>{tl("Версия")}</th>
            <th className="nowrap">{tl("Успешни")}</th><th className="nowrap">{tl("Предупреждения")}</th>
            <th className="nowrap">{tl("Неуспешни")}</th><th className="nowrap">{tl("Времетраене")}</th><th>{tl("Статус")}</th>
          </tr>
        </thead>
        <tbody>
          {history.map((r) => (
            <tr key={r.id}>
              <td className="nowrap"><FormattedDate value={r.startedAt} /></td>
              <td>{tl(r.triggerType === "manual" ? "Ръчно" : r.triggerType === "scheduled" ? "По график" : r.triggerType)}</td>
              <td className="mono">{r.version || "—"}</td>
              <td>{r.passed}</td><td>{r.warning}</td><td>{r.failed}</td>
              <td className="nowrap">{r.durationMs != null ? `${Math.round(r.durationMs / 100) / 10} s` : "—"}</td>
              <td><StatusChip status={r.status === "completed" ? (r.overallStatus || "passed") : r.status === "running" ? "pending" : "not_applicable"} tl={tl}>
                {r.status === "running" ? tl("Изпълнява се") : r.status === "stopped" ? tl("Спрян") : undefined}
              </StatusChip></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Отворени сигнали от валидациите (дедуплицирани сървърно). */
export function SignalList({ signals, tl, summaryText }) {
  if (!signals || !signals.length) return <EmptyState tl={tl} titleKey="Няма отворени сигнали" textKey="Валидациите не са открили нерешени проблеми." />;
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr><th>{tl("Тежест")}</th><th>{tl("Проверка")}</th><th>{tl("Ресурс")}</th><th>{tl("Описание")}</th><th className="nowrap">{tl("Засичания")}</th><th className="nowrap">{tl("Последно")}</th></tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.id}>
              <td><SeverityChip severity={s.severity} tl={tl} /></td>
              <td className="mono disc-code">{s.checkCode}</td>
              <td>{s.resourceUrl ? <UrlValue href={s.resourceUrl} /> : "—"}</td>
              <td>{summaryText(s)}</td>
              <td>{s.occurrences}</td>
              <td className="nowrap"><FormattedDate value={s.lastSeenAt} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Изтегляне на отчета като JSON — без тайни, всичко е вече редактирано. */
export function downloadReport(name, payload) {
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch { /* при блокирано изтегляне потребителят вижда данните в таблицата */ }
}

/** Потвърждение преди скъпо действие. */
export function ConfirmModal({ open, tl, titleKey, textKey, confirmKey, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h3>{tl(titleKey)}</h3>
        <p>{tl(textKey)}</p>
        <div className="disc-actions" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>{tl("Отказ")}</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>{tl(confirmKey)}</button>
        </div>
      </div>
    </div>
  );
}
