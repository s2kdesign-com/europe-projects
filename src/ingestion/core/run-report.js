// Отчет за едно изпълнение на дневната синхронизация (v2.52.0).
//
// Дефинира точния набор метрики, които влизат в `scheduled_sync_runs` и в
// AI execution report, плюс генератора на `safe_summary` (кратко, без тайни).
//
// Времената НИКОГА не се смятат тук — те идват от D1 (`datetime('now')`).

/** Числовите метрики на run-а → колони в `scheduled_sync_runs`. */
export const RUN_COUNTERS = Object.freeze([
  "countries_touched", "countries_fully_processed",
  "sources_checked", "new_sources_discovered", "source_failures",
  "procedures_discovered", "procedures_created", "procedures_updated",
  "procedures_unchanged", "procedures_completed", "procedures_revisited",
  "documents_discovered", "documents_downloaded", "document_versions_added",
  "budgets_extracted", "budgets_converted", "eligibility_records_added",
  "anomalies_detected", "changes_recorded",
]);

/** Метрики с плаваща запетая (могат да са null, ако няма база за сравнение). */
export const RUN_RATIOS = Object.freeze([
  "average_quality_score",
  "document_coverage_before", "document_coverage_after",
  "budget_coverage_before", "budget_coverage_after",
]);

/** Текстови/навигационни полета. */
export const RUN_POINTERS = Object.freeze(["next_country", "next_source", "next_cursor"]);

export function emptyRunMetrics() {
  const m = {};
  for (const k of RUN_COUNTERS) m[k] = 0;
  for (const k of RUN_RATIOS) m[k] = null;
  for (const k of RUN_POINTERS) m[k] = null;
  m.countries = [];        // [{code, procedures, documents, budgets, anomalies, status}]
  m.sources = [];          // [{id, country, health, http_status, procedures_found}]
  m.blockedSources = [];   // [{id, country, reason}]
  m.timeAllocation = null; // {fresh, backfill, lowCoverage, discovery}
  return m;
}

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Слива метриките на една държава в общия отчет. */
export function mergeRunMetrics(total, part) {
  const out = total || emptyRunMetrics();
  for (const k of RUN_COUNTERS) out[k] = n(out[k]) + n(part && part[k]);
  if (part && Array.isArray(part.countries)) out.countries.push(...part.countries);
  if (part && Array.isArray(part.sources)) out.sources.push(...part.sources);
  if (part && Array.isArray(part.blockedSources)) out.blockedSources.push(...part.blockedSources);
  return out;
}

/** Среден quality score, претеглен по брой процедури (null при липса на данни). */
export function weightedAverageQuality(entries = []) {
  let sum = 0; let count = 0;
  for (const e of entries) {
    const s = Number(e && e.average_quality_score);
    const c = Number(e && e.procedures);
    if (!Number.isFinite(s) || !Number.isFinite(c) || c <= 0) continue;
    sum += s * c; count += c;
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}

/** Разлика в покритието в процентни пунктове (null, ако липсва база). */
export function coverageDelta(before, after) {
  if (before === null || before === undefined || before === "") return null;
  if (after === null || after === undefined || after === "") return null;
  const b = Number(before); const a = Number(after);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
  return Math.round((a - b) * 10) / 10;
}

const pct = (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v) * 10) / 10}%` : "няма данни");
const delta = (d) => (d === null ? "" : ` (${d >= 0 ? "+" : ""}${d} п.п.)`);

/**
 * Кратко човешко резюме за `scheduled_sync_runs.safe_summary`.
 * Съдържа само безопасни агрегати — без URL с токени, без тайни.
 */
export function buildSafeSummary(m = emptyRunMetrics(), { maxLength = 1000 } = {}) {
  const codes = (m.countries || []).map((c) => c.code).filter(Boolean);
  const parts = [];
  parts.push(`Държави: ${codes.length ? codes.join(", ") : "няма"} (${n(m.countries_touched)} засегнати, ${n(m.countries_fully_processed)} завършени).`);
  parts.push(`Източници: ${n(m.sources_checked)} проверени, ${n(m.new_sources_discovered)} нови кандидати, ${n(m.source_failures)} неуспешни.`);
  parts.push(`Процедури: +${n(m.procedures_created)} нови, ${n(m.procedures_updated)} обновени, ${n(m.procedures_unchanged)} без промяна, ${n(m.procedures_revisited)} допълнени стари.`);
  parts.push(`Документи: ${n(m.documents_downloaded)} свалени от ${n(m.documents_discovered)} открити, ${n(m.document_versions_added)} нови версии.`);
  parts.push(`Бюджети: ${n(m.budgets_extracted)} структурирани (${n(m.budgets_converted)} конвертирани в EUR).`);
  const dDoc = coverageDelta(m.document_coverage_before, m.document_coverage_after);
  const dBud = coverageDelta(m.budget_coverage_before, m.budget_coverage_after);
  parts.push(`Покритие: документи ${pct(m.document_coverage_after)}${delta(dDoc)}, бюджети ${pct(m.budget_coverage_after)}${delta(dBud)}.`);
  if (m.average_quality_score != null) parts.push(`Средно качество: ${m.average_quality_score}/100.`);
  if (n(m.anomalies_detected) > 0) parts.push(`Аномалии: ${n(m.anomalies_detected)} за преглед.`);
  const blocked = (m.blockedSources || []).map((s) => `${s.country || "?"}:${s.id || "?"}`);
  if (blocked.length) parts.push(`Блокирани портали: ${blocked.slice(0, 8).join(", ")}${blocked.length > 8 ? "…" : ""}.`);
  parts.push(`Следва: ${m.next_country || "—"}${m.next_source ? ` / ${m.next_source}` : ""}.`);
  const text = parts.join(" ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** INSERT за отчета — колоните съществуват след migration 0025. */
export const RUN_INSERT_SQL = `
INSERT INTO scheduled_sync_runs (
  task_key, started_at, completed_at, status, cycle_number,
  start_country_code, end_country_code,
  countries_attempted, countries_succeeded, countries_failed,
  sources_attempted, sources_succeeded, sources_failed,
  records_seen, records_inserted, records_updated, records_unchanged, records_invalid,
  documents_inserted, continuation_country_code, safe_summary, created_at,
  countries_touched, countries_fully_processed, sources_checked, new_sources_discovered,
  source_failures, procedures_discovered, procedures_created, procedures_updated,
  procedures_unchanged, procedures_completed, procedures_revisited,
  documents_discovered, documents_downloaded, document_versions_added,
  budgets_extracted, budgets_converted, eligibility_records_added,
  anomalies_detected, changes_recorded, average_quality_score,
  document_coverage_before, document_coverage_after,
  budget_coverage_before, budget_coverage_after,
  next_country, next_source, next_cursor,
  countries_json, sources_json, time_allocation_json, blocked_sources_json
) VALUES (
  ?1, ?2, datetime('now'), ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
  ?18, ?19, ?20, datetime('now'),
  ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39,
  ?40, ?41, ?42, ?43, ?44, ?45, ?46, ?47, ?48, ?49, ?50, ?51
);`;

/** Покритие ПРЕДИ/СЛЕД — една заявка, честни null-ове при 0 процедури. */
export const COVERAGE_SNAPSHOT_SQL = `
SELECT
  (SELECT COUNT(*) FROM projects) AS total,
  (SELECT COUNT(DISTINCT d.project_id) FROM documents d) AS with_documents,
  (SELECT COUNT(*) FROM project_details pd WHERE pd.has_primary_document = 1) AS with_primary_document,
  (SELECT COUNT(*) FROM projects p WHERE p.budget_amount_eur IS NOT NULL) AS with_budget,
  (SELECT ROUND(AVG(pd.completeness_score), 1) FROM project_details pd WHERE pd.completeness_score IS NOT NULL) AS avg_quality;`;

/** Изчислява проценти от реда на COVERAGE_SNAPSHOT_SQL. */
export function coverageFromRow(row) {
  const total = Number(row && row.total) || 0;
  if (total <= 0) return { documentCoverage: null, budgetCoverage: null, primaryDocumentCoverage: null, averageQuality: null, total: 0 };
  const r1 = (v) => Math.round((Number(v) || 0) / total * 1000) / 10;
  return {
    total,
    documentCoverage: r1(row.with_documents),
    budgetCoverage: r1(row.with_budget),
    primaryDocumentCoverage: r1(row.with_primary_document),
    averageQuality: row.avg_quality == null ? null : Number(row.avg_quality),
  };
}

const runReport = {
  RUN_COUNTERS, RUN_RATIOS, RUN_POINTERS, emptyRunMetrics, mergeRunMetrics,
  weightedAverageQuality, coverageDelta, buildSafeSummary,
  RUN_INSERT_SQL, COVERAGE_SNAPSHOT_SQL, coverageFromRow,
};
export default runReport;
