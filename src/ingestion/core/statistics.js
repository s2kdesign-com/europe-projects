// Чисти (без I/O) функции за дневната статистика: агрегиране на бюджети,
// anomaly проверки и Europe totals. Използват се от Worker-а и от тестовете.
//
// БЮДЖЕТИ — правила (виж /about дисклеймъра):
//   • сумират се САМО валидни структурирани EUR стойности (published_budget_eur);
//   • не се сумират дубликати (по country+source+procedure идентичност);
//   • неизвестна/невалидна стойност се ИЗКЛЮЧВА (не се измисля);
//   • пази се броят на включените процедури (budget_procedure_count);
//   • без client-side валутна конверсия.

/** Агрегира валидни EUR бюджети от редове {budget_eur, dedup_key}. */
export function aggregateBudgets(rows) {
  const seen = new Set();
  let sum = 0, count = 0;
  for (const r of rows || []) {
    const v = r && r.budget_eur;
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue; // невалидни/липсващи → изключени
    const key = r.dedup_key || null;
    if (key) {
      if (seen.has(key)) continue; // дубликат от няколко източника
      seen.add(key);
    }
    sum += v;
    count++;
  }
  return { totalEur: count > 0 ? sum : null, includedCount: count };
}

/** Europe totals от country snapshot редове. */
export function aggregateEurope(countryRows) {
  const out = {
    countries: 0, countriesWithActiveSources: 0, totalProcedures: 0, activeProcedures: 0,
    proceduresWithDocuments: 0, publishedBudgetEur: null, budgetProcedureCount: 0,
    activeSources: 0, newLast30Days: 0, updatedLast30Days: 0,
    // v2.52.0 — дълбоко извличане
    upcomingProcedures: 0, closedProcedures: 0,
    proceduresWithPrimaryDocument: 0, proceduresWithStructuredBudget: 0,
    documentsTotal: 0, openAnomalies: 0,
    sourcesTotal: 0, sourcesHealthy: 0, sourcesFailing: 0, sourcesBlocked: 0, sourcesVerified: 0,
    countriesWithVerifiedSources: 0,
    quality: { complete: 0, good: 0, partial: 0, incomplete: 0, pending_review: 0 },
    averageQualityScore: null,
    earliestProcedureSeenAt: null,
  };
  let budgetSum = 0, hasBudget = false;
  let qSum = 0, qWeight = 0;
  for (const c of countryRows || []) {
    out.countries++;
    if ((c.active_sources || 0) > 0) out.countriesWithActiveSources++;
    if ((c.sources_verified || 0) > 0) out.countriesWithVerifiedSources++;
    out.totalProcedures += c.total_procedures || 0;
    out.activeProcedures += c.active_procedures || 0;
    out.upcomingProcedures += c.upcoming_procedures || 0;
    out.closedProcedures += c.closed_procedures || 0;
    out.proceduresWithDocuments += c.procedures_with_documents || 0;
    out.activeSources += c.active_sources || 0;
    out.newLast30Days += c.new_last_30_days || 0;
    out.updatedLast30Days += c.updated_last_30_days || 0;
    out.budgetProcedureCount += c.budget_procedure_count || 0;
    out.proceduresWithPrimaryDocument += c.procedures_with_primary_document || 0;
    out.proceduresWithStructuredBudget += c.procedures_with_structured_budget || 0;
    out.documentsTotal += c.documents_total || 0;
    out.openAnomalies += c.anomalies_open || 0;
    out.sourcesTotal += c.sources_total || 0;
    out.sourcesHealthy += c.successful_sources || 0;
    out.sourcesFailing += c.failed_sources || 0;
    out.sourcesBlocked += c.sources_blocked || 0;
    out.sourcesVerified += c.sources_verified || 0;
    for (const k of Object.keys(out.quality)) out.quality[k] += c[`quality_${k}`] || 0;
    if (typeof c.published_budget_eur === "number" && Number.isFinite(c.published_budget_eur)) {
      budgetSum += c.published_budget_eur; hasBudget = true;
    }
    if (Number.isFinite(Number(c.average_quality_score)) && (c.total_procedures || 0) > 0) {
      qSum += Number(c.average_quality_score) * c.total_procedures;
      qWeight += c.total_procedures;
    }
    if (c.earliest_procedure_seen_at && (!out.earliestProcedureSeenAt || c.earliest_procedure_seen_at < out.earliestProcedureSeenAt)) {
      out.earliestProcedureSeenAt = c.earliest_procedure_seen_at;
    }
  }
  if (hasBudget) out.publishedBudgetEur = budgetSum;
  if (qWeight > 0) out.averageQualityScore = round1(qSum / qWeight);
  // Бюджетно покритие: колко от процедурите имат ВАЛИДИРАН структуриран бюджет.
  // „Известен публикуван бюджет" НЕ е бюджетът на всички процедури.
  out.budget = budgetBreakdown(out.totalProcedures, out.budgetProcedureCount, out.publishedBudgetEur);
  out.documentCoveragePercent = out.totalProcedures > 0 ? round1(out.proceduresWithDocuments / out.totalProcedures * 100) : null;
  out.primaryDocumentCoveragePercent = out.totalProcedures > 0 ? round1(out.proceduresWithPrimaryDocument / out.totalProcedures * 100) : null;
  return out;
}

/**
 * Водещи държави по даден показател — за /about класациите.
 * Връща само държави с реални данни (0 и null не влизат в класация).
 */
export function topCountriesBy(rows, key, limit = 5) {
  return (rows || [])
    .filter((r) => Number.isFinite(Number(r && r[key])) && Number(r[key]) > 0)
    .sort((a, b) => Number(b[key]) - Number(a[key]))
    .slice(0, limit);
}

/** Историческа дълбочина по държави (най-ранна видяна процедура). */
export function historicalDepth(rows) {
  return (rows || [])
    .filter((r) => r && r.earliest_procedure_seen_at)
    .map((r) => ({ code: r.country_code, since: String(r.earliest_procedure_seen_at).slice(0, 10) }))
    .sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0));
}

function round1(n) { return Math.round(n * 10) / 10; }

// Обобщение на бюджетното покритие (за публичния „Известен публикуван бюджет").
// Честен бюджетен статус за държава от snapshot реда (без подвеждащо „—").
//   validated          → има валидиран EUR бюджет
//   foreign_currency   → бюджетите са в национална валута (не се конвертира)
//   no_budget_text     → официалният източник не публикува общ бюджет
//   requires_review    → има текст, но стойността е неясна
//   awaiting_analysis   → има процедури, но липсва информация
export function countryBudgetStatus(r) {
  const validated = r.budget_procedure_count || 0;
  const text = r.budget_text_procedures;
  const foreign = r.foreign_currency_procedures;
  const total = r.total_procedures || 0;
  if (validated > 0) return "validated";
  if (total === 0) return "awaiting_analysis";
  if (foreign != null && foreign > 0) return "foreign_currency";
  if (text != null && text === 0) return "no_budget_text";
  if (text != null && text > 0) return "requires_review";
  return "awaiting_analysis";
}

export function budgetBreakdown(totalProcedures, validatedBudgetProcedures, knownPublishedBudgetEur) {
  const total = totalProcedures || 0;
  const validated = validatedBudgetProcedures || 0;
  return {
    knownPublishedBudgetEur: knownPublishedBudgetEur ?? null,
    totalProcedures: total,
    validatedBudgetProcedures: validated,
    budgetCoveragePercent: total > 0 ? round1(validated / total * 100) : null,
    withoutValidatedBudget: Math.max(0, total - validated),
  };
}

// Anomaly проверки — при аномалия snapshot-ът НЕ се публикува автоматично
// (остава последният успешен; новият се маркира за review).
export function checkSnapshotAnomalies(next, prev, { dropThreshold = 0.5 } = {}) {
  const flags = [];
  if (!next) return { ok: false, flags: ["missing_snapshot"] };
  if ((next.active_procedures || 0) > (next.total_procedures || 0)) flags.push("active_gt_total");
  if (next.published_budget_eur != null && next.published_budget_eur < 0) flags.push("negative_budget");
  if (prev) {
    const pt = prev.total_procedures || 0, nt = next.total_procedures || 0;
    if (pt > 10 && nt === 0) flags.push("sudden_zero");
    else if (pt > 10 && nt < pt * (1 - dropThreshold)) flags.push("unusual_drop");
    const pb = prev.published_budget_eur, nb = next.published_budget_eur;
    if (pb != null && nb != null && pb > 0 && Math.abs(nb - pb) / pb > 3) flags.push("sudden_budget_change");
  }
  if ((next.total_procedures || 0) > 0 && (next.active_sources || 0) === 0 && (prev ? (prev.active_sources || 0) > 0 : false)) flags.push("missing_source_coverage");
  return { ok: flags.length === 0, flags };
}

/** Избор на snapshot за публикуване: последният с publish_status='published'. */
export function pickPublishedSnapshotDate(rows) {
  const dates = [...new Set((rows || []).filter((r) => r.publish_status === "published").map((r) => r.snapshot_date))];
  dates.sort();
  return dates.length ? dates[dates.length - 1] : null;
}
