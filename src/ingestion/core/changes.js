// История на промените по процедурите (v2.52.0).
//
// Историята е append-only: НИКОГА не се презаписва и не се трие. Тук се
// пресмята какво точно се е променило между стария и новия запис и се
// класифицира по тип и важност.

/** Полета, чиято промяна се записва в историята, с тип на промяната. */
export const TRACKED_FIELDS = Object.freeze({
  // срокове
  deadline_date: { change_type: "deadline_change", significance: "critical" },
  deadline: { change_type: "deadline_change", significance: "major" },
  deadline_time: { change_type: "deadline_change", significance: "major" },
  opening_date: { change_type: "deadline_change", significance: "major" },
  questions_deadline: { change_type: "deadline_change", significance: "minor" },
  clarifications_deadline: { change_type: "deadline_change", significance: "minor" },
  intake_type: { change_type: "deadline_change", significance: "major" },
  // бюджет
  budget_amount_eur: { change_type: "budget_change", significance: "critical" },
  budget: { change_type: "budget_change", significance: "major" },
  budget_currency: { change_type: "budget_change", significance: "major" },
  budget_scope: { change_type: "budget_change", significance: "major" },
  min_grant_eur: { change_type: "budget_change", significance: "major" },
  max_grant_eur: { change_type: "budget_change", significance: "major" },
  min_project_size_eur: { change_type: "budget_change", significance: "minor" },
  max_project_size_eur: { change_type: "budget_change", significance: "minor" },
  budget_eu_cofinancing_eur: { change_type: "budget_change", significance: "minor" },
  budget_national_cofinancing_eur: { change_type: "budget_change", significance: "minor" },
  min_financing_rate: { change_type: "budget_change", significance: "major" },
  max_financing_rate: { change_type: "budget_change", significance: "critical" },
  own_contribution_rate: { change_type: "budget_change", significance: "major" },
  // статус
  status: { change_type: "status_change", significance: "critical" },
  source_status: { change_type: "status_change", significance: "major" },
  // допустимост
  eligible: { change_type: "eligibility_change", significance: "major" },
  applicant_types_json: { change_type: "eligibility_change", significance: "critical" },
  enterprise_sizes_json: { change_type: "eligibility_change", significance: "major" },
  eligible_activities: { change_type: "eligibility_change", significance: "major" },
  ineligible_activities: { change_type: "eligibility_change", significance: "minor" },
  eligible_costs: { change_type: "eligibility_change", significance: "major" },
  ineligible_costs: { change_type: "eligibility_change", significance: "minor" },
  eligible_regions_json: { change_type: "eligibility_change", significance: "major" },
  geographic_scope: { change_type: "eligibility_change", significance: "minor" },
  partnership_required: { change_type: "eligibility_change", significance: "major" },
  min_partners: { change_type: "eligibility_change", significance: "minor" },
  // корекции по същността
  name: { change_type: "correction", significance: "major" },
  title_native: { change_type: "correction", significance: "minor" },
  official_url: { change_type: "correction", significance: "major" },
  application_url: { change_type: "correction", significance: "minor" },
  program: { change_type: "correction", significance: "minor" },
  eu_fund: { change_type: "correction", significance: "minor" },
  managing_authority: { change_type: "correction", significance: "minor" },
  application_mode: { change_type: "other", significance: "minor" },
  contact_email: { change_type: "other", significance: "minor" },
});

/** Промени, които са „особено важни" за потребителя (Change Feed / известия). */
export const CRITICAL_CHANGE_TYPES = Object.freeze([
  "deadline_change", "budget_change", "status_change", "eligibility_change", "amendment",
]);

const MAX_VALUE_LEN = 2000;

const norm = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "1" : "0";
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** Равни ли са две стойности за целите на историята (JSON списъците са без ред). */
export function valuesEqual(a, b, field) {
  const na = norm(a); const nb = norm(b);
  if (na === nb) return true;
  if (na === null || nb === null) return false;
  if (field && field.endsWith("_json")) {
    try {
      const pa = JSON.parse(na); const pb = JSON.parse(nb);
      if (Array.isArray(pa) && Array.isArray(pb)) {
        return JSON.stringify([...pa].map(String).sort()) === JSON.stringify([...pb].map(String).sort());
      }
      return JSON.stringify(pa) === JSON.stringify(pb);
    } catch { /* не е JSON → сравняваме като низове */ }
  }
  // числовите полета: 1000 и 1000.0 са една и съща стойност
  const fa = Number(na); const fb = Number(nb);
  if (Number.isFinite(fa) && Number.isFinite(fb)) return Math.abs(fa - fb) < 1e-9;
  return false;
}

/**
 * Разлики между стар и нов запис. Връща масив с готови редове за
 * `project_change_history` (без id/created_at — те се слагат от D1).
 */
export function diffProcedure(oldRow = {}, newRow = {}, {
  projectId = null, countryCode = null, runId = null, detectedFrom = "page",
  sourceUrl = null, documentId = null, changedAt = null, fields = TRACKED_FIELDS,
} = {}) {
  const out = [];
  for (const field of Object.keys(fields)) {
    if (!(field in newRow)) continue;                 // полето не е извлечено този път
    const nv = newRow[field];
    if (nv === undefined) continue;
    const ov = oldRow ? oldRow[field] : undefined;
    // Не записваме „нищо → нищо" и не записваме първоначалното попълване на
    // празно поле като промяна на стойност — това е обогатяване, не промяна.
    if (valuesEqual(ov, nv, field)) continue;
    const meta = fields[field];
    const enrichment = norm(ov) === null && norm(nv) !== null;
    out.push({
      project_id: projectId,
      country_code: countryCode,
      field_name: field,
      old_value: norm(ov) === null ? null : String(norm(ov)).slice(0, MAX_VALUE_LEN),
      new_value: norm(nv) === null ? null : String(norm(nv)).slice(0, MAX_VALUE_LEN),
      change_type: enrichment ? "correction" : meta.change_type,
      significance: enrichment ? "minor" : meta.significance,
      detected_from: detectedFrom,
      source_url: sourceUrl,
      document_id: documentId,
      run_id: runId,
      changed_at: changedAt,
    });
  }
  return out;
}

/** Запис в историята за добавен документ. */
export function documentAddedChange({
  projectId, countryCode, documentId, title, category, sourceUrl, runId, changedAt, isAmendment = false,
}) {
  return {
    project_id: projectId,
    country_code: countryCode,
    field_name: "documents",
    old_value: null,
    new_value: `${category || "other"}: ${String(title || "").slice(0, 300)}`,
    change_type: isAmendment ? "amendment" : "document_added",
    significance: isAmendment ? "critical" : "major",
    detected_from: "document",
    source_url: sourceUrl || null,
    document_id: documentId || null,
    run_id: runId || null,
    changed_at: changedAt,
  };
}

/** Запис за нова версия на съществуващ документ. */
export function documentVersionChange({
  projectId, countryCode, documentId, title, versionLabel, sourceUrl, runId, changedAt,
}) {
  return {
    project_id: projectId,
    country_code: countryCode,
    field_name: "documents.version",
    old_value: null,
    new_value: `${String(title || "").slice(0, 240)} → ${versionLabel || "нова версия"}`,
    change_type: "amendment",
    significance: "critical",
    detected_from: "document",
    source_url: sourceUrl || null,
    document_id: documentId || null,
    run_id: runId || null,
    changed_at: changedAt,
  };
}

/** Кратко обобщение на промените за safe_summary / Change Feed. */
export function summarizeChanges(changes = []) {
  const byType = {};
  for (const c of changes) {
    const k = c && c.change_type;
    if (!k) continue;
    byType[k] = (byType[k] || 0) + 1;
  }
  const critical = changes.filter((c) => c && c.significance === "critical").length;
  return { total: changes.length, critical, byType };
}

/** Само промените, които заслужават внимание на потребителя. */
export function importantChanges(changes = []) {
  return changes.filter((c) => c && (c.significance === "critical" || CRITICAL_CHANGE_TYPES.includes(c.change_type)));
}

export const CHANGE_HISTORY_INSERT_SQL = `
INSERT INTO project_change_history
  (project_id, country_code, field_name, old_value, new_value, change_type, significance,
   detected_from, source_url, document_id, run_id, changed_at, created_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11, COALESCE(?12, datetime('now')), datetime('now'));`;

const changes = {
  TRACKED_FIELDS, CRITICAL_CHANGE_TYPES, valuesEqual, diffProcedure,
  documentAddedChange, documentVersionChange, summarizeChanges, importantChanges,
  CHANGE_HISTORY_INSERT_SQL,
};
export default changes;
