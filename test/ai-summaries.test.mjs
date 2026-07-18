// Тестове за детерминистичните резултатни резюмета + safe redaction.
// node test/ai-summaries.test.mjs
import assert from "node:assert/strict";
import { buildResultSummary, buildResultDetails, redactObject } from "../worker/ai/summaries.js";

let n = 0;
// Под vitest (globals: true) `it` е глобален → регистрира се като истински тест.
// Без vitest (директно с `node`) пада на ръчния брояч по-долу.
const t = typeof it === "function" ? it : (name, fn) => { fn(); n++; console.log("ok -", name); };

t("procedure summary с промени", () => {
  assert.equal(buildResultSummary("procedure_analysis", { processed: 12, changes: 3, status: "completed" }), "Анализира 12 процедури · откри 3 промени");
});
t("procedure summary с requires_review", () => {
  assert.equal(buildResultSummary("procedure_analysis", { processed: 5, requiresReview: 1, status: "completed" }), "Структура".slice(0, 0) + "Анализира 5 процедури · 1 изисква проверка");
});
t("document summary", () => {
  assert.equal(buildResultSummary("document_analysis", { processed: 8, changes: 2, status: "completed" }), "Прегледа 8 документа · откри 2 промени");
});
t("budget summary без проблеми", () => {
  assert.equal(buildResultSummary("budget_analysis", { processed: 4, status: "completed" }), "Структурира 4 бюджета · няма открити проблеми");
});
t("budget summary с противоречие", () => {
  assert.equal(buildResultSummary("budget_analysis", { processed: 6, conflicts: 1, status: "completed" }), "Структурира 6 бюджета · 1 противоречия");
});
t("recommendation summary", () => {
  assert.equal(buildResultSummary("recommendation", { processed: 24, profiles: 3, status: "completed" }), "Обнови 24 препоръки за 3 профила");
});
t("failed summary не показва raw exception", () => {
  const s = buildResultSummary("procedure_analysis", { status: "failed", safeError: "временна грешка от доставчика" });
  assert.equal(s, "Неуспешно: временна грешка от доставчика");
});
t("skipped summary", () => {
  assert.equal(buildResultSummary("procedure_analysis", { processed: 0, skipped: 4, status: "completed" }), "Пропуснато: няма нови или променени записи");
});
t("partial summary", () => {
  assert.equal(buildResultSummary("procedure_analysis", { requested: 12, processed: 9, failed: 3, status: "partial" }), "Обработи 9 от 12 процедури · 3 неуспешни");
});

t("redaction маха ключове/prompt/reasoning/email", () => {
  const clean = redactObject({ api_key: "sk-secret", authorization: "Bearer x", prompt: "system...", reasoning: "cot", email: "a@b.c", google_id: "g", session: "s", safe: "ok", nested: { openai_api_key: "x", title: "keep" } });
  assert.ok(!("api_key" in clean));
  assert.ok(!("authorization" in clean));
  assert.ok(!("prompt" in clean));
  assert.ok(!("reasoning" in clean));
  assert.ok(!("email" in clean));
  assert.ok(!("google_id" in clean));
  assert.ok(!("session" in clean));
  assert.equal(clean.safe, "ok");
  assert.ok(!("openai_api_key" in clean.nested));
  assert.equal(clean.nested.title, "keep");
});

t("details: агрегати + ограничени items, безопасен размер", () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ entityId: "p" + i, title: "T" + i, status: "processed" }));
  const { object, json } = buildResultDetails("procedure_analysis", {
    summary: "test", scope: { requested: 50, processed: 50 }, items,
    execution: { provider: "openai", modelId: "gpt-5.6-terra", inputTokens: 300, outputTokens: 20 },
  });
  assert.ok(object.items.length <= 20);
  assert.ok(object.itemsTruncated);
  assert.ok(json.length < 20000);
  assert.equal(object.execution.modelId, "gpt-5.6-terra");
});

t("details не съдържа prompt/ключ дори при подадени", () => {
  const { json } = buildResultDetails("document_analysis", {
    summary: "x", items: [{ entityId: "d1", title: "Doc", api_key: "sk-leak", prompt: "leak", status: "processed" }],
    execution: {},
  });
  assert.ok(!json.includes("sk-leak"));
  assert.ok(!json.includes("leak"));
});

console.log(`\n${n} passed (ai-summaries)`);
