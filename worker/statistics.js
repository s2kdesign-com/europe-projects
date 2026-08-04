// Публична платформена статистика (за /about): чете последния УСПЕШЕН дневен
// snapshot от country_daily_statistics — без тежки агрегации при page load.
// Само публични безопасни полета; ETag + cache + stale-while-revalidate.

import { aggregateEurope, countryBudgetStatus } from "../src/ingestion/core/statistics.js";

export async function handlePlatformStatistics(request, env) {
  try {
    // Последният публикуван snapshot (partial/pending_review не заменя успешния).
    const last = await env.DB.prepare(
      "SELECT MAX(snapshot_date) AS d FROM country_daily_statistics WHERE publish_status='published'"
    ).first();
    const date = last && last.d;
    if (!date) {
      return json({ ok: true, generatedAt: null, summary: null, countries: [] }, 200, "no-snapshot");
    }
    const { results } = await env.DB.prepare(
      `SELECT s.*, c.slug, c.name_bg, c.native_name, c.english_name, c.flag_asset, c.enabled AS country_enabled, c.ingestion_status
       FROM country_daily_statistics s JOIN countries c ON c.code = s.country_code
       WHERE s.snapshot_date = ?1 AND s.publish_status='published' ORDER BY c.priority`
    ).bind(date).all();
    const rows = results || [];
    const summary = aggregateEurope(rows);
    const lastRun = await env.DB.prepare("SELECT completed_at FROM scheduled_sync_runs WHERE status IN ('completed','success') ORDER BY id DESC LIMIT 1").first();

    // Само публични полета per държава.
    const countries = rows.map((r) => ({
      code: r.country_code,
      slug: r.slug,
      nameBg: r.name_bg,
      nativeName: r.native_name,
      englishName: r.english_name,
      flag: r.flag_asset,
      enabled: !!r.country_enabled,
      coverageStatus: r.coverage_status || "none",
      ingestionStatus: r.ingestion_status || "not_started",
      totalProcedures: r.total_procedures,
      activeProcedures: r.active_procedures,
      upcomingProcedures: r.upcoming_procedures,
      closedProcedures: r.closed_procedures,
      proceduresWithDocuments: r.procedures_with_documents,
      newLast30Days: r.new_last_30_days,
      updatedLast30Days: r.updated_last_30_days,
      publishedBudgetEur: r.published_budget_eur,
      budgetProcedureCount: r.budget_procedure_count,
      // Бюджетно покритие за държавата + честен статус (без подвеждащо „—").
      budgetCoveragePercent: r.total_procedures > 0 ? Math.round(((r.budget_procedure_count || 0) / r.total_procedures) * 1000) / 10 : null,
      budgetStatus: countryBudgetStatus(r),
      activeSources: r.active_sources,
      lastSuccessfulSyncAt: r.last_successful_sync_at,
      // ── v2.52.0: дълбоко извличане ──────────────────────────────────────
      documentCoveragePercent: r.total_procedures > 0
        ? Math.round(((r.procedures_with_documents || 0) / r.total_procedures) * 1000) / 10 : null,
      proceduresWithPrimaryDocument: r.procedures_with_primary_document,
      primaryDocumentCoveragePercent: r.total_procedures > 0 && r.procedures_with_primary_document != null
        ? Math.round((r.procedures_with_primary_document / r.total_procedures) * 1000) / 10 : null,
      proceduresWithStructuredBudget: r.procedures_with_structured_budget,
      documentsTotal: r.documents_total,
      averageQualityScore: r.average_quality_score,
      quality: {
        complete: r.quality_complete || 0,
        good: r.quality_good || 0,
        partial: r.quality_partial || 0,
        incomplete: r.quality_incomplete || 0,
        pending_review: r.quality_pending_review || 0,
      },
      sourcesTotal: r.sources_total,
      sourcesHealthy: r.successful_sources,
      sourcesFailing: r.failed_sources,
      sourcesBlocked: r.sources_blocked,
      sourcesVerified: r.sources_verified,
      openAnomalies: r.anomalies_open,
      earliestProcedureSeenAt: r.earliest_procedure_seen_at,
    }));

    const body = {
      ok: true,
      generatedAt: date,
      lastSuccessfulDailyReviewAt: (lastRun && lastRun.completed_at) || null,
      summary,
      countries,
    };
    return json(body, 200, date);
  } catch {
    return json({ ok: false, error: "stats_unavailable" }, 503, null);
  }
}

function json(body, status, etagSeed) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300, stale-while-revalidate=3600",
  };
  if (etagSeed) headers.etag = `"stats-${etagSeed}"`;
  return new Response(JSON.stringify(body), { status, headers });
}

// Агрегира и записва днешния snapshot (вика се от дневната процедура/при нужда).
// Атомарно: INSERT OR REPLACE per държава; при аномалия — pending_review.
//
// „Известен публикуван бюджет" (published_budget_eur) включва САМО процедури с:
//   • налична стойност в budget_amount_eur;
//   • обхват, който НЕ е програма/приоритет/на един проект/допустими разходи
//     (липсващият обхват се приема за процедурен, за да не изчезнат старите редове);
//   • без открита КРИТИЧНА аномалия със статус „open".
export const SNAPSHOT_SQL = `INSERT OR REPLACE INTO country_daily_statistics (id, snapshot_date, country_code, total_procedures, active_procedures, upcoming_procedures, closed_procedures, procedures_with_documents, new_last_30_days, updated_last_30_days, published_budget_eur, budget_procedure_count, budget_text_procedures, foreign_currency_procedures, active_sources, successful_sources, failed_sources, last_successful_sync_at, coverage_status, publish_status, created_at, updated_at, procedures_with_primary_document, procedures_with_structured_budget, average_quality_score, quality_complete, quality_good, quality_partial, quality_incomplete, quality_pending_review, sources_total, sources_blocked, sources_verified, anomalies_open, documents_total, earliest_procedure_seen_at)
SELECT c.code || ':' || date('now'), date('now'), c.code,
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.status IN ('open','closing_soon')),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.status='upcoming'),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.status='closed'),
 (SELECT COUNT(DISTINCT d.project_id) FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.country_code=c.code),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.first_seen >= date('now','-30 day')),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.last_updated >= date('now','-30 day') AND p.last_updated != p.first_seen),
 (SELECT SUM(p.budget_amount_eur) FROM projects p
    LEFT JOIN project_budget_terms bt ON bt.project_id = p.id
   WHERE p.country_code=c.code AND p.budget_amount_eur IS NOT NULL
     AND (bt.budget_scope IS NULL OR bt.budget_scope='procedure')
     AND NOT EXISTS (SELECT 1 FROM project_anomalies a WHERE a.project_id=p.id AND a.status='open' AND a.severity='critical')),
 (SELECT COUNT(*) FROM projects p
    LEFT JOIN project_budget_terms bt ON bt.project_id = p.id
   WHERE p.country_code=c.code AND p.budget_amount_eur IS NOT NULL
     AND (bt.budget_scope IS NULL OR bt.budget_scope='procedure')
     AND NOT EXISTS (SELECT 1 FROM project_anomalies a WHERE a.project_id=p.id AND a.status='open' AND a.severity='critical')),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.budget IS NOT NULL AND p.budget != ''),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.budget_currency IS NOT NULL AND p.budget_currency != 'EUR'),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.enabled=1),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.source_health='healthy'),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.source_health='failing'),
 c.last_successful_sync_at, c.coverage_status, 'published', datetime('now'), datetime('now'),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.has_primary_document=1),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.budget_amount_eur IS NOT NULL),
 (SELECT ROUND(AVG(pd.completeness_score),1) FROM project_details pd WHERE pd.country_code=c.code AND pd.completeness_score IS NOT NULL),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.quality_status='complete'),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.quality_status='good'),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.quality_status='partial'),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.quality_status='incomplete'),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.quality_status='pending_review'),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.source_health='blocked'),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.verified=1),
 (SELECT COUNT(*) FROM project_anomalies a WHERE a.country_code=c.code AND a.status='open'),
 (SELECT COUNT(*) FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.country_code=c.code),
 (SELECT MIN(COALESCE(p.first_seen_at, p.first_seen)) FROM projects p WHERE p.country_code=c.code)
FROM countries c WHERE c.eu_member=1;`;
