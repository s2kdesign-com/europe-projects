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
};
