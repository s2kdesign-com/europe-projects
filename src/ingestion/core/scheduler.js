// Чиста (без I/O) логика за multi-country Scheduled Task: избор на следваща
// държава (round-robin по cursor), права за production sync, locks и timeout
// safety. Използва се от оркестратора/Scheduled Task и се тества самостоятелно.
//
// D1 е source of truth: cursor-ът живее в scheduled_country_sync_state, а НЕ в
// паметта на Scheduled Task.

export const TASK_KEY = "daily-eu-country-sync";
export const LOCK_TTL_MINUTES = 50;

// Статуси, при които държавата е готова за production sync (Група A).
export const SYNCABLE_STATUSES = ["connector_ready", "active", "degraded"];
// Статуси в процес на добавяне (Група B) — rollout продължава, но БЕЗ production запис.
export const ROLLOUT_STATUSES = ["not_started", "researching", "sources_verified", "connector_in_progress", "blocked"];

// Може ли държавата да бъде production sync-ната. Изисква: разрешаващ статус +
// поне един verified & enabled източник + наличен connector в registry.
export function canProductionSync(country, { verifiedEnabledSources = 0, hasConnector = false } = {}) {
  if (!country || !country.code) return false;
  if (!SYNCABLE_STATUSES.includes(country.ingestion_status)) return false;
  if (verifiedEnabledSources < 1) return false;
  if (!hasConnector) return false;
  return true;
}

// Подрежда държавите за цикъла: по priority, после по код (стабилно).
export function orderCountries(countries) {
  return [...(countries || [])].sort((a, b) => (a.priority - b.priority) || String(a.code).localeCompare(String(b.code)));
}

// Следваща държава по cursor (round-robin). Ако няма cursor → първата.
// Ако cursor-ът сочи последната → нов цикъл от първата (wrap + cycle bump).
export function nextCountry(countries, lastCompletedCode) {
  const ordered = orderCountries(countries);
  if (ordered.length === 0) return { country: null, wrapped: false };
  if (!lastCompletedCode) return { country: ordered[0], wrapped: false };
  const idx = ordered.findIndex((c) => c.code === lastCompletedCode);
  if (idx === -1 || idx === ordered.length - 1) return { country: ordered[0], wrapped: true };
  return { country: ordered[idx + 1], wrapped: false };
}

// Планира изпълнението на един run: от cursor-а нататък, до maxCountries.
// Връща наредения списък + дали започва нов цикъл.
export function planRun(countries, lastCompletedCode, maxCountries = 3) {
  const ordered = orderCountries(countries);
  if (ordered.length === 0) return { queue: [], newCycle: false };
  const { country: first, wrapped } = nextCountry(ordered, lastCompletedCode);
  const start = ordered.findIndex((c) => c.code === first.code);
  const queue = [];
  for (let i = 0; i < Math.min(maxCountries, ordered.length); i++) {
    queue.push(ordered[(start + i) % ordered.length]);
  }
  return { queue, newCycle: wrapped };
}

// --- Lock логика (чисти проверки; реалните UPDATE-и са в SQL) ---
export function isLockActive(lock, now = new Date()) {
  if (!lock || !lock.locked_at) return false;
  if (!lock.lock_expires_at) return false;
  return new Date(lock.lock_expires_at) > now;
}
export function canAcquireLock(lock, now = new Date()) {
  return !isLockActive(lock, now); // свободен или изтекъл → може
}
export function makeLock(runId, now = new Date(), ttlMinutes = LOCK_TTL_MINUTES) {
  return {
    locked_at: now.toISOString(),
    locked_by: runId,
    lock_expires_at: new Date(now.getTime() + ttlMinutes * 60000).toISOString(),
  };
}

// --- Timeout safety ---
export function makeTimeBudget(startedAtMs, safeWindowMs) {
  return { shouldContinue: () => Date.now() - startedAtMs < safeWindowMs };
}

// SQL шаблони (централизирани, за да са еднакви в Scheduled Task и Worker).
export const SQL = {
  loadCountries: `SELECT code, slug, native_name, english_name, default_language, enabled, ingestion_status, coverage_status, priority, last_successful_sync_at FROM countries WHERE eu_member = 1 ORDER BY priority ASC, code ASC;`,
  loadSources: `SELECT * FROM funding_sources WHERE country_code = ?1 AND enabled = 1 AND verified = 1 ORDER BY priority ASC, id ASC;`,
  loadCursor: `SELECT * FROM scheduled_country_sync_state WHERE task_key = ?1;`,
  acquireLock: `UPDATE country_sync_state SET locked_at=?1, locked_by=?2, lock_expires_at=?3 WHERE country_code=?4 AND (lock_expires_at IS NULL OR lock_expires_at < ?1);`,
  releaseLock: `UPDATE country_sync_state SET locked_at=NULL, locked_by=NULL, lock_expires_at=NULL WHERE country_code=?1 AND locked_by=?2;`,

  // ── v2.52.0: дълбоко извличане ───────────────────────────────────────────
  // Всички източници на държавата (не само основния портал), включително
  // алтернативните канали за достъп (sitemap/RSS/API/архив/търсене).
  loadAllSources: `SELECT id, country_code, name, authority_name, authority_type, source_type, source_level,
       base_url, calls_url, archive_url, search_url, rss_url, api_url, sitemap_url, documents_url,
       source_language, requires_javascript, requires_pagination, supports_api, supports_rss,
       supports_sitemap, access_method, priority, enabled, verified, source_health, blocked_reason,
       last_checked_at, last_http_status, avg_response_time_ms, last_procedures_found, last_procedures_valid
  FROM funding_sources WHERE country_code = ?1 ORDER BY primary_source DESC, priority ASC, id ASC;`,

  // Backfill опашка: процедури БЕЗ документи (30% дял от времето).
  backlogWithoutDocuments: `SELECT p.id, p.name, p.official_url, p.link, p.country_code, p.source_id, p.deadline_date, p.status
  FROM projects p
  LEFT JOIN documents d ON d.project_id = p.id
 WHERE p.country_code = ?1 AND d.id IS NULL
 ORDER BY CASE WHEN p.status IN ('open','closing_soon') THEN 0 ELSE 1 END,
          p.deadline_date IS NULL, p.deadline_date ASC
 LIMIT ?2;`,

  // Backfill опашка: процедури без структуриран бюджет.
  backlogWithoutBudget: `SELECT p.id, p.name, p.official_url, p.link, p.country_code, p.budget, p.budget_currency, p.deadline_date, p.status
  FROM projects p
 WHERE p.country_code = ?1 AND p.budget_amount_eur IS NULL
 ORDER BY CASE WHEN p.status IN ('open','closing_soon') THEN 0 ELSE 1 END,
          p.budget IS NULL, p.deadline_date ASC
 LIMIT ?2;`,

  // Backfill опашка: процедури с непълни детайли.
  backlogWithoutDetails: `SELECT p.id, p.name, p.official_url, p.link, p.country_code, p.status, p.deadline_date
  FROM projects p
  LEFT JOIN project_details pd ON pd.project_id = p.id
 WHERE p.country_code = ?1
   AND (pd.project_id IS NULL OR pd.completeness_score IS NULL OR pd.completeness_score < 70)
 ORDER BY COALESCE(pd.completeness_score, -1) ASC,
          CASE WHEN p.status IN ('open','closing_soon') THEN 0 ELSE 1 END,
          p.deadline_date ASC
 LIMIT ?2;`,

  // Критично затварящи процедури — единственото основание за надхвърляне на тавана.
  criticalClosingSoon: `SELECT COUNT(*) AS n FROM projects
 WHERE country_code = ?1 AND status IN ('open','closing_soon')
   AND deadline_date IS NOT NULL AND deadline_date <= date('now','+14 day');`,

  // Pagination cursor per (task, country, source, section).
  loadPaginationCursor: `SELECT * FROM source_pagination_cursors
 WHERE task_key = ?1 AND country_code = ?2 AND source_id = ?3 AND section = ?4;`,
  savePaginationCursor: `INSERT INTO source_pagination_cursors
   (task_key, country_code, source_id, section, page, item_offset, last_procedure_id, pages_seen, exhausted, last_run_id, updated_at)
 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10, datetime('now'))
 ON CONFLICT(task_key, country_code, source_id, section) DO UPDATE SET
   page = excluded.page, item_offset = excluded.item_offset,
   last_procedure_id = excluded.last_procedure_id, pages_seen = excluded.pages_seen,
   exhausted = excluded.exhausted, last_run_id = excluded.last_run_id, updated_at = datetime('now');`,

  // Здраве на източника — append-only времеви ред + обновяване на агрегата.
  insertSourceHealth: `INSERT INTO source_health_history
   (source_id, country_code, checked_at, run_id, access_method, ok, http_status, response_time_ms,
    procedures_found, procedures_valid, documents_found, health, error_code, error_summary, created_at)
 VALUES (?1,?2, datetime('now'), ?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13, datetime('now'));`,
  // ВАЖНО: `total_*` НЕ се инкрементират, а се ИЗВЕЖДАТ от append-only лога
  // `source_health_history`, групиран по run_id. Инкрементът
  // (`total = total + ?`) двойно броеше при повторно изпълнение на една и съща
  // проверка (at-least-once retry). Изведената стойност е идемпотентна: повторна
  // проверка в същия run не променя сумата.
  updateSourceMetrics: `UPDATE funding_sources SET
   last_checked_at = datetime('now'),
   last_http_status = ?2, avg_response_time_ms = ?3,
   last_procedures_found = ?4, last_procedures_valid = ?5,
   total_procedures_found = (SELECT COALESCE(SUM(found), 0) FROM
     (SELECT MAX(procedures_found) AS found FROM source_health_history
       WHERE source_id = ?1 AND run_id IS NOT NULL GROUP BY run_id)),
   total_procedures_valid = (SELECT COALESCE(SUM(valid), 0) FROM
     (SELECT MAX(procedures_valid) AS valid FROM source_health_history
       WHERE source_id = ?1 AND run_id IS NOT NULL GROUP BY run_id)),
   access_method = COALESCE(?6, access_method),
   source_health = ?7, blocked_reason = ?8,
   last_success_at = CASE WHEN ?7 = 'healthy' THEN datetime('now') ELSE last_success_at END,
   last_failure_at = CASE WHEN ?7 IN ('failing','blocked') THEN datetime('now') ELSE last_failure_at END,
   consecutive_failures = CASE WHEN ?7 = 'healthy' THEN 0 ELSE consecutive_failures + 1 END,
   updated_at = datetime('now')
 WHERE id = ?1;`,

  // Кандидати за нови официални източници (дедуплицирани по нормализиран URL).
  upsertSourceCandidate: `INSERT INTO source_discovery_candidates
   (country_code, candidate_url, normalized_url, title, authority_name, authority_type, source_type,
    language, discovered_from, discovery_method, http_status, content_type, evidence_url,
    official_confidence, status, notes, run_id, first_seen_at, last_checked_at)
 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14, COALESCE(?15,'new'), ?16, ?17, datetime('now'), datetime('now'))
 ON CONFLICT(country_code, normalized_url) DO UPDATE SET
   title = COALESCE(excluded.title, title),
   http_status = excluded.http_status,
   content_type = COALESCE(excluded.content_type, content_type),
   official_confidence = COALESCE(excluded.official_confidence, official_confidence),
   discovery_method = COALESCE(excluded.discovery_method, discovery_method),
   run_id = excluded.run_id,
   last_checked_at = datetime('now');`,

  // Аномалии.
  insertAnomaly: `INSERT INTO project_anomalies
   (project_id, country_code, anomaly_type, severity, field_name, observed_value, expected_value,
    page_value, document_value, source_url, document_id, run_id, status, notes, detected_at, created_at)
 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'open',?13, datetime('now'), datetime('now'));`,

  // Качество (1:1 разширение — `projects` е на тавана от 100 колони в D1).
  upsertProjectDetails: `INSERT INTO project_details
   (project_id, country_code, completeness_score, quality_status, quality_computed_at, source_version,
    has_primary_document, documents_published_by_source, documents_absence_evidence_url,
    detail_extraction_status, detail_extracted_at, last_run_id, created_at, updated_at)
 VALUES (?1,?2,?3,?4, datetime('now'), ?5,?6,?7,?8,?9, datetime('now'), ?10, datetime('now'), datetime('now'))
 ON CONFLICT(project_id) DO UPDATE SET
   country_code = excluded.country_code,
   completeness_score = excluded.completeness_score,
   quality_status = excluded.quality_status,
   quality_computed_at = datetime('now'),
   source_version = COALESCE(excluded.source_version, source_version),
   has_primary_document = excluded.has_primary_document,
   documents_published_by_source = COALESCE(excluded.documents_published_by_source, documents_published_by_source),
   documents_absence_evidence_url = COALESCE(excluded.documents_absence_evidence_url, documents_absence_evidence_url),
   detail_extraction_status = excluded.detail_extraction_status,
   detail_extracted_at = datetime('now'),
   last_run_id = excluded.last_run_id,
   updated_at = datetime('now');`,

  upsertBudgetTerms: `INSERT INTO project_budget_terms
   (project_id, country_code, min_financing_rate, max_financing_rate, own_contribution_rate,
    state_aid_regime, de_minimis_limit_eur, budget_is_indicative, budget_original_amount,
    budget_fx_rate, budget_fx_date, budget_source_type, budget_source_url, budget_scope,
    notes, created_at, updated_at)
 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15, datetime('now'), datetime('now'))
 ON CONFLICT(project_id) DO UPDATE SET
   country_code = excluded.country_code,
   min_financing_rate = COALESCE(excluded.min_financing_rate, min_financing_rate),
   max_financing_rate = COALESCE(excluded.max_financing_rate, max_financing_rate),
   own_contribution_rate = COALESCE(excluded.own_contribution_rate, own_contribution_rate),
   state_aid_regime = COALESCE(excluded.state_aid_regime, state_aid_regime),
   de_minimis_limit_eur = COALESCE(excluded.de_minimis_limit_eur, de_minimis_limit_eur),
   budget_is_indicative = COALESCE(excluded.budget_is_indicative, budget_is_indicative),
   budget_original_amount = COALESCE(excluded.budget_original_amount, budget_original_amount),
   budget_fx_rate = COALESCE(excluded.budget_fx_rate, budget_fx_rate),
   budget_fx_date = COALESCE(excluded.budget_fx_date, budget_fx_date),
   budget_source_type = COALESCE(excluded.budget_source_type, budget_source_type),
   budget_source_url = COALESCE(excluded.budget_source_url, budget_source_url),
   budget_scope = COALESCE(excluded.budget_scope, budget_scope),
   updated_at = datetime('now');`,

  // Бюджетни компоненти и допустимост — идемпотентни по естествения ключ.
  upsertBudgetComponent: `INSERT INTO project_budget_components
   (project_id, country_code, component_type, component_key, label, amount, currency, amount_eur,
    fx_rate, fx_date, is_indicative, source_type, source_url, document_id, run_id, notes, created_at, updated_at)
 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16, datetime('now'), datetime('now'))
 ON CONFLICT(project_id, component_type, component_key) DO UPDATE SET
   label = COALESCE(excluded.label, label), amount = excluded.amount, currency = excluded.currency,
   amount_eur = excluded.amount_eur, fx_rate = excluded.fx_rate, fx_date = excluded.fx_date,
   is_indicative = excluded.is_indicative, source_type = excluded.source_type,
   source_url = excluded.source_url, document_id = excluded.document_id, run_id = excluded.run_id,
   updated_at = datetime('now');`,

  upsertEligibility: `INSERT INTO project_eligibility
   (project_id, country_code, dimension, value_key, value_label, eligible, notes,
    source_type, source_url, document_id, run_id, created_at, updated_at)
 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11, datetime('now'), datetime('now'))
 ON CONFLICT(project_id, dimension, value_key) DO UPDATE SET
   value_label = COALESCE(excluded.value_label, value_label),
   eligible = excluded.eligible, notes = COALESCE(excluded.notes, notes),
   source_type = excluded.source_type, source_url = excluded.source_url,
   document_id = excluded.document_id, run_id = excluded.run_id, updated_at = datetime('now');`,

  // Документи: дедупликация по нормализиран URL (без UNIQUE индекс — в
  // продукцията има заварени дубликати, които правилата забраняват да се трият).
  findDocumentByUrl: `SELECT id, checksum, doc_category, is_primary, version_label
  FROM documents WHERE project_id = ?1 AND normalized_url = ?2 LIMIT 1;`,
  insertDocumentVersion: `INSERT OR IGNORE INTO document_versions
   (document_id, project_id, country_code, version_label, checksum, source_url, normalized_url,
    published_at, size_bytes, mime_type, is_amendment, change_summary, run_id, created_at)
 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13, datetime('now'));`,
};
