// Тестове за агрегиране на статистики: бюджети (exclusion/dedup), Europe totals,
// anomaly проверки, snapshot избор.
import assert from "node:assert/strict";
import { aggregateBudgets, aggregateEurope, checkSnapshotAnomalies, pickPublishedSnapshotDate } from "../src/ingestion/core/statistics.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("ok -", name); };

// --- Бюджети ---
t("сумира само валидни структурирани EUR стойности", () => {
  const r = aggregateBudgets([
    { budget_eur: 1000000, dedup_key: "a" },
    { budget_eur: null, dedup_key: "b" },          // липсваща → изключена
    { budget_eur: "17 млн." , dedup_key: "c" },     // неструктурирана → изключена
    { budget_eur: NaN, dedup_key: "d" },            // невалидна → изключена
    { budget_eur: -5, dedup_key: "e" },             // отрицателна → изключена
    { budget_eur: 500000, dedup_key: "f" },
  ]);
  assert.equal(r.totalEur, 1500000);
  assert.equal(r.includedCount, 2);
});
t("не сумира дубликати от няколко източника", () => {
  const r = aggregateBudgets([
    { budget_eur: 100, dedup_key: "BG:src1:p1" },
    { budget_eur: 100, dedup_key: "BG:src1:p1" }, // duplicate
    { budget_eur: 50, dedup_key: "BG:src2:p2" },
  ]);
  assert.equal(r.totalEur, 150);
  assert.equal(r.includedCount, 2);
});
t("без валидни бюджети → null (не 0, не измислена стойност)", () => {
  const r = aggregateBudgets([{ budget_eur: null }, { budget_eur: undefined }]);
  assert.equal(r.totalEur, null);
  assert.equal(r.includedCount, 0);
});

// --- Europe totals ---
t("Europe totals агрегира коректно", () => {
  const rows = [
    { total_procedures: 42, active_procedures: 20, procedures_with_documents: 31, active_sources: 5, new_last_30_days: 12, updated_last_30_days: 2, budget_procedure_count: 0, published_budget_eur: null },
    { total_procedures: 0, active_procedures: 0, procedures_with_documents: 0, active_sources: 0, new_last_30_days: 0, updated_last_30_days: 0, budget_procedure_count: 0, published_budget_eur: null },
  ];
  const s = aggregateEurope(rows);
  assert.equal(s.countries, 2);
  assert.equal(s.countriesWithActiveSources, 1);
  assert.equal(s.totalProcedures, 42);
  assert.equal(s.activeProcedures, 20);
  assert.equal(s.publishedBudgetEur, null); // без данни → null
});
t("Europe totals сумира бюджет само при наличен", () => {
  const s = aggregateEurope([{ published_budget_eur: 100, total_procedures: 1 }, { published_budget_eur: null }]);
  assert.equal(s.publishedBudgetEur, 100);
});

// --- Anomaly проверки ---
t("active > total е аномалия", () => {
  const r = checkSnapshotAnomalies({ total_procedures: 5, active_procedures: 9 }, null);
  assert.ok(!r.ok); assert.ok(r.flags.includes("active_gt_total"));
});
t("отрицателен бюджет е аномалия", () => {
  const r = checkSnapshotAnomalies({ total_procedures: 5, active_procedures: 2, published_budget_eur: -1 }, null);
  assert.ok(r.flags.includes("negative_budget"));
});
t("рязък спад >50% е аномалия", () => {
  const r = checkSnapshotAnomalies({ total_procedures: 10, active_procedures: 5 }, { total_procedures: 42, active_procedures: 20 });
  assert.ok(r.flags.includes("unusual_drop"));
});
t("внезапна нула след голям брой е аномалия", () => {
  const r = checkSnapshotAnomalies({ total_procedures: 0, active_procedures: 0 }, { total_procedures: 42 });
  assert.ok(r.flags.includes("sudden_zero"));
});
t("нормален snapshot минава", () => {
  const r = checkSnapshotAnomalies({ total_procedures: 45, active_procedures: 21, active_sources: 5 }, { total_procedures: 42, active_procedures: 20, active_sources: 5 });
  assert.ok(r.ok, JSON.stringify(r.flags));
});

// --- Partial sync protection / snapshot избор ---
t("публикува се последният published (pending_review не заменя)", () => {
  const rows = [
    { snapshot_date: "2026-07-17", publish_status: "published" },
    { snapshot_date: "2026-07-18", publish_status: "pending_review" },
  ];
  assert.equal(pickPublishedSnapshotDate(rows), "2026-07-17");
});
t("без published → null", () => {
  assert.equal(pickPublishedSnapshotDate([{ snapshot_date: "2026-07-18", publish_status: "pending_review" }]), null);
});

console.log(`\n${passed} проверки минаха.`);
