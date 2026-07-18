// Тестове за nightly AI pipeline логиката (чисти функции). node test/ai-pipeline.test.mjs
import assert from "node:assert/strict";
import {
  PURPOSE_DEPS, PIPELINE_PURPOSES, EXCLUDED_PURPOSES, isPipelinePurpose, isExcludedPurpose,
  idempotencyKey, jobPriority, sanitizeRecommendationProfile, hashText,
} from "../worker/ai/pipeline.js";
import { parseAndValidate, PROMPT_VERSIONS, buildPrompt } from "../worker/ai/prompts.js";

let n = 0;
// Под vitest (globals: true) `it` е глобален → регистрира се като истински тест.
// Без vitest (директно с `node`) пада на ръчния брояч по-долу.
const t = typeof it === "function" ? it : (name, fn) => { fn(); n++; console.log("ok -", name); };

t("future_chat и daily_review са изключени от pipeline-а", () => {
  assert.ok(isExcludedPurpose("future_chat"));
  assert.ok(isExcludedPurpose("daily_review"));
  assert.ok(!isPipelinePurpose("future_chat"));
  assert.ok(!PIPELINE_PURPOSES.includes("future_chat"));
  assert.deepEqual(EXCLUDED_PURPOSES.sort(), ["daily_review", "future_chat"]);
});

t("dependency graph: recommendation чака трите", () => {
  assert.deepEqual(PURPOSE_DEPS.procedure_analysis, []);
  assert.deepEqual(PURPOSE_DEPS.document_analysis, ["procedure_analysis"]);
  assert.deepEqual(PURPOSE_DEPS.budget_analysis, ["procedure_analysis"]);
  assert.deepEqual(PURPOSE_DEPS.recommendation.sort(), ["budget_analysis", "document_analysis", "procedure_analysis"]);
});

t("idempotency ключ включва purpose/entity/hash/model/prompt/schema", () => {
  const k = idempotencyKey({ purpose: "procedure_analysis", entityType: "procedure", entityId: "123", sourceHash: "HASH", modelId: "gpt-5.6-terra" });
  assert.equal(k, "procedure_analysis:procedure:123:HASH:gpt-5.6-terra:v1:v1");
});
t("промяна на модела → нов idempotency ключ", () => {
  const a = idempotencyKey({ purpose: "budget_analysis", entityType: "budget", entityId: "9", sourceHash: "H", modelId: "gpt-5.6-luna" });
  const b = idempotencyKey({ purpose: "budget_analysis", entityType: "budget", entityId: "9", sourceHash: "H", modelId: "gpt-5.4-nano" });
  assert.notEqual(a, b);
});
t("промяна на content hash → нов ключ", () => {
  const a = idempotencyKey({ purpose: "procedure_analysis", entityType: "procedure", entityId: "1", sourceHash: "H1", modelId: "m" });
  const b = idempotencyKey({ purpose: "procedure_analysis", entityType: "procedure", entityId: "1", sourceHash: "H2", modelId: "m" });
  assert.notEqual(a, b);
});

t("приоритет: спешен срок изпреварва full reanalysis", () => {
  const urgent = jobPriority({ deadlineDays: 3 });
  const full = jobPriority({ isFullReanalysis: true });
  assert.ok(urgent < full);
  assert.equal(jobPriority({ deadlineDays: 3 }), 10);
  assert.equal(jobPriority({ deadlineDays: 20 }), 20);
  assert.equal(jobPriority({ isNewToday: true }), 30);
  assert.equal(jobPriority({ isFailed: true }), 60);
});

t("recommendation privacy: само неутрални полета", () => {
  const clean = sanitizeRecommendationProfile({
    p_country: "BG", p_org_type: "sme", p_sectors: ["IT"], p_region: "BG-03", p_size: "micro", p_budget: "100000",
    email: "x@y.com", name: "Ivan", google_id: "g123", notes: "секретно", notification_days_before: 7, session: "s",
  });
  assert.ok(!("email" in clean));
  assert.ok(!("name" in clean));
  assert.ok(!("google_id" in clean));
  assert.ok(!("notes" in clean));
  assert.ok(!("session" in clean));
  assert.equal(clean.p_country, "BG");
  assert.deepEqual(clean.p_sectors, ["IT"]);
});

t("hashText е детерминистичен и се променя при промяна", () => {
  assert.equal(hashText("abc"), hashText("abc"));
  assert.notEqual(hashText("abc"), hashText("abd"));
});

t("prompt versions за 4-те pipeline purposes", () => {
  for (const p of PIPELINE_PURPOSES) assert.ok(PROMPT_VERSIONS[p], "липсва prompt версия за " + p);
});

t("schema validation: валиден JSON минава", () => {
  const r = parseAndValidate("budget_analysis", '{"total_budget":1000000,"currency":"EUR","max_per_project":null,"min_per_project":null,"cofinancing_pct":80,"own_contribution_pct":null,"components":["A"],"conflicts":null,"eur_normalized":1000000,"flags":null}');
  assert.ok(r.ok);
  assert.equal(r.value.total_budget, 1000000);
});
t("schema validation: грешен тип → отказ", () => {
  const r = parseAndValidate("budget_analysis", '{"total_budget":"много","currency":"EUR"}');
  assert.ok(!r.ok);
  assert.match(r.error, /schema_type/);
});
t("schema validation: невалиден JSON → отказ", () => {
  const r = parseAndValidate("procedure_analysis", "това не е JSON");
  assert.ok(!r.ok);
  assert.equal(r.error, "invalid_json");
});
t("schema validation: толерира ограждащ текст (repair)", () => {
  const r = parseAndValidate("recommendation", 'ето JSON: {"match_score":0.8,"explanation":"подходящо","mismatches":null} край');
  assert.ok(r.ok);
  assert.equal(r.value.match_score, 0.8);
});

t("recommendation prompt НЕ съдържа лични данни от профила", () => {
  // Реалният поток: профилът минава през sanitize, после в ctx. Личните полета
  // (име, имейл, Google ID) не оцеляват → не попадат в prompt-а.
  const profile = { p_country: "BG", p_org_type: "sme", email: "ivan@x.com", name: "Ivan", google_id: "g-777-secret" };
  const clean = sanitizeRecommendationProfile(profile);
  const prompt = buildPrompt("recommendation", { ...clean, name: "Процедура за иновации", program: "PKIP" });
  assert.ok(!prompt.includes("ivan@x.com"));
  assert.ok(!prompt.includes("g-777-secret"));
  assert.ok(prompt.includes("BG")); // структурираните полета остават
});

console.log(`\n${n} passed (ai-pipeline)`);
