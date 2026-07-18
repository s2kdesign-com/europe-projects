// Публична платформена статистика (за /about): чете последния УСПЕШЕН дневен
// snapshot от country_daily_statistics — без тежки агрегации при page load.
// Само публични безопасни полета; ETag + cache + stale-while-revalidate.

import { aggregateEurope } from "../src/ingestion/core/statistics.js";

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
      activeSources: r.active_sources,
      lastSuccessfulSyncAt: r.last_successful_sync_at,
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
export const SNAPSHOT_SQL = `INSERT OR REPLACE INTO country_daily_statistics (id, snapshot_date, country_code, total_procedures, active_procedures, upcoming_procedures, closed_procedures, procedures_with_documents, new_last_30_days, updated_last_30_days, published_budget_eur, budget_procedure_count, active_sources, successful_sources, failed_sources, last_successful_sync_at, coverage_status, publish_status, created_at, updated_at)
SELECT c.code || ':' || date('now'), date('now'), c.code,
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.status IN ('open','closing_soon')),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.status='upcoming'),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.status='closed'),
 (SELECT COUNT(DISTINCT d.project_id) FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.country_code=c.code),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.first_seen >= date('now','-30 day')),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.last_updated >= date('now','-30 day') AND p.last_updated != p.first_seen),
 NULL, 0,
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.enabled=1),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.source_health='healthy'),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.source_health IN ('failing','blocked')),
 c.last_successful_sync_at, c.coverage_status, 'published', datetime('now'), datetime('now')
FROM countries c WHERE c.eu_member=1;`;
