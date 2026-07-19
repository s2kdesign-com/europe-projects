// AI endpoints: admin управление на доставчици/модели/логове + публична безопасна
// конфигурация + internal reporting от Scheduled Task (HMAC). Ключовете никога не
// се връщат към браузъра; credential отговорите са no-store.

import { encryptSecret, fingerprintSecret, isCryptoConfigured, redactSecrets } from "./crypto.js";
import { getProvider, getProviderKey } from "./providers.js";

const nowISO = () => new Date().toISOString();
const NO_STORE = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const jsonNS = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: NO_STORE });
const ok = (extra = {}) => jsonNS({ ok: true, ...extra });
const err = (code, status = 400) => jsonNS({ ok: false, error: code }, status);

const PURPOSES = ["daily_review", "procedure_analysis", "document_analysis", "budget_analysis", "recommendation", "future_chat", "fallback"];

async function audit(env, a) {
  try {
    await env.DB.prepare("INSERT INTO ai_audit_log (actor_user_id, action, provider_key, purpose, previous_safe_configuration, new_safe_configuration, result, request_id, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)")
      .bind(a.actor || null, a.action, a.provider || null, a.purpose || null, a.prev || null, a.next || null, a.result || "ok", a.requestId || null, nowISO()).run();
  } catch { /* no-op */ }
}

// Празен кеш + конфигуриран ключ → зареди списъка с модели (server-side).
async function autoRefreshModels(env) {
  try {
    const { results } = await env.DB.prepare("SELECT provider_key FROM ai_providers WHERE credential_status='configured' AND (available_models_json IS NULL OR available_models_json='')").all();
    for (const row of results || []) {
      const provider = getProvider(row.provider_key);
      const key = provider && (await getProviderKey(env, row.provider_key));
      if (!key) continue;
      try {
        const models = await provider.listAvailableModels(key);
        await env.DB.prepare("UPDATE ai_providers SET available_models_json=?1, models_refreshed_at=?2, updated_at=?2 WHERE provider_key=?3").bind(JSON.stringify(models), nowISO(), row.provider_key).run();
      } catch { /* при грешка кешът остава празен; refresh бутонът е наличен */ }
    }
  } catch { /* no-op */ }
}

// Ако точният model ID 'gpt-5.6' е реално достъпен с ключа → валидирай и активирай
// procedure_analysis (+ обнови future_chat конфигурацията, без да я активираш).
// НЕ избира автоматично tier (gpt-5.6-sol/terra/luna) — това остава човешки избор.
async function ensureSystemAIActivated(env, userId) {
  try {
    const cfg = await env.DB.prepare("SELECT id, model_id, validation_status, active FROM ai_model_configurations WHERE purpose='procedure_analysis' AND provider_key='openai'").first();
    if (!cfg || cfg.active) return;
    const prov = await env.DB.prepare("SELECT available_models_json FROM ai_providers WHERE provider_key='openai' AND credential_status='configured'").first();
    if (!prov || !prov.available_models_json) return;
    let models;
    try { models = JSON.parse(prov.available_models_json); } catch { return; }
    const exact = models.find((m) => m.id === cfg.model_id); // напр. 'gpt-5.6'
    if (!exact) return; // само нива → админът избира от dropdown-а
    const now = nowISO();
    await env.DB.prepare("UPDATE ai_model_configurations SET active=0, updated_at=?1 WHERE purpose='procedure_analysis'").bind(now).run();
    await env.DB.prepare("UPDATE ai_model_configurations SET active=1, validation_status='validated', last_validated_at=?1, model_tier=?2, updated_at=?1 WHERE id=?3")
      .bind(now, exact.tier || null, cfg.id).run();
    await env.DB.prepare("UPDATE ai_model_configurations SET validation_status='validated', last_validated_at=?1, updated_at=?1 WHERE purpose='future_chat' AND provider_key='openai' AND model_id=?2").bind(now, cfg.model_id).run();
    await audit(env, { actor: userId || "system", action: "active_model_changed", provider: "openai", purpose: "procedure_analysis", next: JSON.stringify({ provider: "openai", model: cfg.model_id, active: true, auto: true }) });
  } catch { /* no-op */ }
}

// ---------- ADMIN (вика се от handlers.js СЛЕД admin authorization) ----------
export async function handleAdminAI(request, env, url, userId, method, readJson) {
  const { pathname } = url;

  if (pathname === "/api/admin/ai/providers" && method === "GET") {
    // Авто-зареждане на списъка с модели при конфигуриран provider с празен кеш
    // (за да не зависи dropdown-ът от ръчно натискане на „Обнови списъка").
    await autoRefreshModels(env);
    // Авто-свързване на OpenAI: ако точният ID 'gpt-5.6' е реално наличен →
    // валидира и активира системния AI анализ (по нареждане на собственика).
    await ensureSystemAIActivated(env, userId);
    const provs = await env.DB.prepare("SELECT provider_key, display_name, enabled, credential_status, connection_status, available_models_json, models_refreshed_at, last_tested_at, last_test_status, last_test_error_code FROM ai_providers ORDER BY provider_key").all();
    const creds = await env.DB.prepare("SELECT provider_key, secret_last_four, created_at, rotated_at, updated_at FROM ai_provider_credentials").all();
    const configs = await env.DB.prepare("SELECT * FROM ai_model_configurations ORDER BY purpose, active DESC, fallback_priority").all();
    // Използване по модел (от execution логовете) — за колоната „Използван".
    // Използване + токени по прозорци (30 дни / 1 година) за изчисляване на разхода.
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const d365 = new Date(Date.now() - 365 * 86400000).toISOString();
    const usage = await env.DB.prepare(
      `SELECT model_id,
         COUNT(*) AS runs,
         SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)) AS tokens,
         MAX(started_at) AS last_used_at,
         SUM(CASE WHEN started_at >= ?1 THEN COALESCE(input_tokens,0) ELSE 0 END) AS in_30d,
         SUM(CASE WHEN started_at >= ?1 THEN COALESCE(output_tokens,0) ELSE 0 END) AS out_30d,
         SUM(CASE WHEN started_at >= ?2 THEN COALESCE(input_tokens,0) ELSE 0 END) AS in_365d,
         SUM(CASE WHEN started_at >= ?2 THEN COALESCE(output_tokens,0) ELSE 0 END) AS out_365d
       FROM ai_execution_runs WHERE model_id IS NOT NULL GROUP BY model_id`
    ).bind(d30, d365).all();
    const credMap = Object.fromEntries((creds.results || []).map((c) => [c.provider_key, c]));
    const providers = (provs.results || []).map((p) => ({
      ...p,
      available_models: p.available_models_json ? JSON.parse(p.available_models_json) : null,
      available_models_json: undefined,
      credential: credMap[p.provider_key] ? { lastFour: credMap[p.provider_key].secret_last_four, updatedAt: credMap[p.provider_key].updated_at, rotatedAt: credMap[p.provider_key].rotated_at } : null,
    }));
    return ok({ providers, configurations: configs.results || [], usage: usage.results || [], cryptoConfigured: isCryptoConfigured(env), purposes: PURPOSES });
  }

  // Добавяне/замяна на ключ: валидира → тества → криптира → записва → одит.
  const keyMatch = /^\/api\/admin\/ai\/providers\/([a-z]+)\/key$/.exec(pathname);
  if (keyMatch && method === "POST") {
    const pk = keyMatch[1];
    const provider = getProvider(pk);
    if (!provider) return err("invalid_provider", 400);
    if (!isCryptoConfigured(env)) return err("master_key_not_configured", 503);
    const body = (await readJson(request)) || {};
    let secret = typeof body.key === "string" ? body.key.trim() : "";
    if (secret.length < 20) return err("invalid_key_format", 400);
    // Тест ПРЕДИ запис.
    const test = await provider.testConnection(secret);
    const now = nowISO();
    if (!test.ok) {
      await env.DB.prepare("UPDATE ai_providers SET last_tested_at=?1, last_test_status=?2, last_test_error_code=?3, updated_at=?1 WHERE provider_key=?4").bind(now, "failed", test.code || "unknown", pk).run();
      await audit(env, { actor: userId, action: "api_key_test_failed", provider: pk, result: test.code });
      return err(test.code || "connection_failed", 400);
    }
    const enc = await encryptSecret(env, secret);
    const fp = await fingerprintSecret(secret);
    const lastFour = secret.slice(-4);
    secret = null; // изчистваме reference-а възможно най-рано
    const existing = await env.DB.prepare("SELECT provider_key FROM ai_provider_credentials WHERE provider_key=?1").bind(pk).first();
    if (existing) {
      await env.DB.prepare("UPDATE ai_provider_credentials SET encrypted_secret=?1, encryption_iv=?2, secret_last_four=?3, secret_fingerprint=?4, rotated_by_user_id=?5, rotated_at=?6, updated_at=?6 WHERE provider_key=?7")
        .bind(enc.ciphertext, enc.iv, lastFour, fp, userId, now, pk).run();
    } else {
      await env.DB.prepare("INSERT INTO ai_provider_credentials (provider_key, encrypted_secret, encryption_iv, secret_last_four, secret_fingerprint, created_by_user_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7)")
        .bind(pk, enc.ciphertext, enc.iv, lastFour, fp, userId, now).run();
    }
    await env.DB.prepare("UPDATE ai_providers SET enabled=1, credential_status='configured', connection_status='ok', last_tested_at=?1, last_test_status='success', last_test_error_code=NULL, configured_by_user_id=?2, updated_at=?1 WHERE provider_key=?3").bind(now, userId, pk).run();
    await audit(env, { actor: userId, action: existing ? "api_key_replaced" : "api_key_added", provider: pk });
    return ok({ lastFour, latency: test.latency || null });
  }
  if (keyMatch && method === "DELETE") {
    const pk = keyMatch[1];
    await env.DB.prepare("DELETE FROM ai_provider_credentials WHERE provider_key=?1").bind(pk).run();
    await env.DB.prepare("UPDATE ai_providers SET enabled=0, credential_status='not_configured', connection_status='unknown', updated_at=?1 WHERE provider_key=?2").bind(nowISO(), pk).run();
    // Зависимите конфигурации стават unavailable (не се трият).
    await env.DB.prepare("UPDATE ai_model_configurations SET validation_status='unavailable', updated_at=?1 WHERE provider_key=?2").bind(nowISO(), pk).run();
    await audit(env, { actor: userId, action: "api_key_removed", provider: pk });
    return ok({});
  }

  const testMatch = /^\/api\/admin\/ai\/providers\/([a-z]+)\/test$/.exec(pathname);
  if (testMatch && method === "POST") {
    const pk = testMatch[1];
    const provider = getProvider(pk);
    if (!provider) return err("invalid_provider", 400);
    const key = await getProviderKey(env, pk);
    if (!key) return err("not_configured", 400);
    const test = await provider.testConnection(key);
    const now = nowISO();
    await env.DB.prepare("UPDATE ai_providers SET connection_status=?1, last_tested_at=?2, last_test_status=?3, last_test_error_code=?4, updated_at=?2 WHERE provider_key=?5")
      .bind(test.ok ? "ok" : "error", now, test.ok ? "success" : "failed", test.ok ? null : (test.code || "unknown"), pk).run();
    await audit(env, { actor: userId, action: "connection_tested", provider: pk, result: test.ok ? "ok" : test.code });
    return test.ok ? ok({ latency: test.latency || null }) : err(test.code || "connection_failed", 400);
  }

  const refreshMatch = /^\/api\/admin\/ai\/providers\/([a-z]+)\/models\/refresh$/.exec(pathname);
  if (refreshMatch && method === "POST") {
    const pk = refreshMatch[1];
    const provider = getProvider(pk);
    if (!provider) return err("invalid_provider", 400);
    const key = await getProviderKey(env, pk);
    if (!key) return err("not_configured", 400);
    try {
      const models = await provider.listAvailableModels(key);
      await env.DB.prepare("UPDATE ai_providers SET available_models_json=?1, models_refreshed_at=?2, updated_at=?2 WHERE provider_key=?3").bind(JSON.stringify(models), nowISO(), pk).run();
      return ok({ models });
    } catch (e) {
      // При грешка НЕ изтриваме последния валиден списък.
      return err(e.code || "list_failed", 502);
    }
  }

  const cfgMatch = /^\/api\/admin\/ai\/configurations\/([a-z_]+)$/.exec(pathname);
  if (cfgMatch && method === "PATCH") {
    const purpose = cfgMatch[1];
    if (!PURPOSES.includes(purpose)) return err("invalid_purpose", 400);
    const b = (await readJson(request)) || {};
    const pk = b.provider_key;
    const modelId = typeof b.model_id === "string" ? b.model_id.trim() : "";
    if (!getProvider(pk)) return err("invalid_provider", 400);
    if (!modelId) return err("model_id_required", 400);
    // Валидация на модела срещу реалния provider (ако има ключ).
    let validation = "unvalidated";
    const key = await getProviderKey(env, pk);
    if (key) {
      const v = await getProvider(pk).validateModel(key, modelId);
      if (!v.ok) return err(v.code === "model_not_available" ? "model_not_available" : (v.code || "validation_failed"), 400);
      validation = "validated";
    } else if (b.activate) {
      return err("provider_not_configured", 400); // не активираме непроверен модел
    }
    const now = nowISO();
    const prev = await env.DB.prepare("SELECT provider_key, model_id, display_name FROM ai_model_configurations WHERE purpose=?1 AND active=1").bind(purpose).first();
    const id = `${purpose}-${pk}-${modelId}`.slice(0, 120);
    if (b.activate) await env.DB.prepare("UPDATE ai_model_configurations SET active=0, updated_at=?1 WHERE purpose=?2").bind(now, purpose).run();
    await env.DB.prepare(
      `INSERT INTO ai_model_configurations (id, purpose, provider_key, model_id, display_name, model_family, model_tier, active, fallback_priority, max_output_tokens, temperature, last_validated_at, validation_status, created_by_user_id, updated_by_user_id, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14,?15,?15)
       ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, model_tier=excluded.model_tier, active=excluded.active, fallback_priority=excluded.fallback_priority, max_output_tokens=excluded.max_output_tokens, temperature=excluded.temperature, last_validated_at=excluded.last_validated_at, validation_status=excluded.validation_status, updated_by_user_id=?14, updated_at=?15`
    ).bind(
      id, purpose, pk, modelId, b.display_name ? String(b.display_name).slice(0, 100) : modelId,
      b.model_family || null, b.model_tier || null, b.activate ? 1 : 0,
      Number.isFinite(Number(b.fallback_priority)) ? Math.floor(Number(b.fallback_priority)) : null,
      Number.isFinite(Number(b.max_output_tokens)) ? Math.floor(Number(b.max_output_tokens)) : null,
      Number.isFinite(Number(b.temperature)) ? Number(b.temperature) : null,
      validation === "validated" ? now : null, validation, userId, now
    ).run();
    await audit(env, {
      actor: userId, action: "active_model_changed", provider: pk, purpose,
      prev: prev ? JSON.stringify({ provider: prev.provider_key, model: prev.model_id }) : null,
      next: JSON.stringify({ provider: pk, model: modelId, active: !!b.activate }),
    });
    return ok({ validation });
  }

  if (pathname === "/api/admin/ai/runs" && method === "GET") {
    const lim = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const conds = [], binds = [];
    for (const [param, col] of [["purpose", "purpose"], ["source", "execution_source"], ["status", "status"], ["country", "country_code"], ["provider", "provider_key"]]) {
      const v = url.searchParams.get(param);
      if (v) { conds.push(`${col} = ?${binds.length + 1}`); binds.push(v); }
    }
    const where = conds.length ? " WHERE " + conds.join(" AND ") : "";
    // Без result_details_json (голям) — само summary + has_details флаг за разгъване.
    const rows = await env.DB.prepare(
      `SELECT id, execution_type, purpose, provider_key, model_id, model_display_name, execution_source, country_code, status, started_at, completed_at, duration_ms, input_tokens, output_tokens, procedures_reviewed, changes_detected, safe_error_summary, error_code, result_summary, result_entity_count, result_change_count, result_requires_review_count, (result_details_json IS NOT NULL) AS has_details FROM ai_execution_runs${where} ORDER BY started_at DESC LIMIT ${lim} OFFSET ${offset}`
    ).bind(...binds).all();
    const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ai_execution_runs${where}`).bind(...binds).first();
    return ok({ runs: rows.results || [], total: total ? total.n : 0 });
  }

  if (pathname === "/api/admin/ai/summary" && method === "GET") {
    const today = new Date().toISOString().slice(0, 10);
    const week = new Date(Date.now() - 7 * 86400000).toISOString();
    const one = async (sql, ...binds) => { try { const r = await env.DB.prepare(sql).bind(...binds).first(); return r || null; } catch { return null; } };
    const todayAgg = await one("SELECT COUNT(*) AS runs, SUM(status='success') AS ok, SUM(status='error') AS failed, SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)) AS tokens, AVG(duration_ms) AS avg_latency FROM ai_execution_runs WHERE started_at >= ?1", today);
    const weekAgg = await one("SELECT COUNT(*) AS runs, SUM(status='success') AS ok, SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)) AS tokens FROM ai_execution_runs WHERE started_at >= ?1", week);
    const lastDaily = await one("SELECT * FROM ai_execution_runs WHERE purpose='daily_review' ORDER BY started_at DESC LIMIT 1");
    const lastSync = await one("SELECT * FROM scheduled_sync_runs ORDER BY id DESC LIMIT 1");
    const cursor = await one("SELECT * FROM scheduled_country_sync_state WHERE task_key='daily-eu-country-sync'");
    return ok({ today: todayAgg, week: weekAgg, lastDailyRun: lastDaily, lastSyncRun: lastSync, cursor });
  }

  return null; // не е AI route — продължава към останалите admin routes
}

// ---------- PUBLIC: безопасна конфигурация за footer-а ----------
export async function handlePublicAIConfig(env) {
  // Само display данни. Нищо за ключове/fallback/вътрешни параметри.
  let daily = { provider: "Anthropic", model: "Claude Opus 4.8" }; // безопасен статичен fallback
  let system = null;
  let updatedAt = null;
  try {
    const d = await env.DB.prepare("SELECT display_name, provider_key, updated_at FROM ai_model_configurations WHERE purpose='daily_review' AND active=1").first();
    if (d) { daily = { provider: d.provider_key === "anthropic" ? "Anthropic" : "OpenAI", model: d.display_name }; updatedAt = d.updated_at; }
    const s = await env.DB.prepare("SELECT display_name, provider_key, validation_status, active, updated_at FROM ai_model_configurations WHERE purpose='procedure_analysis' ORDER BY active DESC LIMIT 1").first();
    if (s) {
      system = {
        provider: s.provider_key === "openai" ? "OpenAI" : "Anthropic",
        model: s.display_name,
        // Не твърдим „активен", ако моделът не е реално валидиран/активен.
        status: s.active && s.validation_status === "validated" ? "active" : "configured",
      };
      if (s.updated_at > (updatedAt || "")) updatedAt = s.updated_at;
    }
  } catch { /* пада към статичния fallback */ }
  // Безопасни run метаданни (без вътрешни грешки/ID-та): последен успешен дневен
  // преглед + брой държави от отчета му. ACTUAL модел от лога, не desired.
  let lastRunAt = null, countriesReviewed = null, actualModel = null;
  try {
    const r = await env.DB.prepare("SELECT completed_at, model_display_name, metadata_json FROM ai_execution_runs WHERE purpose='daily_review' AND status IN ('success','partial') ORDER BY started_at DESC LIMIT 1").first();
    if (r) {
      lastRunAt = r.completed_at || null;
      actualModel = r.model_display_name || null;
      try { const m = JSON.parse(r.metadata_json || "{}"); if (Array.isArray(m.countries)) countriesReviewed = m.countries.length; } catch { /* no-op */ }
    }
  } catch { /* no-op */ }
  if (daily) { daily.lastSuccessfulRunAt = lastRunAt; daily.countriesReviewed = countriesReviewed; daily.actualModel = actualModel; }
  return new Response(JSON.stringify({ dailyReview: daily, systemAI: system, lastUpdatedAt: updatedAt, ok: true }), {
    status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

// ---------- INTERNAL: Scheduled Task report (HMAC + timestamp + idempotency) ----------
async function hmacValid(env, request, rawBody) {
  const secret = env.SCHEDULED_TASK_REPORTING_SECRET;
  if (!secret) return false;
  const sig = request.headers.get("x-report-signature") || "";
  const ts = request.headers.get("x-report-timestamp") || "";
  if (!sig || !ts) return false;
  const age = Math.abs(Date.now() - Date.parse(ts));
  if (!Number.isFinite(age) || age > 5 * 60000) return false; // replay защита: 5 мин
  const te = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, te.encode(ts + "." + rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === sig.toLowerCase();
}

export async function handleAIRunReport(request, env) {
  let raw;
  try { raw = await request.text(); } catch { return err("invalid_body", 400); }
  if (!(await hmacValid(env, request, raw))) return err("unauthorized", 401);
  let b;
  try { b = JSON.parse(raw); } catch { return err("invalid_json", 400); }
  const runId = String(b.scheduledTaskRunId || "").slice(0, 120);
  if (!runId) return err("missing_run_id", 400);
  // Idempotency по scheduled_task_run_id.
  const existing = await env.DB.prepare("SELECT id FROM ai_execution_runs WHERE scheduled_task_run_id=?1").bind(runId).first();
  if (existing) return ok({ duplicate: true });
  const now = nowISO();
  await env.DB.prepare(
    `INSERT INTO ai_execution_runs (id, execution_type, purpose, provider_key, model_id, model_display_name, execution_source, scheduled_task_name, scheduled_task_run_id, status, started_at, completed_at, procedures_reviewed, documents_reviewed, budgets_reviewed, changes_detected, safe_error_summary, metadata_json, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)`
  ).bind(
    "air-task-" + runId, String(b.executionType || "daily_review").slice(0, 40), "daily_review",
    b.provider ? String(b.provider).slice(0, 20) : null, b.modelId ? String(b.modelId).slice(0, 80) : null,
    b.modelDisplayName ? String(b.modelDisplayName).slice(0, 80) : null,
    "claude_scheduled_task", b.scheduledTaskName ? String(b.scheduledTaskName).slice(0, 120) : null, runId,
    ["success", "partial", "error", "blocked"].includes(b.status) ? b.status : "success",
    b.startedAt || now, b.completedAt || now,
    Number.isFinite(Number(b.proceduresReviewed)) ? Number(b.proceduresReviewed) : null,
    Number.isFinite(Number(b.documentsReviewed)) ? Number(b.documentsReviewed) : null,
    Number.isFinite(Number(b.budgetsReviewed)) ? Number(b.budgetsReviewed) : null,
    Number.isFinite(Number(b.changesDetected)) ? Number(b.changesDetected) : null,
    b.safeSummary ? redactSecrets(String(b.safeSummary)).slice(0, 1000) : null,
    Array.isArray(b.countries) ? JSON.stringify({ countries: b.countries.slice(0, 30) }) : null, now
  ).run();
  return ok({});
}
