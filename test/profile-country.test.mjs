// Тестове за country-aware профила: административни етикети, валутни диапазони,
// нормализация на региони. node test/profile-country.test.mjs
import assert from "node:assert/strict";
import { countryAdminLabels, normalizeCountry } from "../app/lib/country/countries.js";
import { revenueRanges } from "../app/lib/profile-taxonomy.js";

let n = 0;
// Под vitest (globals: true) `it` е глобален → регистрира се като истински тест.
// Без vitest (директно с `node`) пада на ръчния брояч по-долу.
const t = typeof it === "function" ? it : function (name, fn) { fn(); n++; console.log("ok -", name); };

t("BG етикети: Област/Община", () => {
  assert.deepEqual(countryAdminLabels("BG"), { region: "Област", municipality: "Община" });
});
t("RO етикети: Окръг (НЕ Област)", () => {
  assert.equal(countryAdminLabels("RO").region, "Окръг");
});
t("DE етикети: Федерална провинция", () => {
  assert.equal(countryAdminLabels("DE").region, "Федерална провинция");
});
t("PL етикети: Воеводство/Гмина", () => {
  assert.deepEqual(countryAdminLabels("PL"), { region: "Воеводство", municipality: "Гмина" });
});
t("непозната държава → генеричен Регион, не Област", () => {
  assert.equal(countryAdminLabels("XX").region, "Регион");
});
t("lowercase код се нормализира", () => {
  assert.equal(countryAdminLabels("ro").region, "Окръг");
  assert.equal(normalizeCountry("de"), "DE");
});
t("оборот: валутата НЕ е hardcode-ната BGN", () => {
  assert.match(revenueRanges("RON")[0].label, /RON$/);
  assert.match(revenueRanges("EUR")[3].label, /EUR$/);
  assert.match(revenueRanges("BGN")[0].label, /BGN$/);
});
t("оборот: стабилни ключове независимо от валутата", () => {
  assert.deepEqual(revenueRanges("RON").map((x) => x.key), revenueRanges("BGN").map((x) => x.key));
});
t("оборот: липсваща валута → EUR fallback", () => {
  assert.match(revenueRanges()[0].label, /EUR$/);
});

console.log(`\n${n} passed (profile-country)`);
