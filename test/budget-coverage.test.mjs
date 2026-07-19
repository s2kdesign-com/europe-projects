// Тестове за бюджетното покритие + честните статуси. node test/budget-coverage.test.mjs
import assert from "node:assert/strict";
import { budgetBreakdown, countryBudgetStatus, aggregateEurope } from "../src/ingestion/core/statistics.js";

let n = 0;
const t = typeof it === "function" ? it : (name, fn) => { fn(); n++; console.log("ok -", name); };

t("budget coverage: 170 от 651 = 26.1%", () => {
  const b = budgetBreakdown(651, 170, 6.95e9);
  assert.equal(b.totalProcedures, 651);
  assert.equal(b.validatedBudgetProcedures, 170);
  assert.equal(b.budgetCoveragePercent, 26.1);
  assert.equal(b.withoutValidatedBudget, 481);
});
t("budget coverage: 0 процедури → null (без деление на 0)", () => {
  const b = budgetBreakdown(0, 0, null);
  assert.equal(b.budgetCoveragePercent, null);
  assert.equal(b.knownPublishedBudgetEur, null);
});
t("budget coverage: 100% при пълно покритие", () => {
  assert.equal(budgetBreakdown(10, 10, 1000).budgetCoveragePercent, 100);
});

t("статус Австрия: 0 бюджет, 0 текст → no_budget_text", () => {
  assert.equal(countryBudgetStatus({ budget_procedure_count: 0, budget_text_procedures: 0, foreign_currency_procedures: 0, total_procedures: 54 }), "no_budget_text");
});
t("статус Полша: чужда валута → foreign_currency", () => {
  assert.equal(countryBudgetStatus({ budget_procedure_count: 0, budget_text_procedures: 30, foreign_currency_procedures: 31, total_procedures: 33 }), "foreign_currency");
});
t("статус България: има валидиран → validated", () => {
  assert.equal(countryBudgetStatus({ budget_procedure_count: 29, total_procedures: 42 }), "validated");
});
t("статус: има текст, но без EUR/чужда валута → requires_review", () => {
  assert.equal(countryBudgetStatus({ budget_procedure_count: 0, budget_text_procedures: 3, foreign_currency_procedures: 0, total_procedures: 5 }), "requires_review");
});
t("статус: 0 процедури → awaiting_analysis", () => {
  assert.equal(countryBudgetStatus({ budget_procedure_count: 0, total_procedures: 0 }), "awaiting_analysis");
});

t("aggregateEurope: sum БЕЗ дублиране (всяка процедура е в 1 държава)", () => {
  const rows = [
    { total_procedures: 42, budget_procedure_count: 29, published_budget_eur: 1.49e9, active_sources: 5 },
    { total_procedures: 31, budget_procedure_count: 25, published_budget_eur: 172.7e6, active_sources: 2 },
  ];
  const s = aggregateEurope(rows);
  assert.equal(s.totalProcedures, 73);
  assert.equal(s.budgetProcedureCount, 54);
  assert.ok(Math.abs(s.publishedBudgetEur - (1.49e9 + 172.7e6)) < 1);
  assert.equal(s.budget.budgetCoveragePercent, Math.round(54 / 73 * 1000) / 10);
});

t("LT/SI еднакво закръглени, но различни точни суми → НЕ са duplicate", () => {
  const lt = 172746988.67, si = 172697334.67;
  assert.notEqual(lt, si); // различни точни стойности
  // компактното форматиране би дало €172.7M и за двете — затова показваме точното в tooltip
  const compact = (v) => "€" + (v / 1e6).toFixed(1) + "M";
  assert.equal(compact(lt), compact(si)); // изглеждат еднакво
  assert.notEqual(lt, si); // но НЕ са
});

console.log(`\n${n} passed (budget-coverage)`);
