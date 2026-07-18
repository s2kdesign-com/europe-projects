// Country-aware оркестратор за дневната синхронизация. НЕ е 26 копия — една логика,
// която обхожда държавите/източниците с настъпил next_run_at, извиква съответния
// connector през единния интерфейс, нормализира, валидира, прави dedup по content
// hash и записва метрики. Продължава при грешка в една държава, без да блокира
// останалите. Translation + AI analysis се пускат само след успешни normalization +
// validation (маркират се за отделен pipeline, не се измислят данни тук).
//
// Работи върху Cloudflare D1 (env.DB). Може да се вика от Worker cron или от Claude
// Scheduled Task. Идемпотентен и resumable през `country_sync_state`.

import { getConnector } from "../index.js";
import { CountryConnector } from "./CountryConnector.js";

const nowISO = () => new Date().toISOString();
const plusMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();

// Праг преди затваряне на процедура (не затваряме след един пропуснат sync).
const MISS_THRESHOLD = 3;

export class CountrySyncOrchestrator {
  constructor(env, { sourceLimit = 3, perSourceDelayMs = 0 } = {}) {
    this.env = env;
    this.sourceLimit = sourceLimit;      // колко източника на едно изпълнение (лимит)
    this.perSourceDelayMs = perSourceDelayMs;
  }

  // Основен вход: обработва до `sourceLimit` активни, готови източника.
  async runDue() {
    const db = this.env.DB;
    const now = nowISO();
    // Само enabled+verified източници на enabled държави, чийто next_run_at е настъпил.
    const due = await db.prepare(
      `SELECT s.* FROM funding_sources s
       JOIN countries c ON c.code = s.country_code
       WHERE s.enabled = 1 AND s.verified = 1 AND c.enabled = 1
         AND (s.next_run_at IS NULL OR s.next_run_at <= ?1)
       ORDER BY s.country_code, s.priority
       LIMIT ?2`
    ).bind(now, this.sourceLimit).all();

    const results = [];
    for (const source of due.results || []) {
      try {
        results.push(await this.processSource(source));
      } catch (e) {
        results.push({ source: source.id, status: "error", error: String((e && e.message) || e) });
        await this.markSourceFailure(source, e);
      }
      if (this.perSourceDelayMs) await new Promise((r) => setTimeout(r, this.perSourceDelayMs));
    }
    return { processed: results.length, results };
  }

  async processSource(source) {
    const db = this.env.DB;
    const startedAt = nowISO();
    const connector = getConnector(source.country_code, [source]);
    if (!connector) return this.finishRun(source, startedAt, { status: "skipped", reason: "no_connector" });

    // Извличане на покани (реалният fetch живее в connector-а). При pending (напр.
    // RO — формат неуточнен) НЕ измисляме данни и не активираме нищо.
    const calls = await connector.fetchCalls();
    if (calls && calls.pending) {
      return this.finishRun(source, startedAt, { status: "pending", reason: calls.reason });
    }
    const rawItems = Array.isArray(calls) ? calls : (calls && calls.items) || [];

    let seen = 0, inserted = 0, updated = 0, unchanged = 0, invalid = 0;
    const seenSourceIds = [];
    for (const raw of rawItems) {
      seen++;
      const p = connector.normalizeProcedure(raw);
      const v = CountryConnector.validate(p);
      if (!v.ok) { invalid++; continue; }
      seenSourceIds.push(p.source_procedure_id);
      const res = await this.upsertProcedure(p);
      if (res === "inserted") inserted++;
      else if (res === "updated") updated++;
      else unchanged++;
      // translation + AI analysis се пускат само след успешен upsert + validation.
      await this.enqueuePostProcessing(p);
    }

    // Маркиране на липсващи (не затваряме след един пропуснат sync — броим последователни).
    await this.reconcileMissing(source, seenSourceIds);

    await this.markSourceSuccess(source);
    return this.finishRun(source, startedAt, { status: "ok", seen, inserted, updated, unchanged, invalid });
  }

  // Upsert по уникален ключ (country_code, source_id, source_procedure_id).
  // Dedup: ако content_hash не се е променил → unchanged (само last_seen_at).
  async upsertProcedure(p) {
    const db = this.env.DB;
    const now = nowISO();
    const existing = await db.prepare(
      "SELECT id, content_hash FROM projects WHERE country_code=?1 AND source_id=?2 AND source_procedure_id=?3"
    ).bind(p.country_code, p.source_id, p.source_procedure_id).first();

    if (!existing) {
      const id = `${p.country_code}:${p.source_id}:${p.source_procedure_id}`.slice(0, 200);
      await db.prepare(
        `INSERT INTO projects (id, name, program, status, deadline, deadline_date, budget, eligible, link,
           country_code, source_id, source_procedure_id, source_programme_id, original_language, official_url,
           managing_authority, regions_json, content_hash, source_status, ingestion_status, translation_status,
           ai_analysis_status, first_seen, first_seen_at, last_seen_at, last_verified_at, last_updated)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,'active','ingested','pending','pending',?19,?19,?19,?19,?19)`
      ).bind(
        id, p.name, p.program || null, p.status || null, p.deadline || null, p.deadline_date || null,
        p.budget || null, p.eligible || null, p.official_url || null, p.country_code, p.source_id,
        p.source_procedure_id, p.source_programme_id || null, p.original_language || null, p.official_url || null,
        p.managing_authority || null, JSON.stringify(p.regions || []), p.content_hash, now
      ).run();
      return "inserted";
    }

    if (existing.content_hash === p.content_hash) {
      await db.prepare("UPDATE projects SET last_seen_at=?1, last_verified_at=?1 WHERE id=?2").bind(now, existing.id).run();
      return "unchanged";
    }
    await db.prepare(
      `UPDATE projects SET name=?1, program=?2, status=?3, deadline=?4, deadline_date=?5, budget=?6, eligible=?7,
         official_url=?8, managing_authority=?9, regions_json=?10, content_hash=?11, source_updated_at=?12,
         last_seen_at=?12, last_verified_at=?12, last_updated=?12, translation_status='pending', ai_analysis_status='pending'
       WHERE id=?13`
    ).bind(
      p.name, p.program || null, p.status || null, p.deadline || null, p.deadline_date || null, p.budget || null,
      p.eligible || null, p.official_url || null, p.managing_authority || null, JSON.stringify(p.regions || []),
      p.content_hash, now, existing.id
    ).run();
    return "updated";
  }

  // Не затваряме процедура след един пропуснат sync — изисква MISS_THRESHOLD
  // последователни липси ИЛИ официален closed статус от източника.
  async reconcileMissing(source, seenSourceIds) {
    // Скелет: реалната логика чете предишно видените и увеличава miss брояч. Тук
    // само не правим нищо разрушително (безопасно по подразбиране).
    return { checked: seenSourceIds.length, threshold: MISS_THRESHOLD };
  }

  // Маркира процедурата за превод + AI анализ (отделен pipeline; не измисляме данни).
  async enqueuePostProcessing(_p) { return true; }

  async markSourceSuccess(source) {
    const now = nowISO();
    await this.env.DB.prepare(
      "UPDATE funding_sources SET last_success_at=?1, last_checked_at=?1, consecutive_failures=0, source_health='healthy', next_run_at=?2, updated_at=?1 WHERE id=?3"
    ).bind(now, plusMinutes(24 * 60), source.id).run();
  }

  async markSourceFailure(source, e) {
    const now = nowISO();
    const fails = (source.consecutive_failures || 0) + 1;
    const health = fails >= MISS_THRESHOLD ? "failing" : "degraded";
    await this.env.DB.prepare(
      "UPDATE funding_sources SET last_failure_at=?1, last_checked_at=?1, last_error_summary=?2, consecutive_failures=?3, source_health=?4, next_run_at=?5, updated_at=?1 WHERE id=?6"
    ).bind(now, String((e && e.message) || e).slice(0, 500), fails, health, plusMinutes(60), source.id).run();
  }

  async finishRun(source, startedAt, m) {
    const completedAt = nowISO();
    await this.env.DB.prepare(
      `INSERT INTO source_sync_runs (source_id, country_code, started_at, completed_at, status, records_seen, inserted, updated, unchanged, invalid, duration_ms, error_summary)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
    ).bind(
      source.id, source.country_code, startedAt, completedAt, m.status || "ok",
      m.seen || 0, m.inserted || 0, m.updated || 0, m.unchanged || 0, m.invalid || 0,
      new Date(completedAt) - new Date(startedAt), m.reason || null
    ).run();

    // Обновяване на агрегата за държавата.
    await this.env.DB.prepare(
      `UPDATE country_sync_state SET last_started_at=?1, last_completed_at=?2, last_success_at=CASE WHEN ?3='ok' THEN ?2 ELSE last_success_at END,
         total_records_seen=total_records_seen+?4, inserted_records=inserted_records+?5, updated_records=updated_records+?6,
         unchanged_records=unchanged_records+?7, invalid_records=invalid_records+?8, updated_at=?2 WHERE country_code=?9`
    ).bind(startedAt, completedAt, m.status || "ok", m.seen || 0, m.inserted || 0, m.updated || 0, m.unchanged || 0, m.invalid || 0, source.country_code).run();

    return { source: source.id, country: source.country_code, ...m };
  }
}

export default CountrySyncOrchestrator;
