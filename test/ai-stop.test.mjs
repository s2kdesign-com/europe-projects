// Тестове за stop/recover/summary логиката (fake DB). node test/ai-stop.test.mjs
import assert from "node:assert/strict";
import { stopPurpose, jobsSummary, stuckJobCount, PURPOSE_DEPS } from "../worker/ai/pipeline.js";

let n = 0;
const t = typeof it === "function" ? it : (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log("ok -", name); });

function fakeDB(handlers) {
  return {
    prepare(sql) {
      const key = Object.keys(handlers).find((k) => sql.includes(k));
      const h = handlers[key] || {};
      let bound = [];
      const api = {
        bind(...a) { bound = a; return api; },
        async run() { return { meta: { changes: h.changes != null ? h.changes : 0 } }; },
        async all() { return { results: h.all ? h.all(bound) : [] }; },
        async first() { return h.first ? h.first(bound) : null; },
      };
      return api;
    },
  };
}

await t("stopPurpose отменя чакащите + блокира зависимите надолу", async () => {
  const calls = [];
  const env = { DB: fakeDB({
    "UPDATE ai_jobs SET status='cancelled'": { changes: 3 },
    "UPDATE ai_pipeline_runs SET": { changes: 1 },
  }) };
  const res = await stopPurpose(env, "run1", "procedure_analysis");
  // procedure_analysis е предпоставка за doc/budget/recommendation
  assert.deepEqual(res.affectedPurposes.sort(), ["budget_analysis", "document_analysis", "recommendation"]);
});

await t("stopPurpose за recommendation няма зависими надолу", async () => {
  const env = { DB: fakeDB({ "UPDATE ai_jobs SET status='cancelled'": { changes: 1 }, "UPDATE ai_pipeline_runs SET": { changes: 1 } }) };
  const res = await stopPurpose(env, "run1", "recommendation");
  assert.deepEqual(res.affectedPurposes, []);
});

await t("jobsSummary смята terminal и процент", async () => {
  const env = { DB: fakeDB({
    "SELECT status, COUNT(*) n FROM ai_jobs": { all: () => [
      { status: "completed", n: 10 }, { status: "failed", n: 2 }, { status: "queued", n: 8 }, { status: "running", n: 0 },
    ] },
    "SELECT purpose, status, COUNT(*) n": { all: () => [] },
  }) };
  const sum = await jobsSummary(env, "run1");
  assert.equal(sum.total, 20);
  assert.equal(sum.terminal, 12); // completed + failed
  assert.equal(sum.percent, 60);
});

await t("stuckJobCount: running над timeout ИЛИ изтекъл lock", async () => {
  const old = new Date(Date.now() - 10 * 60000).toISOString(); // 10 мин назад
  const expiredLock = new Date(Date.now() - 60000).toISOString();
  const fresh = new Date(Date.now() - 5000).toISOString();
  const future = new Date(Date.now() + 60000).toISOString();
  const env = { DB: fakeDB({ "SELECT purpose, started_at, lock_expires_at FROM ai_jobs WHERE status='running'": { all: () => [
    { purpose: "procedure_analysis", started_at: old, lock_expires_at: future },   // overtime → stuck
    { purpose: "budget_analysis", started_at: fresh, lock_expires_at: expiredLock }, // lock изтекъл → stuck
    { purpose: "recommendation", started_at: fresh, lock_expires_at: future },       // ок
  ] } }) };
  const c = await stuckJobCount(env);
  assert.equal(c, 2);
});

await t("dependency graph е коректен за stop блокирането", () => {
  assert.ok(PURPOSE_DEPS.document_analysis.includes("procedure_analysis"));
  assert.ok(PURPOSE_DEPS.recommendation.includes("budget_analysis"));
});

console.log(`\n${n} passed (ai-stop)`);
