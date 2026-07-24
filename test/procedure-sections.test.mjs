// Тестове за конфигурацията на секциите в детайла на процедурата (без табове).
// node test/procedure-sections.test.mjs
import assert from "node:assert/strict";
import { PROCEDURE_SECTIONS, sectionIdForTab } from "../app/lib/procedure-sections.js";

let n = 0;
// Под vitest (globals: true) `it` е глобален → регистрира се като истински тест.
// Без vitest (директно с `node`) пада на ръчния брояч по-долу.
const t = typeof it === "function" ? it : (name, fn) => { fn(); n++; console.log("ok -", name); };

t("Секциите са в правилния логичен ред", () => {
  assert.deepEqual(PROCEDURE_SECTIONS.map((s) => s.key),
    ["overview", "eligible", "funding", "deadlines", "documents", "sources"]);
});

t("Всяка секция има стабилен anchor id", () => {
  assert.deepEqual(PROCEDURE_SECTIONS.map((s) => s.id), [
    "procedure-overview", "procedure-applicants", "procedure-financing",
    "procedure-deadlines", "procedure-documents", "procedure-sources",
  ]);
});

t("Няма дублирани id/key; всяка има икона и етикет", () => {
  assert.equal(new Set(PROCEDURE_SECTIONS.map((s) => s.id)).size, PROCEDURE_SECTIONS.length);
  assert.equal(new Set(PROCEDURE_SECTIONS.map((s) => s.key)).size, PROCEDURE_SECTIONS.length);
  for (const s of PROCEDURE_SECTIONS) { assert.ok(s.icon); assert.ok(s.label); }
});

t("sectionIdForTab: стар initialTab/?tab= → id на секция", () => {
  assert.equal(sectionIdForTab("documents"), "procedure-documents");
  assert.equal(sectionIdForTab("eligible"), "procedure-applicants");
  assert.equal(sectionIdForTab("funding"), "procedure-financing");
  assert.equal(sectionIdForTab("overview"), "procedure-overview");
});

t("sectionIdForTab: непознат таб → null", () => {
  assert.equal(sectionIdForTab("nope"), null);
  assert.equal(sectionIdForTab(undefined), null);
});

console.log(`\n${n} passed (procedure-sections)`);
