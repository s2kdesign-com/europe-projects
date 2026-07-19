// NightlyAIOrchestrator + D1 job queue + purpose executors.
// Строи се върху AIExecutionService (worker/ai/providers.js). НЕ дублира daily_review
// (той е Claude Scheduled Task). future_chat НИКОГА не се планира/изпълнява тук.
//
// Поток: daily_review (външен) → procedure_analysis → {document_analysis, budget_analysis}
// → recommendation. Всеки job е ред в ai_jobs с lock + idempotency. Обработва се на
// малки batch-ове през continuation trigger (не в един дълъг Worker request).

import { AIExecutionService, attachRunResult } from "./providers.js";
import { buildResultSummary, buildResultDetails } from "./summaries.js";
import { PROMPT_VERSIONS, SYSTEM_PROMPTS, buildPrompt, parseAndValidate } from "./prompts.js";

// Кои purposes са част от nightly pipeline-а (future_chat умишлено липсва).
export const PIPELINE_PURPOSES = ["procedure_analysis", "document_analysis", "budget_analysis", "recommendation"];
export const EXCLUDED_PURPOSES = ["daily_review", "future_chat"];

// Dependency graph: purpose → списък purposes, които трябва да са готови преди него.
export const PURPOSE_DEPS = {
  procedure_analysis: [],
  document_analysis: ["procedure_analysis"],
  budget_analysis: ["procedure_analysis"],
  recommendation: ["procedure_analysis", "document_analysis", "budget_analysis"],
};

export function isPipelinePurpose(p) { return PIPELINE_PURPOSES.includes(p); }
export function isExcludedPurpose(p) { return EXCLUDED_PURPOSES.includes(p); }

// Малък детерминистичен хеш (djb2) за текст без нативен content_hash (документи/бюджет).
export function hashText(str) {
  let h = 5381;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// Идемпотентен ключ: същият вход + модел + prompt/schema версия → същият ключ →
// не се обработва повторно (skipped_unchanged).
export function idempotencyKey({ purpose, entityType, entityId, sourceHash, modelId }) {
  const pv = PROMPT_VERSIONS[purpose] || { version: "v0", schema: "v0" };
  return `${purpose}:${entityType}:${entityId}:${sourceHash || "nohash"}:${modelId}:${pv.version}:${pv.schema}`;
}

// Приоритет по спешност (по-малко число = по-висок приоритет).
export function jobPriority({ status, deadlineDays, isNewToday, isChangedToday, isFailed, isFullReanalysis }) {
  if (isFailed) return 60;
  if (deadlineDays != null && deadlineDays >= 0 && deadlineDays <= 7) return 10;
  if (deadlineDays != null && deadlineDays >= 0 && deadlineDays <= 30) return 20;
  if (isNewToday) return 30;
  if (isChangedToday) return 40;
  if (isFullReanalysis) return 200; // никога не изпреварва спешните
  return 100;
}

// Само неутрални структурирани полета към recommendation модела (privacy).
// НЕ подаваме email, име, Google ID, сесия, бележки, notification preferences.
const REC_ALLOWED_PROFILE_FIELDS = ["p_country", "p_org_type", "p_size", "p_sectors", "p_region", "p_budget"];
export function sanitizeRecommendationProfile(profile) {
  const out = {};
  for (const k of REC_ALLOWED_PROFILE_FIELDS) if (profile && k in profile) out[k] = profile[k];
  return out;
}

const nowISO = () => new Date().toISOString();
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// -------- Pipeline run --------
export async function createPipelineRun(env, { triggerType, userId = null, scheduledDate = null, scope = "new_and_changed", scopeValue = null, country = null, testRun = false }) {
  const id = uid("pipe");
  await env.DB.prepare(
    `INSERT INTO ai_pipeline_runs (id, trigger_type, triggered_by_user_id, scheduled_date, status, scope_type, scope_value, country_code, test_run, started_at, current_stage, created_at, updated_at)
     VALUES (?1,?2,?3,?4,'running',?5,?6,?7,?8,?9,'procedure_analysis',?9,?9)`
  ).bind(id, triggerType, userId, scheduledDate, scope, scopeValue, country, testRun ? 1 : 0, nowISO()).run();
  return id;
}

// Idempotency: няма два активни/успешни nightly run-а за една дата.
export async function nightlyAlreadyRan(env, date) {
  const r = await env.DB.prepare(
    "SELECT id FROM ai_pipeline_runs WHERE scheduled_date=?1 AND trigger_type IN ('automatic_daily','daily_review_completion','fallback_cron') AND status IN ('running','completed','partial') LIMIT 1"
  ).bind(date).first();
  return !!r;
}

// Дали вече има успешно обработен job за същия идемпотентен ключ.
async function hasCompletedJob(env, idemKey) {
  const r = await env.DB.prepare("SELECT id FROM ai_jobs WHERE idempotency_key=?1 AND status='completed' LIMIT 1").bind(idemKey).first();
  return !!r;
}

// Създава procedure_analysis jobs за нови/променени/неуспешни процедури в обхвата.
export async function enqueueProcedureJobs(env, runId, { scope = "new_and_changed", country = null, entityId = null, force = false, testLimit = null } = {}) {
  const cfg = await env.DB.prepare("SELECT provider_key, model_id FROM ai_model_configurations WHERE purpose='procedure_analysis' AND active=1 LIMIT 1").first();
  if (!cfg) return { created: 0, skipped: 0, reason: "no_active_config" };

  let where = "1=1";
  const binds = [];
  if (country) { where += " AND country_code=?" + (binds.length + 1); binds.push(country); }
  if (entityId) { where += " AND id=?" + (binds.length + 1); binds.push(entityId); }
  if (scope === "new_and_changed") where += " AND (first_seen >= date('now') OR last_updated >= date('now'))";
  // scope 'all' / 'failed' / 'pending' се управляват на ниво job съществуване по-долу.

  const lim = testLimit && testLimit > 0 ? Math.min(3, testLimit) : 500;
  const rows = await env.DB.prepare(`SELECT id, country_code, content_hash, status, deadline_date, first_seen, last_updated, name, program, eligible, budget, notes FROM projects WHERE ${where} ORDER BY (deadline_date IS NULL), deadline_date ASC LIMIT ${lim}`).bind(...binds).all();
  let created = 0, skipped = 0;
  for (const p of (rows.results || [])) {
    const sourceHash = force ? `force-${Date.now()}` : (p.content_hash || hashText(p.name + p.status + p.budget));
    const idem = idempotencyKey({ purpose: "procedure_analysis", entityType: "procedure", entityId: p.id, sourceHash, modelId: cfg.model_id });
    if (!force && await hasCompletedJob(env, idem)) { skipped++; continue; }
    const dl = p.deadline_date ? Math.round((new Date(p.deadline_date) - Date.now()) / 86400000) : null;
    const priority = jobPriority({ status: p.status, deadlineDays: dl, isNewToday: p.first_seen >= new Date().toISOString().slice(0, 10), isChangedToday: p.last_updated >= new Date().toISOString().slice(0, 10), isFailed: false, isFullReanalysis: force });
    const ok = await insertJob(env, { runId, purpose: "procedure_analysis", cfg, entityType: "procedure", entityId: p.id, country: p.country_code, sourceHash, idem, priority });
    if (ok) created++; else skipped++;
  }
  await bumpRunCounts(env, runId);
  return { created, skipped };
}

async function insertJob(env, { runId, purpose, cfg, entityType, entityId, country, sourceHash, idem, priority = 100, dependencyJobId = null, status = "queued" }) {
  try {
    await env.DB.prepare(
      `INSERT INTO ai_jobs (id, run_id, purpose, provider_key, model_id, entity_type, entity_id, country_code, dependency_job_id, source_hash, idempotency_key, priority, status, available_at, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14,?14)`
    ).bind(uid("job"), runId, purpose, cfg.provider_key, cfg.model_id, entityType, entityId, country, dependencyJobId, sourceHash, idem, priority, status, nowISO()).run();
    return true;
  } catch { return false; } // UNIQUE(idempotency_key) → вече съществува
}

async function bumpRunCounts(env, runId) {
  await env.DB.prepare(
    `UPDATE ai_pipeline_runs SET
       total_jobs=(SELECT COUNT(*) FROM ai_jobs WHERE run_id=?1),
       queued_jobs=(SELECT COUNT(*) FROM ai_jobs WHERE run_id=?1 AND status IN ('queued','waiting_dependency')),
       running_jobs=(SELECT COUNT(*) FROM ai_jobs WHERE run_id=?1 AND status='running'),
       completed_jobs=(SELECT COUNT(*) FROM ai_jobs WHERE run_id=?1 AND status='completed'),
       failed_jobs=(SELECT COUNT(*) FROM ai_jobs WHERE run_id=?1 AND status='failed'),
       skipped_jobs=(SELECT COUNT(*) FROM ai_jobs WHERE run_id=?1 AND status='skipped_unchanged'),
       cancelled_jobs=(SELECT COUNT(*) FROM ai_jobs WHERE run_id=?1 AND status='cancelled'),
       updated_at=?2 WHERE id=?1`
  ).bind(runId, nowISO()).run();
}

// Обработва до `limit` готови jobs (lock + executor). Връща брой обработени.
export async function processJobsBatch(env, { runId = null, limit = 5, workerId = null } = {}) {
  const wid = workerId || uid("w");
  const now = nowISO();
  const lockExp = new Date(Date.now() + 60000).toISOString();
  let where = "status='queued' AND available_at <= ?1";
  const binds = [now];
  if (runId) { where += " AND run_id=?2"; binds.push(runId); }
  const candidates = await env.DB.prepare(`SELECT * FROM ai_jobs WHERE ${where} ORDER BY priority ASC, created_at ASC LIMIT ?${binds.length + 1}`).bind(...binds, limit).all();
  let processed = 0;
  for (const job of (candidates.results || [])) {
    // Атомарно вземане на lock-а.
    const claim = await env.DB.prepare(
      "UPDATE ai_jobs SET status='running', locked_at=?1, locked_by=?2, lock_expires_at=?3, started_at=?1, attempt_count=attempt_count+1, updated_at=?1 WHERE id=?4 AND status='queued'"
    ).bind(now, wid, lockExp, job.id).run();
    if (!claim.meta || claim.meta.changes === 0) continue; // някой друг го взе
    await runJob(env, job);
    processed++;
  }
  if (runId) { await bumpRunCounts(env, runId); await maybeFinishRun(env, runId); }
  return processed;
}

async function runJob(env, job) {
  const t0 = Date.now();
  try {
    const ctx = await loadEntityContext(env, job);
    if (ctx == null) { await failJob(env, job, "entity_missing", "Липсваща същност"); return; }
    const prompt = buildPrompt(job.purpose, ctx);
    const system = SYSTEM_PROMPTS[job.purpose];
    // Реалната provider заявка + логване в ai_execution_runs (с parent_run_id).
    const res = await AIExecutionService(env, { purpose: job.purpose, prompt, system, executionSource: "pipeline_job", countryCode: job.country_code, parentRunId: job.run_id });
    let parsed = parseAndValidate(job.purpose, res.text || "");
    if (!parsed.ok) {
      // Един безопасен repair опит.
      const repair = await AIExecutionService(env, { purpose: job.purpose, prompt: prompt + "\n\nВърни само валиден JSON по схемата.", system, executionSource: "pipeline_job_repair", countryCode: job.country_code, parentRunId: job.run_id });
      parsed = parseAndValidate(job.purpose, repair.text || "");
    }
    if (!parsed.ok) {
      await attachRunResult(env, res.executionRunId, { summary: buildResultSummary(job.purpose, { status: "failed", safeError: "невалиден структуриран отговор" }), detailsJson: null, jobId: job.id });
      await failJob(env, job, "schema_invalid", "Невалиден структуриран отговор");
      return;
    }
    const requiresReview = job.purpose === "document_analysis" && parsed.value.requires_review;
    const duration = Date.now() - t0;
    // Детерминистично резюме от реалния резултат на този job.
    const metrics = deriveJobMetrics(job.purpose, parsed.value, { requiresReview });
    const summary = buildResultSummary(job.purpose, { ...metrics, status: requiresReview ? "requires_review" : "completed" });
    const details = buildResultDetails(job.purpose, {
      summary,
      scope: { countryCode: job.country_code, entityType: job.entity_type, requested: 1, processed: 1, completed: requiresReview ? 0 : 1, failed: 0, skipped: 0 },
      results: metrics.results || {},
      items: [{ entityId: safePublicId(job), entityType: job.entity_type, title: (ctx.name || ctx.title || "").slice(0, 120), countryCode: job.country_code, status: requiresReview ? "requires_review" : "processed", summary: metrics.itemSummary || "", changedFields: metrics.changedFields || null, requiresReview }],
      quality: { valid: requiresReview ? 0 : 1, invalid: 0, averageConfidence: metrics.confidence ?? null },
      execution: { provider: job.provider_key, modelId: job.model_id, promptVersion: (PROMPT_VERSIONS[job.purpose] || {}).id, schemaVersion: (PROMPT_VERSIONS[job.purpose] || {}).schema, durationMs: res.latency ?? duration, inputTokens: res.inputTokens ?? null, outputTokens: res.outputTokens ?? null, cachedInputTokens: res.cachedInputTokens ?? null, requestCount: 1, retryCount: job.attempt_count - 1, fallbackModel: res.usedFallback ? (res.config && res.config.model_id) : null },
      warnings: metrics.warnings || [],
      safeErrors: [],
    });
    await attachRunResult(env, res.executionRunId, { summary, detailsJson: details.json, entityCount: 1, changeCount: metrics.changes || 0, warningCount: (metrics.warnings || []).length, requiresReviewCount: requiresReview ? 1 : 0, jobId: job.id });
    // ПРИЛАГАНЕ на резултата към същността (success = приложено, не само отговорено).
    let applied = true;
    if (!requiresReview) { applied = await applyResult(env, job, parsed.value); }
    if (requiresReview) await setJobStatus(env, job, "requires_review", { duration });
    else if (!applied) await failJob(env, job, "failed_persistence", "Резултатът не можа да бъде приложен");
    else await completeJob(env, job, parsed.value, duration);
    await enqueueDependents(env, job);
  } catch (e) {
    const code = (e && e.code) || "provider_error";
    const transient = ["timeout", "provider_unavailable", "rate_limited"].includes(code);
    if (transient && job.attempt_count < job.max_attempts) {
      const backoff = Math.min(300000, 2000 * Math.pow(2, job.attempt_count)) + Math.floor(Math.random() * 1000);
      await env.DB.prepare("UPDATE ai_jobs SET status='retry_scheduled', available_at=?1, locked_by=NULL, lock_expires_at=NULL, error_code=?2, updated_at=?3 WHERE id=?4")
        .bind(new Date(Date.now() + backoff).toISOString(), code, nowISO(), job.id).run();
      // retry_scheduled → връщаме към queued за следващия batch
      await env.DB.prepare("UPDATE ai_jobs SET status='queued' WHERE id=?1 AND status='retry_scheduled' AND available_at <= ?2").bind(job.id, nowISO()).run();
    } else {
      await failJob(env, job, code, "Неуспешно изпълнение");
    }
  }
}

async function loadEntityContext(env, job) {
  if (job.entity_type === "procedure" || job.entity_type === "budget") {
    const p = await env.DB.prepare("SELECT id AS entity_id, name, program, status, deadline, eligible, budget, notes, country_code FROM projects WHERE id=?1").bind(job.entity_id).first();
    return p || null;
  }
  if (job.entity_type === "document") {
    const d = await env.DB.prepare("SELECT id, project_id, title, doc_type, content FROM documents WHERE id=?1").bind(job.entity_id).first();
    return d || null;
  }
  if (job.entity_type === "recommendation") {
    const p = await env.DB.prepare("SELECT id AS entity_id, name, program, eligible, country_code FROM projects WHERE id=?1").bind(job.entity_id).first();
    return p ? { ...p, p_country: p.country_code } : null;
  }
  return null;
}

// След успешен procedure_analysis → създай document + budget jobs.
// След document+budget за процедурата → създай recommendation job.
async function enqueueDependents(env, job) {
  if (job.purpose === "procedure_analysis") {
    const docCfg = await env.DB.prepare("SELECT provider_key, model_id FROM ai_model_configurations WHERE purpose='document_analysis' AND active=1 LIMIT 1").first();
    if (docCfg) {
      const docs = await env.DB.prepare("SELECT id, content FROM documents WHERE project_id=?1 LIMIT 20").bind(job.entity_id).all();
      for (const d of (docs.results || [])) {
        const sh = hashText(d.content);
        const idem = idempotencyKey({ purpose: "document_analysis", entityType: "document", entityId: d.id, sourceHash: sh, modelId: docCfg.model_id });
        if (!(await hasCompletedJob(env, idem))) await insertJob(env, { runId: job.run_id, purpose: "document_analysis", cfg: docCfg, entityType: "document", entityId: d.id, country: job.country_code, sourceHash: sh, idem, priority: job.priority + 5, dependencyJobId: job.id });
      }
    }
    const budCfg = await env.DB.prepare("SELECT provider_key, model_id FROM ai_model_configurations WHERE purpose='budget_analysis' AND active=1 LIMIT 1").first();
    const proc = await env.DB.prepare("SELECT budget FROM projects WHERE id=?1").bind(job.entity_id).first();
    if (budCfg && proc && proc.budget) {
      const sh = hashText(proc.budget);
      const idem = idempotencyKey({ purpose: "budget_analysis", entityType: "budget", entityId: job.entity_id, sourceHash: sh, modelId: budCfg.model_id });
      if (!(await hasCompletedJob(env, idem))) await insertJob(env, { runId: job.run_id, purpose: "budget_analysis", cfg: budCfg, entityType: "budget", entityId: job.entity_id, country: job.country_code, sourceHash: sh, idem, priority: job.priority + 5, dependencyJobId: job.id });
    }
    await bumpRunCounts(env, job.run_id);
  }
  // recommendation: когато няма чакащи doc/budget jobs за тази процедура.
  if (job.purpose === "document_analysis" || job.purpose === "budget_analysis" || job.purpose === "procedure_analysis") {
    const procId = job.entity_type === "document" ? (await env.DB.prepare("SELECT project_id FROM documents WHERE id=?1").bind(job.entity_id).first())?.project_id : job.entity_id;
    if (!procId) return;
    const pending = await env.DB.prepare("SELECT COUNT(*) n FROM ai_jobs WHERE run_id=?1 AND purpose IN ('document_analysis','budget_analysis') AND entity_id IN (SELECT id FROM documents WHERE project_id=?2) OR (run_id=?1 AND purpose='budget_analysis' AND entity_id=?2 AND status NOT IN ('completed','failed','skipped_unchanged','requires_review','cancelled'))").bind(job.run_id, procId).first();
    if (pending && pending.n > 0) return;
    const recCfg = await env.DB.prepare("SELECT provider_key, model_id FROM ai_model_configurations WHERE purpose='recommendation' AND active=1 LIMIT 1").first();
    if (!recCfg) return;
    const sh = hashText("rec:" + procId);
    const idem = idempotencyKey({ purpose: "recommendation", entityType: "recommendation", entityId: procId, sourceHash: sh, modelId: recCfg.model_id });
    if (!(await hasCompletedJob(env, idem))) await insertJob(env, { runId: job.run_id, purpose: "recommendation", cfg: recCfg, entityType: "recommendation", entityId: procId, country: job.country_code, sourceHash: sh, idem, priority: 120 });
    await bumpRunCounts(env, job.run_id);
  }
}

async function completeJob(env, job, result, duration) {
  await env.DB.prepare("UPDATE ai_jobs SET status='completed', completed_at=?1, duration_ms=?2, result_version=?3, locked_by=NULL, lock_expires_at=NULL, updated_at=?1 WHERE id=?4")
    .bind(nowISO(), duration, (PROMPT_VERSIONS[job.purpose] || {}).version || "v1", job.id).run();
}
async function setJobStatus(env, job, status, { duration = null } = {}) {
  await env.DB.prepare("UPDATE ai_jobs SET status=?1, completed_at=?2, duration_ms=?3, locked_by=NULL, lock_expires_at=NULL, updated_at=?2 WHERE id=?4")
    .bind(status, nowISO(), duration, job.id).run();
}
async function failJob(env, job, code, summary) {
  await env.DB.prepare("UPDATE ai_jobs SET status='failed', error_code=?1, safe_error_summary=?2, completed_at=?3, locked_by=NULL, lock_expires_at=NULL, updated_at=?3 WHERE id=?4")
    .bind(code, summary, nowISO(), job.id).run();
}

async function maybeFinishRun(env, runId) {
  const r = await env.DB.prepare("SELECT status, total_jobs, completed_jobs, failed_jobs, skipped_jobs, cancelled_jobs, queued_jobs, running_jobs FROM ai_pipeline_runs WHERE id=?1").bind(runId).first();
  if (!r) return;
  const remaining = (r.queued_jobs || 0) + (r.running_jobs || 0);
  if (remaining > 0) return;
  // Спиране: последната изпълняваща се задача приключи → stopped/partial.
  if (r.status === "stopping") {
    const st = (r.completed_jobs || 0) > 0 ? "partial" : "stopped";
    await env.DB.prepare("UPDATE ai_pipeline_runs SET status=?1, completed_at=?2, current_stage='stopped', updated_at=?2 WHERE id=?3 AND status='stopping'").bind(st, nowISO(), runId).run();
    return;
  }
  const status = (r.failed_jobs || 0) > 0 && (r.completed_jobs || 0) > 0 ? "partial" : (r.failed_jobs > 0 && r.completed_jobs === 0 ? "failed" : "completed");
  await env.DB.prepare("UPDATE ai_pipeline_runs SET status=?1, completed_at=?2, current_stage='done', updated_at=?2 WHERE id=?3 AND status='running'").bind(status, nowISO(), runId).run();
}

// Освобождава изтекли locks (jobs, чийто worker е умрял).
export async function reclaimExpiredLocks(env) {
  await env.DB.prepare("UPDATE ai_jobs SET status='queued', locked_by=NULL, lock_expires_at=NULL, updated_at=?1 WHERE status='running' AND lock_expires_at IS NOT NULL AND lock_expires_at < ?1").bind(nowISO()).run();
}

// Отменя само чакащи jobs (не прекъсва изпратена provider заявка).
export async function cancelPendingJobs(env, runId) {
  const r = await env.DB.prepare("UPDATE ai_jobs SET status='cancelled', updated_at=?1 WHERE run_id=?2 AND status IN ('queued','waiting_dependency','retry_scheduled')").bind(nowISO(), runId).run();
  await bumpRunCounts(env, runId);
  return r.meta ? r.meta.changes : 0;
}

// Пре-нарежда failed jobs за повторно изпълнение.
export async function retryFailedJobs(env, runId) {
  const r = await env.DB.prepare("UPDATE ai_jobs SET status='queued', available_at=?1, attempt_count=0, error_code=NULL, safe_error_summary=NULL, updated_at=?1 WHERE run_id=?2 AND status='failed'").bind(nowISO(), runId).run();
  await env.DB.prepare("UPDATE ai_pipeline_runs SET status='running', completed_at=NULL, updated_at=?1 WHERE id=?2").bind(nowISO(), runId).run();
  return r.meta ? r.meta.changes : 0;
}

// --- Детерминистични метрики от структурирания резултат на един job ---
function safePublicId(job) {
  // Публичен, неопасен идентификатор (без вътрешни job/lock ID-та).
  return String(job.entity_id || "").slice(0, 80);
}
function deriveJobMetrics(purpose, value, { requiresReview } = {}) {
  const m = { processed: 1, requested: 1, changes: 0, requiresReview: requiresReview ? 1 : 0, warnings: [], results: {} };
  if (purpose === "procedure_analysis") {
    const changed = value.changes ? 1 : 0;
    m.changes = changed;
    m.confidence = typeof value.confidence === "number" ? value.confidence : null;
    m.changedFields = Array.isArray(value.quality_flags) ? value.quality_flags.slice(0, 8) : null;
    if (Array.isArray(value.quality_flags)) m.warnings = value.quality_flags.slice(0, 5);
    m.itemSummary = value.summary_short || "";
    m.results = { updatedRecords: changed, newRecords: null, unchangedRecords: null, warnings: m.warnings.length, requiresReview: m.requiresReview };
  } else if (purpose === "document_analysis") {
    m.changes = value.version_changes ? 1 : 0;
    m.itemSummary = value.summary || "";
    m.results = { warnings: null, requiresReview: m.requiresReview };
  } else if (purpose === "budget_analysis") {
    m.conflicts = Array.isArray(value.conflicts) ? value.conflicts.length : 0;
    if (Array.isArray(value.flags)) m.warnings = value.flags.slice(0, 5);
    m.itemSummary = value.total_budget != null ? `Общ бюджет: ${value.total_budget} ${value.currency || ""}`.trim() : "";
    m.results = { warnings: m.warnings.length };
  } else if (purpose === "recommendation") {
    m.itemSummary = value.explanation ? String(value.explanation).slice(0, 200) : "";
    m.profiles = 1;
    m.results = { newRecords: 1 };
  }
  return m;
}

// --- ПРИЛАГАНЕ на структурирания резултат към D1 + агрегати (success=applied) ---
const BGN_RATE = 1.95583;
async function applyResult(env, job, value) {
  try {
    if (job.purpose === "budget_analysis") {
      // Прилагаме само ОБЩ бюджет в EUR или BGN (фиксиран курс). Плаваща валута →
      // само отбелязваме валутата (без измислена EUR стойност).
      const cur = (value.currency || "").toUpperCase();
      let eur = null, storeCur = cur || null;
      if (value.total_budget != null && Number.isFinite(value.total_budget)) {
        if (cur === "EUR" || cur === "€" || cur === "") { eur = round2(value.total_budget); storeCur = "EUR"; }
        else if (cur === "BGN" || cur === "ЛВ") { eur = round2(value.total_budget / BGN_RATE); storeCur = "EUR"; }
      }
      if (value.eur_normalized != null && Number.isFinite(value.eur_normalized) && eur == null) eur = round2(value.eur_normalized);
      await env.DB.prepare("UPDATE projects SET budget_amount_eur=COALESCE(?1, budget_amount_eur), budget_currency=COALESCE(?2, budget_currency), last_updated=date('now') WHERE id=?3")
        .bind(eur, storeCur, job.entity_id).run();
      await recomputeCountrySnapshot(env, job.country_code);
      return true;
    }
    if (job.purpose === "procedure_analysis") {
      // Маркираме процедурата като анализирана (derived timestamp). Резюметата се
      // пазят в execution run-а; тук само отбелязваме, че AI е минал.
      await env.DB.prepare("UPDATE projects SET last_updated=COALESCE(last_updated, date('now')) WHERE id=?1").bind(job.entity_id).run();
      return true;
    }
    // document_analysis / recommendation: резултатите се пазят в execution run-а
    // (няма отделна destination колона в текущата схема) → считаме за приложени.
    return true;
  } catch { return false; }
}
function round2(n) { return Math.round(Number(n) * 100) / 100; }

// Преизчислява snapshot-а за държава (бюджет/брой) БЕЗ AI разход.
export async function recomputeCountrySnapshot(env, country) {
  if (!country) return;
  await env.DB.prepare(
    `UPDATE country_daily_statistics SET
       published_budget_eur=(SELECT SUM(p.budget_amount_eur) FROM projects p WHERE p.country_code=?1 AND p.budget_amount_eur IS NOT NULL),
       budget_procedure_count=(SELECT COUNT(*) FROM projects p WHERE p.country_code=?1 AND p.budget_amount_eur IS NOT NULL),
       total_procedures=(SELECT COUNT(*) FROM projects p WHERE p.country_code=?1),
       updated_at=datetime('now')
     WHERE country_code=?1 AND snapshot_date=date('now')`
  ).bind(country).run();
}

// Пълно преизчисляване на агрегатите за всички държави (admin, без AI).
export async function recomputeAllAggregates(env) {
  const countries = await env.DB.prepare("SELECT code FROM countries WHERE eu_member=1").all();
  let updated = 0;
  for (const c of (countries.results || [])) { await recomputeCountrySnapshot(env, c.code); updated++; }
  return updated;
}

// Диагностика на бюджетите по държави (за admin отчета).
export async function budgetDiagnostics(env) {
  const rows = await env.DB.prepare(
    `SELECT country_code,
       COUNT(*) procedures,
       SUM(CASE WHEN budget IS NOT NULL AND budget!='' THEN 1 ELSE 0 END) with_budget_text,
       SUM(CASE WHEN budget_amount_eur IS NOT NULL THEN 1 ELSE 0 END) applied_eur,
       SUM(CASE WHEN budget_currency IS NOT NULL AND budget_currency!='EUR' THEN 1 ELSE 0 END) foreign_currency,
       SUM(CASE WHEN (budget IS NULL OR budget='') THEN 1 ELSE 0 END) no_budget_text
     FROM projects GROUP BY country_code ORDER BY procedures DESC`
  ).all();
  return rows.results || [];
}

// --- STOP / RECOVER / JOBS SUMMARY (admin управление) ---
const PURPOSE_TIMEOUT_MS = { procedure_analysis: 120000, document_analysis: 120000, budget_analysis: 90000, recommendation: 90000 };

// Безопасно спиране на целия pipeline: маркира 'stopping', отменя чакащите (queued/
// waiting_dependency/retry_scheduled), НЕ прекъсва изпратени provider заявки, не трие
// приложени резултати. Ако няма running jobs → веднага 'stopped'/'partial'.
export async function stopPipeline(env, runId, { userId = null, cancelPending = true } = {}) {
  await env.DB.prepare("UPDATE ai_pipeline_runs SET status='stopping', updated_at=?1 WHERE id=?2 AND status IN ('running')").bind(nowISO(), runId).run();
  let cancelled = 0;
  if (cancelPending) {
    const r = await env.DB.prepare("UPDATE ai_jobs SET status='cancelled', updated_at=?1 WHERE run_id=?2 AND status IN ('queued','waiting_dependency','retry_scheduled')").bind(nowISO(), runId).run();
    cancelled = r.meta ? r.meta.changes : 0;
  }
  await bumpRunCounts(env, runId);
  // Ако вече няма изпълняващи се jobs → финализирай веднага.
  const running = await env.DB.prepare("SELECT COUNT(*) n FROM ai_jobs WHERE run_id=?1 AND status='running'").bind(runId).first();
  if (!running || running.n === 0) await finalizeStopped(env, runId);
  return { cancelled, stillRunning: running ? running.n : 0 };
}
async function finalizeStopped(env, runId) {
  const r = await env.DB.prepare("SELECT completed_jobs, failed_jobs FROM ai_pipeline_runs WHERE id=?1").bind(runId).first();
  const status = r && r.completed_jobs > 0 ? "partial" : "stopped";
  await env.DB.prepare("UPDATE ai_pipeline_runs SET status=?1, completed_at=?2, current_stage='stopped', updated_at=?2 WHERE id=?3 AND status IN ('stopping','running')").bind(status, nowISO(), runId).run();
}

// Спиране на отделен purpose: отменя неговите чакащи jobs + зависимите надолу.
export async function stopPurpose(env, runId, purpose) {
  const r1 = await env.DB.prepare("UPDATE ai_jobs SET status='cancelled', updated_at=?1 WHERE run_id=?2 AND purpose=?3 AND status IN ('queued','waiting_dependency','retry_scheduled')").bind(nowISO(), runId, purpose).run();
  // Зависими purposes надолу по графа → блокирани, ако този е предпоставка.
  const dependents = Object.entries(PURPOSE_DEPS).filter(([, deps]) => deps.includes(purpose)).map(([p]) => p);
  let blocked = 0;
  for (const dep of dependents) {
    const r2 = await env.DB.prepare("UPDATE ai_jobs SET status='cancelled', safe_error_summary='Блокирана — спрян е предходен агент', updated_at=?1 WHERE run_id=?2 AND purpose=?3 AND status IN ('queued','waiting_dependency','retry_scheduled')").bind(nowISO(), runId, dep).run();
    blocked += r2.meta ? r2.meta.changes : 0;
  }
  await bumpRunCounts(env, runId);
  return { cancelled: (r1.meta ? r1.meta.changes : 0), blockedDependents: blocked, affectedPurposes: dependents };
}

// Открива и възстановява „заседнали" jobs: running с изтекъл lock, или running при
// terminal pipeline. Връща ги в queue (idempotency пази срещу дублиране на резултат).
export async function recoverStuckJobs(env) {
  const now = nowISO();
  const expired = await env.DB.prepare("UPDATE ai_jobs SET status='queued', locked_by=NULL, lock_expires_at=NULL, updated_at=?1 WHERE status='running' AND lock_expires_at IS NOT NULL AND lock_expires_at < ?1").bind(now).run();
  const orphan = await env.DB.prepare("UPDATE ai_jobs SET status='failed', error_code='orphaned', safe_error_summary='Задачата остана изпълняваща се след приключил pipeline', updated_at=?1 WHERE status='running' AND run_id IN (SELECT id FROM ai_pipeline_runs WHERE status IN ('completed','partial','stopped','failed','cancelled'))").bind(now).run();
  return { requeued: expired.meta ? expired.meta.changes : 0, orphaned: orphan.meta ? orphan.meta.changes : 0 };
}

// Обобщение на jobs (по статус) за run или глобално.
export async function jobsSummary(env, runId = null) {
  const where = runId ? " WHERE run_id=?1" : "";
  const binds = runId ? [runId] : [];
  const rows = await env.DB.prepare(`SELECT status, COUNT(*) n FROM ai_jobs${where} GROUP BY status`).bind(...binds).all();
  const byStatus = {};
  for (const r of (rows.results || [])) byStatus[r.status] = r.n;
  const byPurpose = await env.DB.prepare(`SELECT purpose, status, COUNT(*) n FROM ai_jobs${where} GROUP BY purpose, status`).bind(...binds).all();
  const total = Object.values(byStatus).reduce((s, x) => s + x, 0);
  const terminal = (byStatus.completed || 0) + (byStatus.failed || 0) + (byStatus.skipped_unchanged || 0) + (byStatus.cancelled || 0) + (byStatus.requires_review || 0);
  return { byStatus, byPurpose: byPurpose.results || [], total, terminal, percent: total ? Math.round(terminal / total * 100) : 0 };
}

// Детектор за заседнали (за validation summary): running над timeout или изтекъл lock.
export async function stuckJobCount(env) {
  const now = Date.now();
  const rows = await env.DB.prepare("SELECT purpose, started_at, lock_expires_at FROM ai_jobs WHERE status='running'").all();
  let stuck = 0;
  for (const j of (rows.results || [])) {
    const to = PURPOSE_TIMEOUT_MS[j.purpose] || 120000;
    const overtime = j.started_at && (now - new Date(j.started_at).getTime()) > to;
    const lockExpired = j.lock_expires_at && new Date(j.lock_expires_at).getTime() < now;
    if (overtime || lockExpired) stuck++;
  }
  return stuck;
}
