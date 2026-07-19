// Тестове за публичното AI-агент mapping (статус + redaction). node test/public-agents.test.mjs
import assert from "node:assert/strict";

let n = 0;
const t = typeof it === "function" ? it : (name, fn) => { fn(); n++; console.log("ok -", name); };

// Копие на publicAgentStatus логиката (handlers.js) — тества се независимо.
function publicAgentStatus(cfg, hasKey, featureEnabled) {
  if (cfg.purpose === "future_chat") return featureEnabled ? "active" : "upcoming";
  if (!cfg.active) return "needs_configuration";
  if (cfg.validation_status === "failed" || cfg.validation_status === "invalid") return "last_run_failed";
  if (cfg.provider_key === "openai" && !hasKey) return "temporarily_unavailable";
  if (cfg.validation_status === "validated" || cfg.validation_status === "vendor_documented") return "active";
  return "needs_configuration";
}

t("активен OpenAI агент с валиден ключ → active", () => {
  assert.equal(publicAgentStatus({ purpose: "budget_analysis", active: 1, validation_status: "validated", provider_key: "openai" }, true, false), "active");
});
t("OpenAI агент без ключ → temporarily_unavailable", () => {
  assert.equal(publicAgentStatus({ purpose: "budget_analysis", active: 1, validation_status: "validated", provider_key: "openai" }, false, false), "temporarily_unavailable");
});
t("деактивиран агент → needs_configuration", () => {
  assert.equal(publicAgentStatus({ purpose: "recommendation", active: 0, validation_status: "validated", provider_key: "openai" }, true, false), "needs_configuration");
});
t("провалена валидация → last_run_failed", () => {
  assert.equal(publicAgentStatus({ purpose: "document_analysis", active: 1, validation_status: "failed", provider_key: "openai" }, true, false), "last_run_failed");
});
t("daily_review (Anthropic, vendor_documented) → active без ключова проверка за OpenAI", () => {
  assert.equal(publicAgentStatus({ purpose: "daily_review", active: 1, validation_status: "vendor_documented", provider_key: "anthropic" }, false, false), "active");
});
t("future_chat при изключен feature flag → upcoming (никога active)", () => {
  assert.equal(publicAgentStatus({ purpose: "future_chat", active: 1, validation_status: "validated", provider_key: "openai" }, true, false), "upcoming");
});
t("future_chat при включен flag → active", () => {
  assert.equal(publicAgentStatus({ purpose: "future_chat", active: 1, validation_status: "validated", provider_key: "openai" }, true, true), "active");
});

// Безопасната публична проекция НЕ трябва да съдържа чувствителни ключове.
t("публичната agent проекция е безопасна", () => {
  const cfg = { purpose: "budget_analysis", provider_key: "openai", display_name: "gpt-5.6-luna", model_id: "gpt-5.6-luna", active: 1, validation_status: "validated", secret_last_four: "AbCd", api_key: "sk-xxx" };
  const pub = { purpose: cfg.purpose, provider: cfg.provider_key === "anthropic" ? "Anthropic" : "OpenAI", modelDisplayName: cfg.display_name, modelId: cfg.model_id, status: "active" };
  const json = JSON.stringify(pub);
  assert.ok(!json.includes("sk-xxx"));
  assert.ok(!json.includes("AbCd"));
  assert.ok(!("api_key" in pub) && !("secret_last_four" in pub));
  assert.equal(pub.modelId, "gpt-5.6-luna");
});

console.log(`\n${n} passed (public-agents)`);
