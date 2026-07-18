// Общ AI provider слой (server-side): единен интерфейс + Anthropic/OpenAI адаптери
// + registry + resolveAIModel (по purpose, с fallback). Никакъв provider-specific
// payload извън адаптерите. Ключовете идват декриптирани САМО тук и не се логват.
//
// РАЗГРАНИЧЕНИЕ (важно): дневният преглед се изпълнява от Claude Scheduled Task —
// неговият РЕАЛЕН модел се управлява от Claude Scheduled Tasks, не от тази
// конфигурация. Тук конфигурираме desired модела + runtime AI на приложението
// (procedure_analysis и бъдещия chat).

import { decryptSecret, redactSecrets } from "./crypto.js";

const TIMEOUT_MS = 15000;

async function timedFetch(url, opts = {}) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return { res, latency: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}

function classify(status) {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 404) return "model_not_available";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "configuration_error";
}

// ---- Anthropic адаптер ----
export const AnthropicProvider = {
  providerKey: "anthropic",
  headers(key) { return { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }; },
  async testConnection(key) {
    try {
      const { res, latency } = await timedFetch("https://api.anthropic.com/v1/models?limit=5", { headers: this.headers(key) });
      if (res.ok) return { ok: true, latency };
      return { ok: false, latency, code: classify(res.status), httpStatus: res.status };
    } catch (e) { return { ok: false, code: e.name === "AbortError" ? "timeout" : "provider_unavailable", summary: redactSecrets(String(e.message || e)) }; }
  },
  async listAvailableModels(key) {
    const { res } = await timedFetch("https://api.anthropic.com/v1/models?limit=100", { headers: this.headers(key) });
    if (!res.ok) throw Object.assign(new Error("list_failed"), { code: classify(res.status) });
    const d = await res.json();
    return (d.data || []).map((m) => ({ id: m.id, displayName: m.display_name || m.id, family: (m.id || "").split("-").slice(0, 2).join("-"), tier: null }));
  },
  async validateModel(key, modelId) {
    try {
      const { res, latency } = await timedFetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(modelId)}`, { headers: this.headers(key) });
      if (res.ok) return { ok: true, latency };
      return { ok: false, code: classify(res.status), httpStatus: res.status };
    } catch (e) { return { ok: false, code: e.name === "AbortError" ? "timeout" : "provider_unavailable" }; }
  },
  async generate(key, { modelId, system, prompt, maxTokens = 1024, temperature }) {
    const body = { model: modelId, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] };
    if (system) body.system = system;
    if (temperature != null) body.temperature = temperature;
    const { res, latency } = await timedFetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: this.headers(key), body: JSON.stringify(body) });
    if (!res.ok) throw Object.assign(new Error("generate_failed"), { code: classify(res.status), httpStatus: res.status });
    const d = await res.json();
    return {
      text: (d.content || []).filter((c) => c.type === "text").map((c) => c.text).join(""),
      inputTokens: d.usage ? d.usage.input_tokens : null,
      outputTokens: d.usage ? d.usage.output_tokens : null,
      requestId: res.headers.get("request-id") || null,
      latency,
    };
  },
};

// ---- OpenAI адаптер ----
export const OpenAIProvider = {
  providerKey: "openai",
  headers(key) { return { authorization: `Bearer ${key}`, "content-type": "application/json" }; },
  async testConnection(key) {
    try {
      const { res, latency } = await timedFetch("https://api.openai.com/v1/models", { headers: this.headers(key) });
      if (res.ok) return { ok: true, latency };
      return { ok: false, latency, code: classify(res.status), httpStatus: res.status };
    } catch (e) { return { ok: false, code: e.name === "AbortError" ? "timeout" : "provider_unavailable", summary: redactSecrets(String(e.message || e)) }; }
  },
  async listAvailableModels(key) {
    const { res } = await timedFetch("https://api.openai.com/v1/models", { headers: this.headers(key) });
    if (!res.ok) throw Object.assign(new Error("list_failed"), { code: classify(res.status) });
    const d = await res.json();
    // GPT-5.6 има tiers (Sol/Terra/Luna) — извличаме tier от реалния ID, без предположения.
    return (d.data || []).map((m) => {
      const id = m.id || "";
      const tierMatch = /(sol|terra|luna)/i.exec(id);
      return { id, displayName: id, family: id.startsWith("gpt-5.6") ? "gpt-5.6" : id.split("-").slice(0, 2).join("-"), tier: tierMatch ? tierMatch[1].toLowerCase() : null };
    });
  },
  async validateModel(key, modelId) {
    try {
      const { res, latency } = await timedFetch(`https://api.openai.com/v1/models/${encodeURIComponent(modelId)}`, { headers: this.headers(key) });
      if (res.ok) return { ok: true, latency };
      return { ok: false, code: classify(res.status), httpStatus: res.status };
    } catch (e) { return { ok: false, code: e.name === "AbortError" ? "timeout" : "provider_unavailable" }; }
  },
  async generate(key, { modelId, system, prompt, maxTokens = 1024, temperature }) {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const body = { model: modelId, messages, max_completion_tokens: maxTokens };
    if (temperature != null) body.temperature = temperature;
    const { res, latency } = await timedFetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: this.headers(key), body: JSON.stringify(body) });
    if (!res.ok) throw Object.assign(new Error("generate_failed"), { code: classify(res.status), httpStatus: res.status });
    const d = await res.json();
    return {
      text: d.choices && d.choices[0] ? d.choices[0].message.content : "",
      inputTokens: d.usage ? d.usage.prompt_tokens : null,
      outputTokens: d.usage ? d.usage.completion_tokens : null,
      cachedInputTokens: d.usage && d.usage.prompt_tokens_details ? d.usage.prompt_tokens_details.cached_tokens : null,
      reasoningTokens: d.usage && d.usage.completion_tokens_details ? d.usage.completion_tokens_details.reasoning_tokens : null,
      requestId: res.headers.get("x-request-id") || null,
      latency,
    };
  },
};

export const AIProviderRegistry = { anthropic: AnthropicProvider, openai: OpenAIProvider };
export function getProvider(providerKey) { return AIProviderRegistry[providerKey] || null; }

/** Декриптиран API ключ за provider (само server-side). null ако не е конфигуриран. */
export async function getProviderKey(env, providerKey) {
  const row = await env.DB.prepare("SELECT encrypted_secret, encryption_iv FROM ai_provider_credentials WHERE provider_key=?1").bind(providerKey).first();
  if (!row) return null;
  try { return await decryptSecret(env, row.encrypted_secret, row.encryption_iv); } catch { return null; }
}

/** Активната конфигурация за purpose + подредени fallback-и. */
export async function resolveAIModel(env, purpose) {
  const active = await env.DB.prepare("SELECT * FROM ai_model_configurations WHERE purpose=?1 AND active=1").bind(purpose).first();
  const { results } = await env.DB.prepare("SELECT * FROM ai_model_configurations WHERE purpose=?1 AND active=0 AND fallback_priority IS NOT NULL ORDER BY fallback_priority").bind(purpose).all();
  return { primary: active || null, fallbacks: results || [] };
}

// Fallback се допуска САМО при временни provider проблеми.
const FALLBACK_CODES = new Set(["provider_unavailable", "timeout", "rate_limited", "model_not_available"]);
export function shouldFallback(errorCode) { return FALLBACK_CODES.has(errorCode); }

/** Изпълнява generate с активния модел + fallback верига. Логва в ai_execution_runs. */
export async function AIExecutionService(env, { purpose, prompt, system, executionSource = "worker_api", countryCode = null, maxTokens }) {
  const { primary, fallbacks } = await resolveAIModel(env, purpose);
  if (!primary) throw Object.assign(new Error("no_active_model"), { code: "blocked_configuration" });
  const chain = [primary, ...fallbacks];
  let lastErr = null;
  for (let i = 0; i < chain.length; i++) {
    const cfg = chain[i];
    const provider = getProvider(cfg.provider_key);
    const key = provider ? await getProviderKey(env, cfg.provider_key) : null;
    if (!provider || !key) { lastErr = Object.assign(new Error("blocked_configuration"), { code: "blocked_configuration" }); continue; }
    const runId = "air-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const startedAt = new Date().toISOString();
    try {
      const out = await provider.generate(key, { modelId: cfg.model_id, system, prompt, maxTokens: maxTokens || cfg.max_output_tokens || 1024, temperature: cfg.temperature });
      await logRun(env, { id: runId, execution_type: "generation", purpose, provider_key: cfg.provider_key, model_id: cfg.model_id, model_display_name: cfg.display_name, execution_source: executionSource, country_code: countryCode, status: "success", started_at: startedAt, duration_ms: out.latency, input_tokens: out.inputTokens, output_tokens: out.outputTokens, cached_input_tokens: out.cachedInputTokens || null, reasoning_tokens: out.reasoningTokens || null, request_count: 1, successful_request_count: 1, provider_request_id: out.requestId, metadata_json: i > 0 ? JSON.stringify({ fallback: true, primary_model: primary.model_id, fallback_reason: lastErr && lastErr.code }) : null });
      return { ...out, config: cfg, usedFallback: i > 0 };
    } catch (e) {
      lastErr = e;
      await logRun(env, { id: runId, execution_type: "generation", purpose, provider_key: cfg.provider_key, model_id: cfg.model_id, model_display_name: cfg.display_name, execution_source: executionSource, country_code: countryCode, status: "error", started_at: startedAt, request_count: 1, failed_request_count: 1, error_code: e.code || "unknown", safe_error_summary: redactSecrets(String(e.message || e)).slice(0, 300) });
      if (!shouldFallback(e.code)) throw e; // invalid request/config → не fallback-ваме
    }
  }
  throw lastErr || new Error("all_models_failed");
}

async function logRun(env, r) {
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO ai_execution_runs (id, execution_type, purpose, provider_key, model_id, model_display_name, execution_source, country_code, status, started_at, completed_at, duration_ms, input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, request_count, successful_request_count, failed_request_count, provider_request_id, error_code, safe_error_summary, metadata_json, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24)`
    ).bind(
      r.id, r.execution_type, r.purpose, r.provider_key || null, r.model_id || null, r.model_display_name || null,
      r.execution_source || null, r.country_code || null, r.status, r.started_at, now, r.duration_ms || null,
      r.input_tokens ?? null, r.output_tokens ?? null, r.cached_input_tokens ?? null, r.reasoning_tokens ?? null,
      r.request_count || null, r.successful_request_count || null, r.failed_request_count || null,
      r.provider_request_id || null, r.error_code || null, r.safe_error_summary || null, r.metadata_json || null, now
    ).run();
  } catch { /* логът не бива да чупи заявката */ }
}
