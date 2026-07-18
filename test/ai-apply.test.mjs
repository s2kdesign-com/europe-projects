// Тестове за прилагането на резултати (budget conversion) + агрегати през фалшив DB.
// node test/ai-apply.test.mjs
import assert from "node:assert/strict";
import { recomputeCountrySnapshot, budgetDiagnostics } from "../worker/ai/pipeline.js";

let n = 0;
// Под vitest (globals: true) `it` е глобален → регистрира се като истински тест.
// Без vitest (директно с `node`) пада на ръчния Promise-базиран runner по-долу.
const t = typeof it === "function" ? it : (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log("ok -", name); });

// Малък in-memory fake на env.DB (prepare/bind/run/all/first) за детерминистични тестове.
function fakeDB(handlers) {
  return {
    prepare(sql) {
      const key = Object.keys(handlers).find((k) => sql.includes(k));
      const h = handlers[key] || {};
      let bound = [];
      const api = {
        bind(...args) { bound = args; return api; },
        async run() { if (h.run) h.run(bound); return { meta: { changes: 1 } }; },
        async all() { return { results: h.all ? h.all(bound) : [] }; },
        async first() { return h.first ? h.first(bound) : null; },
      };
      return api;
    },
  };
}

await t("recomputeCountrySnapshot изпълнява UPDATE за държавата", async () => {
  let ran = null;
  const env = { DB: fakeDB({ "UPDATE country_daily_statistics": { run: (b) => { ran = b; } } }) };
  await recomputeCountrySnapshot(env, "BG");
  assert.deepEqual(ran, ["BG"]);
});

await t("recomputeCountrySnapshot не прави нищо при празна държава", async () => {
  let ran = false;
  const env = { DB: fakeDB({ "UPDATE country_daily_statistics": { run: () => { ran = true; } } }) };
  await recomputeCountrySnapshot(env, null);
  assert.equal(ran, false);
});

await t("budgetDiagnostics връща редовете от заявката", async () => {
  const env = { DB: fakeDB({ "SELECT country_code": { all: () => [{ country_code: "BG", procedures: 42, applied_eur: 29 }] } }) };
  const d = await budgetDiagnostics(env);
  assert.equal(d.length, 1);
  assert.equal(d[0].applied_eur, 29);
});

// Проверка на конвертиращата логика (extract от applyResult правилата).
function budgetToEur(total, currency) {
  const cur = (currency || "").toUpperCase();
  if (total == null || !Number.isFinite(total)) return null;
  if (cur === "EUR" || cur === "€" || cur === "") return Math.round(total * 100) / 100;
  if (cur === "BGN" || cur === "ЛВ") return Math.round((total / 1.95583) * 100) / 100;
  return null; // плаваща валута → без EUR
}
await t("EUR бюджет се прилага директно", () => {
  assert.equal(budgetToEur(1000000, "EUR"), 1000000);
});
await t("BGN се конвертира по фиксирания курс", () => {
  assert.equal(budgetToEur(1955830, "BGN"), 1000000);
});
await t("плаваща валута (PLN/HUF) → NULL (без измислена стойност)", () => {
  assert.equal(budgetToEur(300000000, "PLN"), null);
  assert.equal(budgetToEur(138937500000, "HUF"), null);
});
await t("липсваща сума → NULL", () => {
  assert.equal(budgetToEur(null, "EUR"), null);
});

console.log(`\n${n} passed (ai-apply)`);
