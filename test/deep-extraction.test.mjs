// Тестове за дълбокото извличане (v2.52.0): weighted round-robin покритие,
// completeness score, аномалии в бюджетите, документи/версии и история на промените.
import assert from "node:assert/strict";
import {
  TIME_ALLOCATION, COUNTRY_PROCEDURE_CAP, MIN_COUNTRIES_PER_RUN,
  allocateTime, countryPriorityScore, planCoverageRun, procedureCapFor,
  shouldYieldCountry, coverageRatios, rotationOffset, primaryObjective,
  COUNTRY_PRIORITY_SQL,
} from "../src/ingestion/core/coverage.js";
import {
  QUALITY_WEIGHTS, computeCompleteness, qualityStatus, assessProcedure,
  averageScore, qualityDistribution,
} from "../src/ingestion/core/quality.js";
import {
  reconcileBudget, detectBudgetAnomalies, detectCrossCountryDuplicateBudgets,
  detectDateAnomalies, requiresReview, isRoundAmount,
} from "../src/ingestion/core/anomalies.js";
import {
  normalizeUrl, classifyDocument, dedupeDocuments, classifyIncomingDocument,
  extractionOutcome, pickPrimaryDocument, guessMimeType, isPrimaryCategory,
} from "../src/ingestion/core/documents.js";
import {
  diffProcedure, valuesEqual, documentAddedChange, documentVersionChange,
  summarizeChanges, importantChanges, TRACKED_FIELDS,
} from "../src/ingestion/core/changes.js";
import {
  emptyRunMetrics, mergeRunMetrics, buildSafeSummary, coverageDelta,
  weightedAverageQuality, coverageFromRow, RUN_COUNTERS,
} from "../src/ingestion/core/run-report.js";
import { SQL } from "../src/ingestion/core/scheduler.js";
import { aggregateEurope, topCountriesBy, historicalDepth } from "../src/ingestion/core/statistics.js";

let passed = 0;
const t = typeof it === "function" ? it : (name, fn) => { fn(); passed++; console.log("ok -", name); };
const NOW = new Date("2026-08-04T09:00:00Z");

// ─────────────────────────────────────────────────────────────────────────────
// 1. Разпределение на времето
// ─────────────────────────────────────────────────────────────────────────────
t("дяловете на времето са 45/30/15/10", () => {
  assert.equal(TIME_ALLOCATION.fresh, 0.45);
  assert.equal(TIME_ALLOCATION.backfill, 0.30);
  assert.equal(TIME_ALLOCATION.lowCoverage, 0.15);
  assert.equal(TIME_ALLOCATION.discovery, 0.10);
  const sum = Object.values(TIME_ALLOCATION).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});
t("allocateTime разпределя целия бюджет без загуба от закръгляне", () => {
  const a = allocateTime(1_000_000);
  assert.equal(a.fresh + a.backfill + a.lowCoverage + a.discovery, 1_000_000);
  assert.equal(a.fresh, 450_000);
  const b = allocateTime(3333);
  assert.equal(b.fresh + b.backfill + b.lowCoverage + b.discovery, 3333);
});
t("allocateTime е устойчиво на невалиден вход", () => {
  assert.equal(allocateTime(-5).totalMs, 0);
  assert.equal(allocateTime(undefined).totalMs, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Приоритизация на държавите (динамична, без hardcoded кодове)
// ─────────────────────────────────────────────────────────────────────────────
const country = (code, o = {}) => ({
  code, priority: 50, total_procedures: 100, procedures_with_documents: 95,
  procedures_with_budget: 90, last_successful_sync_at: "2026-08-03T09:00:00Z",
  failing_sources: 0, blocked_sources: 0, ...o,
});

t("държава с 0 процедури е с най-висок приоритет", () => {
  const zero = countryPriorityScore(country("XX", { total_procedures: 0, procedures_with_documents: 0, procedures_with_budget: 0 }), { now: NOW });
  const healthy = countryPriorityScore(country("YY"), { now: NOW });
  assert.ok(zero.score > healthy.score);
  assert.ok(zero.reasons.includes("zero_procedures"));
});
t("никога несинхронизирана държава получава причина never_synced", () => {
  const s = countryPriorityScore(country("XX", { last_successful_sync_at: null }), { now: NOW });
  assert.ok(s.reasons.includes("never_synced"));
});
t("стар sync вдига приоритета пропорционално на дните", () => {
  const old = countryPriorityScore(country("XX", { last_successful_sync_at: "2026-06-01T00:00:00Z" }), { now: NOW });
  const recent = countryPriorityScore(country("YY", { last_successful_sync_at: "2026-08-02T00:00:00Z" }), { now: NOW });
  assert.ok(old.score > recent.score);
  assert.ok(old.reasons.includes("stale_sync"));
});
t("ниско покритие с документи и бюджет вдига приоритета", () => {
  const low = countryPriorityScore(country("XX", { procedures_with_documents: 10, procedures_with_budget: 5 }), { now: NOW });
  assert.ok(low.reasons.includes("low_document_coverage"));
  assert.ok(low.reasons.includes("low_budget_coverage"));
});
t("блокирани и failing източници дават причина", () => {
  const s = countryPriorityScore(country("XX", { failing_sources: 2, blocked_sources: 1 }), { now: NOW });
  assert.ok(s.reasons.includes("failing_sources"));
  assert.ok(s.reasons.includes("blocked_sources"));
});
t("SQL за приоритизация не съдържа hardcoded кодове на държави", () => {
  assert.ok(/FROM countries c/.test(COUNTRY_PRIORITY_SQL));
  assert.ok(!/'(BG|RO|DE|PL|FR|IT|ES)'/.test(COUNTRY_PRIORITY_SQL));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Round-robin и план на изпълнението
// ─────────────────────────────────────────────────────────────────────────────
t("rotationOffset брои от следващата след cursor-а", () => {
  const ordered = ["A", "B", "C", "D"];
  assert.equal(rotationOffset(ordered, "B", "C"), 0);
  assert.equal(rotationOffset(ordered, "B", "D"), 1);
  assert.equal(rotationOffset(ordered, "B", "A"), 2);
  assert.equal(rotationOffset(ordered, null, "A"), 0);
});
t("планът покрива поне 4 различни държави", () => {
  const countries = ["A", "B", "C", "D", "E", "F"].map((c, i) => country(c, { priority: i }));
  const plan = planCoverageRun({ countries, lastCompletedCode: "A", now: NOW, timeBudgetMs: 600000 });
  assert.equal(plan.queue.length, MIN_COUNTRIES_PER_RUN);
  assert.equal(new Set(plan.queue.map((q) => q.code)).size, MIN_COUNTRIES_PER_RUN);
});
t("планът не връща повече държави, отколкото има", () => {
  const plan = planCoverageRun({ countries: [country("A"), country("B")], now: NOW, timeBudgetMs: 1000 });
  assert.equal(plan.queue.length, 2);
});
t("при еднакъв резултат печели по-далечният от cursor-а (истински round-robin)", () => {
  const countries = ["A", "B", "C", "D"].map((c, i) => country(c, { priority: i }));
  const plan = planCoverageRun({ countries, lastCompletedCode: "A", now: NOW, timeBudgetMs: 1000 });
  assert.equal(plan.queue[0].code, "B");
});
t("държава с нулево покритие изпреварва cursor-а", () => {
  const countries = [
    country("A", { priority: 0 }),
    country("B", { priority: 1 }),
    country("C", { priority: 2 }),
    country("Z", { priority: 9, total_procedures: 0, procedures_with_documents: 0, procedures_with_budget: 0, last_successful_sync_at: null }),
  ];
  const plan = planCoverageRun({ countries, lastCompletedCode: "A", now: NOW, timeBudgetMs: 1000 });
  assert.equal(plan.queue[0].code, "Z");
});
t("планът носи цел и таван за всяка държава", () => {
  const plan = planCoverageRun({ countries: [country("A"), country("B")], now: NOW, timeBudgetMs: 1000 });
  for (const q of plan.queue) {
    assert.ok(["fresh", "backfill", "lowCoverage", "discovery"].includes(q.objective));
    assert.ok(q.procedureCap >= COUNTRY_PROCEDURE_CAP.min);
  }
});
t("primaryObjective съответства на причините", () => {
  assert.equal(primaryObjective(["zero_procedures"]), "lowCoverage");
  assert.equal(primaryObjective(["low_document_coverage"]), "backfill");
  assert.equal(primaryObjective(["blocked_sources"]), "discovery");
  assert.equal(primaryObjective([]), "fresh");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Таван на процедурите — никоя държава не монополизира
// ─────────────────────────────────────────────────────────────────────────────
t("таванът е между 15 и 25 при нормални условия", () => {
  const cap = procedureCapFor(country("A"));
  assert.ok(cap >= COUNTRY_PROCEDURE_CAP.min && cap <= COUNTRY_PROCEDURE_CAP.max);
});
t("backlog без документи вдига тавана до max", () => {
  const cap = procedureCapFor(country("A", { total_procedures: 100, procedures_with_documents: 70 }));
  assert.equal(cap, COUNTRY_PROCEDURE_CAP.max);
});
t("много голям backlog допуска изключение над max", () => {
  const cap = procedureCapFor(country("A", { total_procedures: 300, procedures_with_documents: 200 }));
  assert.equal(cap, COUNTRY_PROCEDURE_CAP.max * 2);
});
t("критично затварящи процедури допускат изключение над max", () => {
  const cap = procedureCapFor(country("A"), { criticalClosingSoon: 40 });
  assert.equal(cap, COUNTRY_PROCEDURE_CAP.max * 2);
});
t("shouldYieldCountry отстъпва при достигнат таван или изчерпан слот", () => {
  assert.equal(shouldYieldCountry({ processed: 20, cap: 20 }).yield, true);
  assert.equal(shouldYieldCountry({ processed: 20, cap: 20 }).reason, "procedure_cap");
  assert.equal(shouldYieldCountry({ processed: 3, cap: 20, elapsedMs: 100, sliceMs: 50 }).reason, "time_slice");
  assert.equal(shouldYieldCountry({ processed: 3, cap: 20, elapsedMs: 10, sliceMs: 50 }).yield, false);
});
t("coverageRatios връща null, а не 0, при липса на процедури", () => {
  const r = coverageRatios({ total_procedures: 0 });
  assert.equal(r.documents, null);
  assert.equal(r.budget, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Completeness score
// ─────────────────────────────────────────────────────────────────────────────
const FULL = {
  name: "Процедура", title_native: "Procedura", official_url: "https://x.gov.bg/p/1",
  status: "open", deadline_date: "2026-12-01", hasPrimaryDocument: true, documentCount: 3,
  budget_amount_eur: 5_000_000, budget_scope: "procedure", max_grant_eur: 300_000,
  applicant_types_json: '["sme","municipality"]', enterprise_sizes_json: '["micro","small"]',
  eligible_activities: "дейности", eligible_costs: "разходи",
  program: "ПКИП", eu_fund: "ERDF", managing_authority: "МИР",
  application_mode: "electronic", contact_email: "a@b.bg",
  last_verified_at: "2026-08-04", source_id: "bg-eufunds", source_procedure_id: "BG16RFPR001",
};

t("тежестите сумират 100", () => {
  assert.equal(Object.values(QUALITY_WEIGHTS).reduce((a, b) => a + b, 0), 100);
});
t("пълен запис получава 100", () => {
  assert.equal(computeCompleteness(FULL).score, 100);
});
t("празен запис получава 0 и изброява липсващото", () => {
  const r = computeCompleteness({});
  assert.equal(r.score, 0);
  assert.ok(r.missing.includes("title"));
  assert.ok(r.missing.includes("primary_document"));
  assert.ok(r.missing.includes("budget_amount_eur"));
});
t("липсата на основен документ отнема точно теглото му", () => {
  const r = computeCompleteness({ ...FULL, hasPrimaryDocument: false, documentCount: 0 });
  assert.equal(r.score, 100 - QUALITY_WEIGHTS.primaryDocument);
});
t("постоянен прием е валиден без краен срок", () => {
  const rolling = computeCompleteness({ ...FULL, deadline_date: null, intake_type: "rolling" });
  const missing = computeCompleteness({ ...FULL, deadline_date: null });
  assert.ok(rolling.score > missing.score);
});
t("процедура без документ НЕ може да е complete", () => {
  assert.equal(qualityStatus(95, { hasPrimaryDocument: false }), "good");
  assert.equal(qualityStatus(95, { hasPrimaryDocument: true }), "complete");
});
t("доказано липсващи документи в портала допускат complete", () => {
  const s = qualityStatus(90, {
    hasPrimaryDocument: false, documentsPublishedBySource: 0,
    documentsAbsenceEvidenceUrl: "https://x.gov.bg/no-docs",
  });
  assert.equal(s, "complete");
});
t("праговете complete/good/partial/incomplete са 85/70/40", () => {
  assert.equal(qualityStatus(85, { hasPrimaryDocument: true }), "complete");
  assert.equal(qualityStatus(84, {}), "good");
  assert.equal(qualityStatus(70, {}), "good");
  assert.equal(qualityStatus(69, {}), "partial");
  assert.equal(qualityStatus(40, {}), "partial");
  assert.equal(qualityStatus(39, {}), "incomplete");
});
t("открита аномалия праща процедурата в pending_review", () => {
  assert.equal(qualityStatus(99, { hasPrimaryDocument: true, openAnomalies: 1 }), "pending_review");
});
t("assessProcedure връща и score, и статус", () => {
  const a = assessProcedure(FULL);
  assert.equal(a.completeness_score, 100);
  assert.equal(a.quality_status, "complete");
});
t("averageScore е null при празен вход, не 0", () => {
  assert.equal(averageScore([]), null);
  assert.equal(averageScore([{ completeness_score: 80 }, { completeness_score: 90 }]), 85);
});
t("qualityDistribution брои и unknown", () => {
  const d = qualityDistribution([{ quality_status: "good" }, { quality_status: "good" }, {}]);
  assert.equal(d.good, 2);
  assert.equal(d.unknown, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Бюджети и аномалии
// ─────────────────────────────────────────────────────────────────────────────
t("при конфликт печели документът и се записва аномалия", () => {
  const r = reconcileBudget({
    page: { amount: 1_000_000, currency: "EUR", url: "p", date: "2026-01-01" },
    document: { amount: 1_500_000, currency: "EUR", url: "d", date: "2026-06-01" },
  });
  assert.equal(r.value, 1_500_000);
  assert.equal(r.source_type, "document");
  assert.equal(r.anomalies.length, 1);
  assert.equal(r.anomalies[0].anomaly_type, "budget_conflict");
  assert.equal(r.anomalies[0].page_value, "1000000");
  assert.equal(r.anomalies[0].document_value, "1500000");
});
t("стойностите НИКОГА не се сумират", () => {
  const r = reconcileBudget({ page: { amount: 100 }, document: { amount: 200 } });
  assert.notEqual(r.value, 300);
  assert.ok(r.value === 100 || r.value === 200);
});
t("еднакви стойности не пораждат аномалия", () => {
  const r = reconcileBudget({ page: { amount: 1000, url: "p" }, document: { amount: 1000, url: "d" } });
  assert.equal(r.anomalies.length, 0);
});
t("нулев бюджет се маркира", () => {
  const a = detectBudgetAnomalies({ budget_amount_eur: 0, budget_scope: "procedure" });
  assert.ok(a.some((x) => x.anomaly_type === "zero_budget"));
});
t("необичайно голяма стойност е критична аномалия", () => {
  const a = detectBudgetAnomalies({ budget_amount_eur: 99_000_000_000, budget_scope: "procedure" });
  assert.ok(a.some((x) => x.anomaly_type === "budget_out_of_range" && x.severity === "critical"));
});
t("бюджет на проект, записан като общ, е критична аномалия", () => {
  const a = detectBudgetAnomalies({ budget_amount_eur: 500_000, budget_scope: "per_project" });
  assert.ok(a.some((x) => x.anomaly_type === "project_budget_as_total" && x.severity === "critical"));
});
t("общ бюджет, равен на максималната помощ, се маркира", () => {
  const a = detectBudgetAnomalies({ budget_amount_eur: 300_000, max_grant_eur: 300_000, budget_scope: "procedure" });
  assert.ok(a.some((x) => x.anomaly_type === "project_budget_as_total"));
});
t("липсващ обхват на бюджета се маркира като scope_unknown", () => {
  const a = detectBudgetAnomalies({ budget_amount_eur: 1_000_000 });
  assert.ok(a.some((x) => x.anomaly_type === "scope_unknown"));
});
t("min > max е невалидно съотношение", () => {
  const a = detectBudgetAnomalies({ min_grant_eur: 500_000, max_grant_eur: 100_000 });
  assert.ok(a.some((x) => x.anomaly_type === "invalid_min_max" && x.field_name === "grant"));
});
t("процент на финансиране извън 0..1 се маркира", () => {
  const a = detectBudgetAnomalies({ max_financing_rate: 85 });
  assert.ok(a.some((x) => x.anomaly_type === "invalid_min_max" && x.field_name === "max_financing_rate"));
});
t("валута, различна от националната и от EUR, се маркира", () => {
  const a = detectBudgetAnomalies({ budget_amount_eur: 1000, budget_currency: "USD", country_currency: "PLN", budget_scope: "procedure" });
  assert.ok(a.some((x) => x.anomaly_type === "currency_mismatch"));
  const b = detectBudgetAnomalies({ budget_amount_eur: 1000, budget_currency: "PLN", country_currency: "PLN", budget_scope: "procedure" });
  assert.ok(!b.some((x) => x.anomaly_type === "currency_mismatch"));
});
t("еднакви НЕкръгли бюджети в различни държави се маркират", () => {
  const a = detectCrossCountryDuplicateBudgets([
    { project_id: "p1", country_code: "BG", budget_amount_eur: 4_368_215.44 },
    { project_id: "p2", country_code: "RO", budget_amount_eur: 4_368_215.44 },
    { project_id: "p3", country_code: "BG", budget_amount_eur: 7_123_456.78 },
  ]);
  assert.equal(a.length, 2);
  assert.ok(a.every((x) => x.anomaly_type === "duplicate_budget"));
});
t("еднакви бюджети в ЕДНА държава не са аномалия", () => {
  const a = detectCrossCountryDuplicateBudgets([
    { project_id: "p1", country_code: "BG", budget_amount_eur: 4_368_215.44 },
    { project_id: "p2", country_code: "BG", budget_amount_eur: 4_368_215.44 },
  ]);
  assert.equal(a.length, 0);
});
t("кръгли суми НЕ се маркират — повтарят се естествено между държави", () => {
  // Мерено срещу продукцията: 200 000 EUR се среща в 5 държави като типичен
  // максимален размер на помощта. Праг 1 000 EUR даваше 57 фалшиви групи.
  const round = detectCrossCountryDuplicateBudgets([
    { project_id: "p1", country_code: "BG", budget_amount_eur: 5_000_000 },
    { project_id: "p2", country_code: "RO", budget_amount_eur: 5_000_000 },
  ]);
  assert.equal(round.length, 0);
  assert.equal(isRoundAmount(5_000_000), true);
  assert.equal(isRoundAmount(4_368_215.44), false);
});
t("сумите под 1 млн EUR не влизат в проверката за дубликати", () => {
  const small = detectCrossCountryDuplicateBudgets([
    { project_id: "p1", country_code: "BG", budget_amount_eur: 234_567.89 },
    { project_id: "p2", country_code: "RO", budget_amount_eur: 234_567.89 },
  ]);
  assert.equal(small.length, 0);
});
t("несъгласувани дати се откриват", () => {
  const a = detectDateAnomalies({ opening_date: "2026-05-01", deadline_date: "2026-04-01" });
  assert.ok(a.some((x) => x.anomaly_type === "date_inconsistency"));
});
t("requiresReview реагира на критични и на конфликт", () => {
  assert.equal(requiresReview([{ severity: "critical" }]), true);
  assert.equal(requiresReview([{ severity: "warning", anomaly_type: "budget_conflict" }]), true);
  assert.equal(requiresReview([{ severity: "warning", anomaly_type: "zero_budget" }]), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Документи
// ─────────────────────────────────────────────────────────────────────────────
t("tracking параметрите не правят нов документ", () => {
  const a = normalizeUrl("https://www.eufunds.bg/doc.pdf?utm_source=nl&utm_campaign=x");
  const b = normalizeUrl("http://eufunds.bg/doc.pdf");
  assert.equal(a, b);
});
t("fragment и завършващ / не влияят", () => {
  assert.equal(normalizeUrl("https://x.bg/a/b/#top"), normalizeUrl("https://x.bg/a/b"));
});
t("значещите query параметри се пазят и подреждат", () => {
  assert.equal(normalizeUrl("https://x.bg/d?b=2&a=1"), normalizeUrl("https://x.bg/d?a=1&b=2"));
  assert.notEqual(normalizeUrl("https://x.bg/d?id=1"), normalizeUrl("https://x.bg/d?id=2"));
});
t("normalizeUrl не хвърля при боклук", () => {
  assert.equal(normalizeUrl(""), null);
  assert.equal(normalizeUrl(null), null);
  assert.equal(typeof normalizeUrl("not a url"), "string");
});
t("класификация на документите по заглавие", () => {
  assert.equal(classifyDocument({ title: "Насоки за кандидатстване" }), "guidelines");
  assert.equal(classifyDocument({ title: "Условия за кандидатстване" }), "conditions_apply");
  assert.equal(classifyDocument({ title: "Условия за изпълнение" }), "conditions_exec");
  assert.equal(classifyDocument({ title: "Въпроси и отговори" }), "faq");
  assert.equal(classifyDocument({ title: "Corrigendum No 1" }), "corrigendum");
  assert.equal(classifyDocument({ title: "Критерии за оценка" }), "evaluation_criteria");
  assert.equal(classifyDocument({ title: "Формуляр за кандидатстване" }), "application_form");
  assert.equal(classifyDocument({ title: "Ghidul solicitantului" }), "guidelines");
  assert.equal(classifyDocument({ title: "Нещо неясно" }), "other");
});
t("основни са само насоки/условия/покана/решение", () => {
  assert.ok(isPrimaryCategory("guidelines"));
  assert.ok(isPrimaryCategory("conditions_apply"));
  assert.ok(!isPrimaryCategory("faq"));
  assert.ok(!isPrimaryCategory("annex"));
});
t("MIME по разширение", () => {
  assert.equal(guessMimeType("https://x.bg/a.pdf"), "application/pdf");
  assert.equal(guessMimeType("https://x.bg/a.docx?v=1"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(guessMimeType("https://x.bg/a"), null);
});
t("дедупликация по нормализиран URL", () => {
  const { documents, duplicates } = dedupeDocuments([
    { source_url: "https://x.bg/a.pdf?utm_source=1", title: "A" },
    { source_url: "https://www.x.bg/a.pdf", title: "A копие" },
    { source_url: "https://x.bg/b.pdf", title: "B" },
  ]);
  assert.equal(documents.length, 2);
  assert.equal(duplicates.length, 1);
  assert.equal(documents[0].alternateUrls.length, 1);
});
t("нов checksum → нова версия, същият → без промяна", () => {
  assert.equal(classifyIncomingDocument(null, { checksum: "a" }).action, "insert");
  assert.equal(classifyIncomingDocument({ checksum: "a" }, { checksum: "a" }).action, "unchanged");
  assert.equal(classifyIncomingDocument({ checksum: "a" }, { checksum: "b" }).action, "version");
  assert.equal(classifyIncomingDocument({ checksum: "a" }, {}).action, "unchanged");
});
t("нечетим PDF НЕ е успешно обработен", () => {
  const r = extractionOutcome({ textLength: 0 });
  assert.equal(r.extraction_status, "failed");
  assert.ok(/OCR/.test(r.extraction_error));
  const ocr = extractionOutcome({ textLength: 5000, usedOcr: true });
  assert.equal(ocr.extraction_status, "complete");
  assert.equal(ocr.extraction_method, "ocr");
});
t("основният документ се избира по ранг и пропуска нечетимите", () => {
  const best = pickPrimaryDocument([
    { doc_category: "faq" },
    { doc_category: "conditions_apply" },
    { doc_category: "guidelines", extraction_status: "failed" },
  ]);
  assert.equal(best.doc_category, "conditions_apply");
  assert.equal(pickPrimaryDocument([{ doc_category: "faq" }]), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. История на промените
// ─────────────────────────────────────────────────────────────────────────────
t("промяна на срок е critical deadline_change", () => {
  const d = diffProcedure({ deadline_date: "2026-09-01" }, { deadline_date: "2026-10-01" }, { projectId: "p1" });
  assert.equal(d.length, 1);
  assert.equal(d[0].change_type, "deadline_change");
  assert.equal(d[0].significance, "critical");
  assert.equal(d[0].old_value, "2026-09-01");
  assert.equal(d[0].new_value, "2026-10-01");
});
t("първоначално попълване на празно поле е обогатяване, не промяна", () => {
  const d = diffProcedure({ eu_fund: null }, { eu_fund: "ERDF" }, { projectId: "p1" });
  assert.equal(d[0].change_type, "correction");
  assert.equal(d[0].significance, "minor");
});
t("числово еквивалентни стойности не са промяна", () => {
  assert.equal(valuesEqual(1000, "1000.0"), true);
  assert.equal(diffProcedure({ budget_amount_eur: 1000 }, { budget_amount_eur: 1000.0 }).length, 0);
});
t("JSON списък без промяна на реда не е промяна", () => {
  assert.equal(valuesEqual('["a","b"]', '["b","a"]', "applicant_types_json"), true);
  assert.equal(diffProcedure({ applicant_types_json: '["a","b"]' }, { applicant_types_json: '["b","a"]' }).length, 0);
});
t("неизвлечено поле не се брои за промяна", () => {
  assert.equal(diffProcedure({ status: "open" }, {}).length, 0);
});
t("всички проследявани полета имат тип и важност", () => {
  for (const [f, m] of Object.entries(TRACKED_FIELDS)) {
    assert.ok(m.change_type, `${f} няма change_type`);
    assert.ok(["critical", "major", "minor"].includes(m.significance), `${f} има невалидна important`);
  }
});
t("добавен документ и нова версия се записват в историята", () => {
  const a = documentAddedChange({ projectId: "p", documentId: 1, title: "Насоки", category: "guidelines" });
  assert.equal(a.change_type, "document_added");
  const b = documentAddedChange({ projectId: "p", documentId: 2, title: "Изменение", category: "amendment", isAmendment: true });
  assert.equal(b.change_type, "amendment");
  assert.equal(b.significance, "critical");
  const v = documentVersionChange({ projectId: "p", documentId: 1, title: "Насоки", versionLabel: "2026-08-01" });
  assert.equal(v.change_type, "amendment");
});
t("обобщението брои по тип и критичните", () => {
  const s = summarizeChanges([
    { change_type: "deadline_change", significance: "critical" },
    { change_type: "budget_change", significance: "major" },
    { change_type: "deadline_change", significance: "minor" },
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.critical, 1);
  assert.equal(s.byType.deadline_change, 2);
  assert.equal(importantChanges(s ? [{ change_type: "other", significance: "minor" }] : []).length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Отчет за изпълнението
// ─────────────────────────────────────────────────────────────────────────────
t("emptyRunMetrics има всички броячи на 0", () => {
  const m = emptyRunMetrics();
  for (const k of RUN_COUNTERS) assert.equal(m[k], 0, k);
  assert.equal(m.average_quality_score, null);
});
t("mergeRunMetrics сумира броячите и слива списъците", () => {
  const a = emptyRunMetrics();
  mergeRunMetrics(a, { procedures_created: 3, countries: [{ code: "BG" }] });
  mergeRunMetrics(a, { procedures_created: 2, countries: [{ code: "RO" }] });
  assert.equal(a.procedures_created, 5);
  assert.deepEqual(a.countries.map((c) => c.code), ["BG", "RO"]);
});
t("coverageDelta е null при липсваща база", () => {
  assert.equal(coverageDelta(null, 50), null);
  assert.equal(coverageDelta(40, 55), 15);
});
t("weightedAverageQuality тежи по брой процедури", () => {
  const v = weightedAverageQuality([
    { average_quality_score: 90, procedures: 10 },
    { average_quality_score: 50, procedures: 30 },
  ]);
  assert.equal(v, 60);
  assert.equal(weightedAverageQuality([]), null);
});
t("coverageFromRow връща null при 0 процедури", () => {
  assert.equal(coverageFromRow({ total: 0 }).documentCoverage, null);
  const c = coverageFromRow({ total: 200, with_documents: 100, with_budget: 50, with_primary_document: 20, avg_quality: 71.5 });
  assert.equal(c.documentCoverage, 50);
  assert.equal(c.budgetCoverage, 25);
  assert.equal(c.primaryDocumentCoverage, 10);
  assert.equal(c.averageQuality, 71.5);
});
t("safe_summary съдържа държави, източници, покритие и следваща стъпка", () => {
  const m = emptyRunMetrics();
  m.countries = [{ code: "BG" }, { code: "RO" }];
  m.countries_touched = 2; m.countries_fully_processed = 1;
  m.sources_checked = 7; m.new_sources_discovered = 2; m.source_failures = 1;
  m.procedures_created = 5; m.procedures_updated = 3; m.procedures_revisited = 9;
  m.documents_discovered = 20; m.documents_downloaded = 14; m.document_versions_added = 2;
  m.budgets_extracted = 6; m.budgets_converted = 2;
  m.document_coverage_before = 40; m.document_coverage_after = 47.5;
  m.budget_coverage_before = 30; m.budget_coverage_after = 33;
  m.average_quality_score = 68.4; m.anomalies_detected = 3;
  m.blockedSources = [{ country: "PL", id: "pl-main" }];
  m.next_country = "GR"; m.next_source = "gr-espa";
  const s = buildSafeSummary(m);
  assert.ok(s.includes("BG, RO"));
  assert.ok(s.includes("7 проверени"));
  assert.ok(s.includes("+5 нови"));
  assert.ok(s.includes("14 свалени"));
  assert.ok(s.includes("47.5%"));
  assert.ok(s.includes("+7.5 п.п."));
  assert.ok(s.includes("68.4/100"));
  assert.ok(s.includes("PL:pl-main"));
  assert.ok(s.includes("GR"));
  assert.ok(s.length <= 1000);
});
t("safe_summary се съкращава до лимита", () => {
  const m = emptyRunMetrics();
  m.countries = Array.from({ length: 200 }, (_, i) => ({ code: `C${i}` }));
  assert.ok(buildSafeSummary(m).length <= 1000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. SQL шаблони и агрегати
// ─────────────────────────────────────────────────────────────────────────────
t("новите SQL шаблони съществуват и са параметризирани", () => {
  for (const k of [
    "loadAllSources", "backlogWithoutDocuments", "backlogWithoutBudget", "backlogWithoutDetails",
    "criticalClosingSoon", "loadPaginationCursor", "savePaginationCursor", "insertSourceHealth",
    "updateSourceMetrics", "upsertSourceCandidate", "insertAnomaly", "upsertProjectDetails",
    "upsertBudgetTerms", "upsertBudgetComponent", "upsertEligibility", "findDocumentByUrl",
    "insertDocumentVersion",
  ]) {
    assert.ok(typeof SQL[k] === "string" && SQL[k].length > 20, `липсва SQL.${k}`);
    assert.ok(!/'(BG|RO|PL|DE)'/.test(SQL[k]), `SQL.${k} съдържа hardcoded държава`);
  }
});
t("времената в SQL идват от D1, не от JS", () => {
  for (const k of ["savePaginationCursor", "insertSourceHealth", "insertAnomaly", "upsertProjectDetails"]) {
    assert.ok(/datetime\('now'\)/.test(SQL[k]), `SQL.${k} не ползва datetime('now')`);
  }
});
t("aggregateEurope сумира новите показатели", () => {
  const s = aggregateEurope([
    { total_procedures: 100, procedures_with_documents: 80, procedures_with_primary_document: 40, budget_procedure_count: 50, published_budget_eur: 1000, average_quality_score: 70, quality_complete: 10, sources_total: 4, sources_blocked: 1, sources_verified: 4, anomalies_open: 2, earliest_procedure_seen_at: "2026-02-01" },
    { total_procedures: 100, procedures_with_documents: 20, procedures_with_primary_document: 10, budget_procedure_count: 10, published_budget_eur: 500, average_quality_score: 50, quality_complete: 2, sources_total: 2, sources_blocked: 0, sources_verified: 1, anomalies_open: 1, earliest_procedure_seen_at: "2026-01-01" },
  ]);
  assert.equal(s.totalProcedures, 200);
  assert.equal(s.documentCoveragePercent, 50);
  assert.equal(s.primaryDocumentCoveragePercent, 25);
  assert.equal(s.averageQualityScore, 60);
  assert.equal(s.quality.complete, 12);
  assert.equal(s.sourcesTotal, 6);
  assert.equal(s.sourcesBlocked, 1);
  assert.equal(s.openAnomalies, 3);
  assert.equal(s.earliestProcedureSeenAt, "2026-01-01");
  assert.equal(s.countriesWithVerifiedSources, 2);
});
t("aggregateEurope остава съвместимо с празен вход", () => {
  const s = aggregateEurope([]);
  assert.equal(s.totalProcedures, 0);
  assert.equal(s.documentCoveragePercent, null);
  assert.equal(s.averageQualityScore, null);
});
t("topCountriesBy пропуска нулите и подрежда низходящо", () => {
  const top = topCountriesBy([
    { country_code: "A", total_procedures: 5 },
    { country_code: "B", total_procedures: 0 },
    { country_code: "C", total_procedures: 9 },
  ], "total_procedures", 5);
  assert.deepEqual(top.map((t2) => t2.country_code), ["C", "A"]);
});
t("historicalDepth подрежда по най-ранна дата", () => {
  const d = historicalDepth([
    { country_code: "A", earliest_procedure_seen_at: "2026-05-01T00:00:00Z" },
    { country_code: "B", earliest_procedure_seen_at: "2026-01-01T00:00:00Z" },
    { country_code: "C" },
  ]);
  assert.deepEqual(d.map((x) => x.code), ["B", "A"]);
  assert.equal(d[0].since, "2026-01-01");
});

console.log(`\n${passed} проверки минаха.`);
