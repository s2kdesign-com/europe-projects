// Unit + dry-run тестове за multi-country foundation. Пускат се и с `node`.
import assert from "node:assert/strict";
import { CountryConnector } from "../src/ingestion/core/CountryConnector.js";
import { getConnector } from "../src/ingestion/index.js";
import { RoConnector } from "../src/ingestion/countries/ro/index.js";
import { resolveCountry, countryFromLocales } from "../app/lib/country/resolve.js";
import { normalizeCountry, isValidCountry, getCountryBySlug, COUNTRIES } from "../app/lib/country/countries.js";

let passed = 0;
// Под vitest (globals: true) `it` е глобален → регистрира се като истински тест.
// Без vitest (директно с `node`) пада на ръчния брояч по-долу.
const t = typeof it === "function" ? it : (name, fn) => { fn(); passed++; console.log("ok -", name); };

// --- Registry ---
t("27 държави в регистъра", () => assert.equal(COUNTRIES.length, 27));
t("нормализация на код", () => { assert.equal(normalizeCountry("ro"), "RO"); assert.equal(normalizeCountry("xx"), null); });
t("валидност", () => { assert.ok(isValidCountry("BG")); assert.ok(!isValidCountry("ZZ")); });
t("slug → държава", () => assert.equal(getCountryBySlug("romania").code, "RO"));

// --- Resolution приоритет ---
t("URL има най-висок приоритет", () => {
  const r = resolveCountry({ urlSlug: "greece", profileCountry: "RO", profileMode: "manual", cloudflareCountry: "PL" });
  assert.equal(r.country, "GR"); assert.equal(r.source, "url");
});
t("профил (manual) над guest/cf", () => {
  const r = resolveCountry({ profileCountry: "RO", profileMode: "manual", guestPref: { country: "PL", mode: "manual" }, cloudflareCountry: "HR" });
  assert.equal(r.country, "RO"); assert.equal(r.source, "profile");
});
t("guest manual над cloudflare", () => {
  const r = resolveCountry({ guestPref: { country: "PL", mode: "manual" }, cloudflareCountry: "HR" });
  assert.equal(r.country, "PL"); assert.equal(r.source, "local");
});
t("cloudflare (auto) когато няма ръчен избор", () => {
  const r = resolveCountry({ cloudflareCountry: "RO" });
  assert.equal(r.country, "RO"); assert.equal(r.source, "cloudflare"); assert.equal(r.mode, "auto");
});
t("автоматичното НЕ се записва като manual", () => {
  const r = resolveCountry({ profileCountry: "RO", profileMode: "auto", cloudflareCountry: "PL" });
  // profile mode=auto → игнорира се; пада на cloudflare
  assert.equal(r.country, "PL"); assert.equal(r.mode, "auto");
});
t("browser locale region (пропуска не-EU GB, хваща RO)", () => {
  assert.equal(countryFromLocales(["ro-RO"]), "RO");
  assert.equal(countryFromLocales(["en-GB", "ro-RO"]), "RO"); // GB не е в регистъра → продължава
  assert.equal(countryFromLocales(["en"]), null); // без region subtag
});
t("fallback България", () => assert.equal(resolveCountry({}).country, "BG"));

// --- Connector helpers ---
t("toIsoDate формати", () => {
  assert.equal(CountryConnector.toIsoDate("21.09.2026"), "2026-09-21");
  assert.equal(CountryConnector.toIsoDate("2026-07-31"), "2026-07-31");
  assert.equal(CountryConnector.toIsoDate("нещо"), null);
});
t("normalizeStatus", () => {
  assert.equal(CountryConnector.normalizeStatus("Deschis"), "open");
  assert.equal(CountryConnector.normalizeStatus("Приключена"), "closed");
});
t("content hash е стабилен и различен при промяна", () => {
  const a = CountryConnector.contentHash({ name: "X", status: "open" });
  const b = CountryConnector.contentHash({ name: "X", status: "open" });
  const c = CountryConnector.contentHash({ name: "X", status: "closed" });
  assert.equal(a, b); assert.notEqual(a, c);
});
t("fingerprint не е само по заглавие", () => {
  assert.notEqual(CountryConnector.fingerprint(["A", "P1"]), CountryConnector.fingerprint(["A", "P2"]));
});
t("validate маркира липсващи полета", () => {
  const v = CountryConnector.validate({ name: "", country_code: "RO" });
  assert.ok(!v.ok); assert.ok(v.flags.includes("missing_name"));
});

// --- RO connector dry run (без запис) ---
t("RO connector от регистъра", () => assert.ok(getConnector("RO") instanceof RoConnector));
t("RO fetchCalls е pending (не измисля данни)", async () => {});
await (async () => {
  const ro = new RoConnector();
  const calls = await ro.fetchCalls();
  assert.equal(calls.pending, true);
  const norm = ro.normalizeProcedure({ name: "Test RO call", status: "Deschis", deadline_date: "21.09.2026", url: "https://oportunitati-ue.gov.ro/x" });
  assert.equal(norm.country_code, "RO");
  assert.equal(norm.status, "open");
  assert.equal(norm.deadline_date, "2026-09-21");
  assert.ok(norm.content_hash);
  const v = CountryConnector.validate(norm);
  assert.ok(v.ok, "нормализиран RO запис минава валидация: " + JSON.stringify(v.flags));
  passed++; console.log("ok - RO dry run: normalize+validate");
})();

console.log(`\n${passed} проверки минаха.`);
