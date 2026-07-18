// Тестове за multi-country Scheduled Task логиката (cursor, locks, timeout, готовност).
import assert from "node:assert/strict";
import {
  canProductionSync, orderCountries, nextCountry, planRun,
  isLockActive, canAcquireLock, makeLock, makeTimeBudget,
  SYNCABLE_STATUSES, ROLLOUT_STATUSES,
} from "../src/ingestion/core/scheduler.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("ok -", name); };

const C = (code, priority, ingestion_status = "active") => ({ code, priority, ingestion_status });
// Интеграционен сценарий от спецификацията: BG active, RO active, GR connector_ready,
// PL connector_in_progress, HR blocked.
const SAMPLE = [
  C("BG", 0, "active"), C("RO", 1, "active"), C("GR", 2, "connector_ready"),
  C("PL", 3, "connector_in_progress"), C("HR", 4, "blocked"),
];

// --- Dynamic loading / ordering ---
t("подредба по priority, после code", () => {
  const out = orderCountries([C("RO", 1), C("BG", 0), C("GR", 2)]);
  assert.deepEqual(out.map((c) => c.code), ["BG", "RO", "GR"]);
});
t("стабилна подредба при равен priority", () => {
  const out = orderCountries([{ code: "B", priority: 5 }, { code: "A", priority: 5 }]);
  assert.deepEqual(out.map((c) => c.code), ["A", "B"]);
});

// --- Cursor / next country ---
t("без cursor → първата държава", () => {
  assert.equal(nextCountry(SAMPLE, null).country.code, "BG");
});
t("cursor BG → следваща RO (не започва пак от BG)", () => {
  const r = nextCountry(SAMPLE, "BG");
  assert.equal(r.country.code, "RO"); assert.equal(r.wrapped, false);
});
t("cursor последна (HR) → нов цикъл от BG (wrap)", () => {
  const r = nextCountry(SAMPLE, "HR");
  assert.equal(r.country.code, "BG"); assert.equal(r.wrapped, true);
});
t("непознат cursor → рестарт от първата (защита)", () => {
  assert.equal(nextCountry(SAMPLE, "XX").country.code, "BG");
});
t("resume след прекъсване: run от RO продължава RO→GR→PL", () => {
  const { queue } = planRun(SAMPLE, "BG", 3);
  assert.deepEqual(queue.map((c) => c.code), ["RO", "GR", "PL"]);
});
t("round-robin fairness: опашката обхожда и увива", () => {
  const { queue } = planRun(SAMPLE, "PL", 3);
  assert.deepEqual(queue.map((c) => c.code), ["HR", "BG", "RO"]);
});
t("празен списък е безопасен", () => {
  assert.equal(nextCountry([], "BG").country, null);
  assert.deepEqual(planRun([], null).queue, []);
});

// --- Готовност за production sync ---
t("active + източник + connector → sync", () => {
  assert.ok(canProductionSync(C("BG", 0, "active"), { verifiedEnabledSources: 5, hasConnector: true }));
});
t("connector_ready се допуска", () => {
  assert.ok(canProductionSync(C("GR", 2, "connector_ready"), { verifiedEnabledSources: 1, hasConnector: true }));
});
t("connector_in_progress НЕ се production sync-ва", () => {
  assert.ok(!canProductionSync(C("PL", 3, "connector_in_progress"), { verifiedEnabledSources: 2, hasConnector: true }));
});
t("blocked НЕ се sync-ва", () => {
  assert.ok(!canProductionSync(C("HR", 4, "blocked"), { verifiedEnabledSources: 2, hasConnector: true }));
});
t("без verified източник → не (дори active)", () => {
  assert.ok(!canProductionSync(C("RO", 1, "active"), { verifiedEnabledSources: 0, hasConnector: true }));
});
t("без connector → не (и никакъв BG fallback)", () => {
  assert.ok(!canProductionSync(C("RO", 1, "active"), { verifiedEnabledSources: 3, hasConnector: false }));
});
t("статус групите са пълни и не се застъпват", () => {
  for (const s of SYNCABLE_STATUSES) assert.ok(!ROLLOUT_STATUSES.includes(s));
});

// --- Locks ---
t("свободен lock може да се вземе", () => {
  assert.ok(canAcquireLock(null));
  assert.ok(canAcquireLock({ locked_at: null }));
});
t("активен lock блокира", () => {
  const lock = makeLock("run-1", new Date());
  assert.ok(isLockActive(lock));
  assert.ok(!canAcquireLock(lock));
});
t("изтекъл lock се възстановява", () => {
  const past = new Date(Date.now() - 60 * 60000);
  const lock = makeLock("run-old", past, 50); // изтекъл преди 10 мин
  assert.ok(!isLockActive(lock));
  assert.ok(canAcquireLock(lock));
});

// --- Timeout safety ---
t("в рамките на прозореца → продължава", () => {
  const b = makeTimeBudget(Date.now(), 10 * 60000);
  assert.ok(b.shouldContinue());
});
t("изчерпан прозорец → спира контролирано", () => {
  const b = makeTimeBudget(Date.now() - 11 * 60000, 10 * 60000);
  assert.ok(!b.shouldContinue());
});

// --- Интеграционен сценарий (изчислителна симулация) ---
t("пълен цикъл: BG→RO sync; GR обработена; PL/HR пропуснати; следващ run продължава", () => {
  const has = { BG: true, RO: true, GR: true, PL: false, HR: false };
  const srcs = { BG: 5, RO: 4, GR: 1, PL: 0, HR: 0 };
  const synced = [], skipped = [];
  let cursor = null;
  // Run 1: бюджет 3 държави
  for (const c of planRun(SAMPLE, cursor, 3).queue) {
    if (canProductionSync(c, { verifiedEnabledSources: srcs[c.code], hasConnector: has[c.code] })) synced.push(c.code);
    else skipped.push(c.code);
    cursor = c.code; // държавата е "завършена" (обработена или пропусната с причина)
  }
  assert.deepEqual(synced, ["BG", "RO", "GR"]);
  // Run 2: продължава от PL, не от BG
  const run2 = planRun(SAMPLE, cursor, 3).queue.map((c) => c.code);
  assert.deepEqual(run2, ["PL", "HR", "BG"]); // wrap → нов цикъл след HR
  for (const code of ["PL", "HR"]) {
    const c = SAMPLE.find((x) => x.code === code);
    assert.ok(!canProductionSync(c, { verifiedEnabledSources: srcs[code], hasConnector: has[code] }));
  }
});

console.log(`\n${passed} проверки минаха.`);
