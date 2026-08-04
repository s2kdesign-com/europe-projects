// Weighted round-robin покритие на държавите (v2.52.0).
//
// Проблемът, който решава: една държава с много процедури изяждаше почти целия
// времеви бюджет на изпълнението и cursor-ът напредваше по една държава на run.
// Тук се разпределя времето по ЦЕЛ (а не по държава) и се ограничава колко
// процедури може да вземе една държава, преди да отстъпи на следващата.
//
// ЧИСТА логика — без I/O, без Date.now() вътре в решенията (времето се подава).
// D1 остава единственият source of truth: този модул само пресмята план, който
// извикващият записва в `scheduled_country_sync_state` / `scheduled_sync_runs`.
//
// БЕЗ hardcoded държави: всички входни данни идват от таблицата `countries`.

/** Дялове от времевия бюджет на едно изпълнение. Сборът е 1.0. */
export const TIME_ALLOCATION = Object.freeze({
  fresh: 0.45,        // нови и актуализирани процедури от активни държави
  backfill: 0.30,     // допълване на процедури без документи/бюджет/детайли
  lowCoverage: 0.15,  // държави с ниско историческо покритие
  discovery: 0.10,    // откриване и проверка на нови официални източници
});

/** Колко пълни процедури може да обработи една държава, преди да отстъпи. */
export const COUNTRY_PROCEDURE_CAP = Object.freeze({ min: 15, max: 25 });

/** Целеви минимум различни държави на успешно изпълнение. */
export const MIN_COUNTRIES_PER_RUN = 4;

/** Държава се смята за „скоро синхронизирана", ако е пипната в този прозорец. */
export const RECENT_SYNC_DAYS = 3;

/** Под този праг покритието се смята за ниско. */
export const LOW_COVERAGE = Object.freeze({ documents: 0.5, budget: 0.35 });

/** Причини за приоритет → тегло. По-голямо тегло = по-рано в опашката. */
export const PRIORITY_REASONS = Object.freeze({
  zero_procedures: 1000,
  never_synced: 900,
  stale_sync: 700,
  low_document_coverage: 500,
  low_budget_coverage: 400,
  thin_history: 300,
  failing_sources: 250,
  blocked_sources: 200,
});

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Разпределя времевия бюджет на run-а по цели (в милисекунди). */
export function allocateTime(totalMs) {
  const total = Math.max(0, num(totalMs));
  const fresh = Math.round(total * TIME_ALLOCATION.fresh);
  const backfill = Math.round(total * TIME_ALLOCATION.backfill);
  const lowCoverage = Math.round(total * TIME_ALLOCATION.lowCoverage);
  // остатъкът отива в discovery, за да няма загуба от закръгляне
  const discovery = Math.max(0, total - fresh - backfill - lowCoverage);
  return { totalMs: total, fresh, backfill, lowCoverage, discovery };
}

/** Дни между две ISO дати (или null, ако липсва). */
export function daysSince(iso, now) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const ref = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(ref)) return null;
  return (ref - t) / 86400000;
}

/**
 * Оценка за приоритет на държава. Входът е ред от `countries`, обогатен с
 * агрегати от D1 (без нито един hardcoded код на държава).
 *
 * c = {
 *   code, priority, enabled, ingestion_status, last_successful_sync_at,
 *   total_procedures, procedures_with_documents, procedures_with_budget,
 *   verified_enabled_sources, failing_sources, blocked_sources
 * }
 */
export function countryPriorityScore(c, { now = new Date() } = {}) {
  const reasons = [];
  let score = 0;
  const total = num(c && c.total_procedures);
  const docs = num(c && c.procedures_with_documents);
  const budget = num(c && c.procedures_with_budget);
  const sinceSync = daysSince(c && c.last_successful_sync_at, now);

  if (total === 0) { score += PRIORITY_REASONS.zero_procedures; reasons.push("zero_procedures"); }
  if (sinceSync === null) { score += PRIORITY_REASONS.never_synced; reasons.push("never_synced"); }
  else if (sinceSync > RECENT_SYNC_DAYS) {
    // колкото по-стар е sync-ът, толкова по-висок приоритет (с таван)
    score += PRIORITY_REASONS.stale_sync + clamp(Math.round(sinceSync), 0, 180);
    reasons.push("stale_sync");
  }
  if (total > 0) {
    const docCov = docs / total;
    const budCov = budget / total;
    if (docCov < LOW_COVERAGE.documents) {
      score += Math.round(PRIORITY_REASONS.low_document_coverage * (1 - docCov));
      reasons.push("low_document_coverage");
    }
    if (budCov < LOW_COVERAGE.budget) {
      score += Math.round(PRIORITY_REASONS.low_budget_coverage * (1 - budCov));
      reasons.push("low_budget_coverage");
    }
    if (total < 10) { score += PRIORITY_REASONS.thin_history; reasons.push("thin_history"); }
  }
  if (num(c && c.failing_sources) > 0) { score += PRIORITY_REASONS.failing_sources; reasons.push("failing_sources"); }
  if (num(c && c.blocked_sources) > 0) { score += PRIORITY_REASONS.blocked_sources; reasons.push("blocked_sources"); }

  // Конфигурираният `countries.priority` НЕ влиза в резултата — той определя само
  // базовата подредба (`orderCountries`). Ако влизаше, държавите с нисък priority
  // винаги щяха да печелят и точка 7 „round-robin cursor за останалите" никога
  // нямаше да се задейства.
  return { code: c && c.code, score, reasons };
}

/** Позиция на държавата в round-robin реда след cursor-а (0 = веднага следваща). */
export function rotationOffset(orderedCodes, lastCompletedCode, code) {
  const n = orderedCodes.length;
  if (n === 0) return 0;
  const idx = orderedCodes.indexOf(code);
  if (idx === -1) return n;
  const from = lastCompletedCode ? orderedCodes.indexOf(lastCompletedCode) : -1;
  const start = from === -1 ? 0 : (from + 1) % n;
  return (idx - start + n) % n;
}

/**
 * Планира едно изпълнение. Връща опашка от държави с цел и таван за всяка.
 *
 * Правила:
 *  • държавите се обработват ПОСЛЕДОВАТЕЛНО (опашката е ред, не паралелизъм);
 *  • нито една държава не монополизира — таван COUNTRY_PROCEDURE_CAP;
 *  • стреми се към ≥ MIN_COUNTRIES_PER_RUN различни държави;
 *  • при равни резултати печели по-далечният от cursor-а (истински round-robin).
 */
export function planCoverageRun({
  countries = [],
  lastCompletedCode = null,
  now = new Date(),
  minCountries = MIN_COUNTRIES_PER_RUN,
  timeBudgetMs = 0,
} = {}) {
  const eligible = countries.filter((c) => c && c.code);
  const ordered = [...eligible]
    .sort((a, b) => (num(a.priority, 100) - num(b.priority, 100)) || String(a.code).localeCompare(String(b.code)))
    .map((c) => c.code);

  const scored = eligible.map((c) => {
    const s = countryPriorityScore(c, { now });
    return { ...s, country: c, offset: rotationOffset(ordered, lastCompletedCode, c.code) };
  });

  // По-висок score първо; при равенство — по-рано в round-robin реда.
  scored.sort((a, b) => (b.score - a.score) || (a.offset - b.offset) || String(a.code).localeCompare(String(b.code)));

  const allocation = allocateTime(timeBudgetMs);
  const queue = [];
  const targetCount = Math.min(Math.max(1, minCountries), scored.length);

  for (const s of scored) {
    if (queue.length >= targetCount) break;
    queue.push({
      code: s.code,
      country: s.country,
      score: Math.round(s.score * 10) / 10,
      reasons: s.reasons,
      objective: primaryObjective(s.reasons),
      procedureCap: procedureCapFor(s.country),
    });
  }

  return {
    queue,
    allocation,
    orderedCodes: ordered,
    newCycle: !!lastCompletedCode && rotationOffset(ordered, lastCompletedCode, queue[0] && queue[0].code) === 0 && ordered[0] === (queue[0] && queue[0].code),
    minCountries: targetCount,
  };
}

/** Основната цел за държавата според най-силната причина. */
export function primaryObjective(reasons = []) {
  if (reasons.includes("zero_procedures") || reasons.includes("never_synced")) return "lowCoverage";
  if (reasons.includes("low_document_coverage") || reasons.includes("low_budget_coverage")) return "backfill";
  if (reasons.includes("blocked_sources") || reasons.includes("failing_sources")) return "discovery";
  return "fresh";
}

/**
 * Таван за брой пълни процедури от една държава.
 * Изключение (до 2× max) само при критично затварящи процедури или голям
 * backlog без документи — както е описано в изискванията.
 */
export function procedureCapFor(country = {}, { criticalClosingSoon = 0, backlogWithoutDocuments = 0 } = {}) {
  const total = num(country.total_procedures);
  const docs = num(country.procedures_with_documents);
  const missingDocs = Math.max(num(backlogWithoutDocuments), Math.max(0, total - docs));
  let cap = total === 0 ? COUNTRY_PROCEDURE_CAP.max : COUNTRY_PROCEDURE_CAP.min;
  if (missingDocs >= COUNTRY_PROCEDURE_CAP.max) cap = COUNTRY_PROCEDURE_CAP.max;
  if (num(criticalClosingSoon) > 0) cap = COUNTRY_PROCEDURE_CAP.max;
  // Изключение: голям backlog ИЛИ критично затварящи → до 2× max, но не безкрайно.
  if (num(criticalClosingSoon) > COUNTRY_PROCEDURE_CAP.max || missingDocs > 3 * COUNTRY_PROCEDURE_CAP.max) {
    cap = COUNTRY_PROCEDURE_CAP.max * 2;
  }
  return cap;
}

/** Трябва ли да отстъпим на следващата държава? */
export function shouldYieldCountry({ processed = 0, cap = COUNTRY_PROCEDURE_CAP.min, elapsedMs = 0, sliceMs = Infinity } = {}) {
  if (processed >= cap) return { yield: true, reason: "procedure_cap" };
  if (elapsedMs >= sliceMs) return { yield: true, reason: "time_slice" };
  return { yield: false, reason: null };
}

/** Покритие (0..1) с честни null-ове, когато няма процедури. */
export function coverageRatios(row = {}) {
  const total = num(row.total_procedures);
  if (total <= 0) return { documents: null, budget: null, primaryDocument: null };
  return {
    documents: num(row.procedures_with_documents) / total,
    budget: num(row.procedures_with_budget) / total,
    primaryDocument: row.procedures_with_primary_document == null
      ? null : num(row.procedures_with_primary_document) / total,
  };
}

/**
 * SQL за динамично приоритизиране — БЕЗ списък с кодове на държави.
 * Връща по един ред на държава с агрегатите, които `countryPriorityScore` иска.
 */
export const COUNTRY_PRIORITY_SQL = `
SELECT c.code, c.slug, c.priority, c.enabled, c.ingestion_status, c.coverage_status,
       c.last_successful_sync_at, c.default_language, c.currency_code,
       (SELECT COUNT(*) FROM projects p WHERE p.country_code = c.code) AS total_procedures,
       (SELECT COUNT(DISTINCT d.project_id) FROM documents d
          JOIN projects p ON p.id = d.project_id WHERE p.country_code = c.code) AS procedures_with_documents,
       (SELECT COUNT(*) FROM projects p WHERE p.country_code = c.code AND p.budget_amount_eur IS NOT NULL) AS procedures_with_budget,
       (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code = c.code AND pd.has_primary_document = 1) AS procedures_with_primary_document,
       (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code = c.code AND f.enabled = 1 AND f.verified = 1) AS verified_enabled_sources,
       (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code = c.code AND f.source_health = 'failing') AS failing_sources,
       (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code = c.code AND f.source_health = 'blocked') AS blocked_sources,
       (SELECT COUNT(*) FROM project_anomalies a WHERE a.country_code = c.code AND a.status = 'open') AS open_anomalies
  FROM countries c
 WHERE c.eu_member = 1
 ORDER BY c.priority ASC, c.code ASC;`;

const coverage = {
  TIME_ALLOCATION, COUNTRY_PROCEDURE_CAP, MIN_COUNTRIES_PER_RUN,
  allocateTime, countryPriorityScore, planCoverageRun, procedureCapFor,
  shouldYieldCountry, coverageRatios, rotationOffset, primaryObjective,
  COUNTRY_PRIORITY_SQL,
};
export default coverage;
