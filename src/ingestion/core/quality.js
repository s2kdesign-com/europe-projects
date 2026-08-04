// Оценка на пълнотата и качеството на извлечените данни (v2.52.0).
//
// Чисти функции — вход е един „нормализиран" запис за процедура (полетата на
// `projects` + `project_details` + `project_budget_terms` + броячи за документи).
// Без I/O, без измисляне на стойности: липсващото носи 0 точки, не „средно".

/** Тежести за data completeness score (сборът е 100). */
export const QUALITY_WEIGHTS = Object.freeze({
  identity: 10,        // официално заглавие + URL
  statusDeadline: 15,  // валиден статус и срок
  primaryDocument: 20, // официален основен документ
  budget: 15,          // структуриран бюджет
  applicants: 10,      // допустими кандидати
  activitiesCosts: 10, // допустими дейности и разходи
  programme: 10,       // програма, фонд и управляващ орган
  application: 5,      // начин на кандидатстване и контакти
  provenance: 5,       // проверена дата и source metadata
});

export const QUALITY_THRESHOLDS = Object.freeze({
  complete: 85,
  good: 70,
  partial: 40,
});

export const VALID_STATUSES = Object.freeze(["open", "closing_soon", "upcoming", "closed"]);

const has = (v) => v !== null && v !== undefined && String(v).trim() !== "";
const hasNum = (v) => Number.isFinite(Number(v)) && Number(v) > 0;
const hasList = (v) => {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return false;
    if (s.startsWith("[")) { try { return JSON.parse(s).length > 0; } catch { return false; } }
    return true;
  }
  return false;
};

/**
 * Пресмята completeness score 0..100 + разбивка по критерий и списък с липсващото.
 *
 * p приема (всички опционални):
 *   name/title_native, official_url/link, status, deadline_date, deadline,
 *   hasPrimaryDocument, documentCount, documentsPublishedBySource,
 *   budget_amount_eur, budget_currency, budget_scope, min_grant_eur, max_grant_eur,
 *   max_financing_rate, applicant_types_json, enterprise_sizes_json,
 *   eligible_activities, eligible_costs, program, eu_fund, managing_authority,
 *   application_mode, contact_email, contact_phone, last_verified_at, source_id,
 *   source_procedure_id, content_hash
 */
export function computeCompleteness(p = {}) {
  const b = {};
  const missing = [];

  // 1. Идентификация
  const hasTitle = has(p.name) || has(p.title_native);
  const hasUrl = has(p.official_url) || has(p.link) || has(p.application_url);
  b.identity = (hasTitle ? QUALITY_WEIGHTS.identity / 2 : 0) + (hasUrl ? QUALITY_WEIGHTS.identity / 2 : 0);
  if (!hasTitle) missing.push("title");
  if (!hasUrl) missing.push("official_url");

  // 2. Статус + срок (постоянният прием е валиден без дата)
  const statusOk = VALID_STATUSES.includes(String(p.status || "").trim());
  const rolling = String(p.intake_type || "") === "rolling";
  const deadlineOk = has(p.deadline_date) || rolling || String(p.status) === "closed";
  b.statusDeadline = (statusOk ? QUALITY_WEIGHTS.statusDeadline * 0.5 : 0)
    + (deadlineOk ? QUALITY_WEIGHTS.statusDeadline * 0.5 : 0);
  if (!statusOk) missing.push("status");
  if (!deadlineOk) missing.push("deadline_date");

  // 3. Основен официален документ. Доказана липса на документи в портала не
  //    наказва процедурата (иначе такива държави никога не биха стигнали „good").
  const documentsAbsentProven = p.documentsPublishedBySource === 0 && has(p.documentsAbsenceEvidenceUrl);
  if (p.hasPrimaryDocument) b.primaryDocument = QUALITY_WEIGHTS.primaryDocument;
  else if (Number(p.documentCount) > 0) b.primaryDocument = QUALITY_WEIGHTS.primaryDocument * 0.5;
  else if (documentsAbsentProven) b.primaryDocument = QUALITY_WEIGHTS.primaryDocument * 0.75;
  else { b.primaryDocument = 0; missing.push("primary_document"); }

  // 4. Структуриран бюджет
  const budgetTotal = hasNum(p.budget_amount_eur);
  const budgetScoped = has(p.budget_scope);
  const budgetRange = hasNum(p.min_grant_eur) || hasNum(p.max_grant_eur)
    || hasNum(p.min_project_size_eur) || hasNum(p.max_project_size_eur)
    || hasNum(p.max_financing_rate);
  b.budget = (budgetTotal ? QUALITY_WEIGHTS.budget * 0.5 : 0)
    + (budgetScoped ? QUALITY_WEIGHTS.budget * 0.2 : 0)
    + (budgetRange ? QUALITY_WEIGHTS.budget * 0.3 : 0);
  if (!budgetTotal) missing.push("budget_amount_eur");
  if (!budgetScoped) missing.push("budget_scope");

  // 5. Допустими кандидати
  const applicants = hasList(p.applicant_types_json) || hasList(p.applicantTypes) || has(p.eligible);
  const sizes = hasList(p.enterprise_sizes_json) || hasList(p.enterpriseSizes);
  b.applicants = (applicants ? QUALITY_WEIGHTS.applicants * 0.7 : 0) + (sizes ? QUALITY_WEIGHTS.applicants * 0.3 : 0);
  if (!applicants) missing.push("applicant_types");

  // 6. Дейности и разходи
  const activities = has(p.eligible_activities) || has(p.main_activities);
  const costs = has(p.eligible_costs);
  b.activitiesCosts = (activities ? QUALITY_WEIGHTS.activitiesCosts * 0.5 : 0)
    + (costs ? QUALITY_WEIGHTS.activitiesCosts * 0.5 : 0);
  if (!activities) missing.push("eligible_activities");
  if (!costs) missing.push("eligible_costs");

  // 7. Програма, фонд и управляващ орган
  const prog = has(p.program) || has(p.subprogramme);
  const fund = has(p.eu_fund);
  const ma = has(p.managing_authority);
  b.programme = (prog ? QUALITY_WEIGHTS.programme * 0.4 : 0)
    + (fund ? QUALITY_WEIGHTS.programme * 0.3 : 0)
    + (ma ? QUALITY_WEIGHTS.programme * 0.3 : 0);
  if (!prog) missing.push("program");
  if (!fund) missing.push("eu_fund");
  if (!ma) missing.push("managing_authority");

  // 8. Кандидатстване и контакти
  const howTo = has(p.application_mode) || has(p.application_system) || has(p.application_url);
  const contact = has(p.contact_email) || has(p.contact_phone) || has(p.contact_unit);
  b.application = (howTo ? QUALITY_WEIGHTS.application * 0.6 : 0) + (contact ? QUALITY_WEIGHTS.application * 0.4 : 0);
  if (!howTo) missing.push("application_mode");

  // 9. Проследимост
  const verified = has(p.last_verified_at);
  const sourceMeta = has(p.source_id) && has(p.source_procedure_id);
  b.provenance = (verified ? QUALITY_WEIGHTS.provenance * 0.5 : 0) + (sourceMeta ? QUALITY_WEIGHTS.provenance * 0.5 : 0);
  if (!verified) missing.push("last_verified_at");

  const raw = Object.values(b).reduce((s, v) => s + v, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const breakdown = {};
  for (const k of Object.keys(b)) breakdown[k] = Math.round(b[k] * 10) / 10;
  return { score, breakdown, missing };
}

/**
 * Качествен статус. Процедура БЕЗ официален документ не може да е `complete`,
 * освен ако е доказано, че порталът не публикува документи.
 */
export function qualityStatus(score, {
  hasPrimaryDocument = false,
  documentsPublishedBySource = null,
  documentsAbsenceEvidenceUrl = null,
  openAnomalies = 0,
} = {}) {
  if (Number(openAnomalies) > 0) return "pending_review";
  const s = Number(score);
  if (!Number.isFinite(s)) return "incomplete";
  const documentsProvenAbsent = documentsPublishedBySource === 0 && !!documentsAbsenceEvidenceUrl;
  if (s >= QUALITY_THRESHOLDS.complete) {
    if (hasPrimaryDocument || documentsProvenAbsent) return "complete";
    return "good"; // висок резултат, но без доказан основен документ
  }
  if (s >= QUALITY_THRESHOLDS.good) return "good";
  if (s >= QUALITY_THRESHOLDS.partial) return "partial";
  return "incomplete";
}

/** Пълна оценка в един израз (удобно за ingestion и за тестове). */
export function assessProcedure(p = {}, { openAnomalies = 0 } = {}) {
  const { score, breakdown, missing } = computeCompleteness(p);
  const status = qualityStatus(score, {
    hasPrimaryDocument: !!p.hasPrimaryDocument,
    documentsPublishedBySource: p.documentsPublishedBySource,
    documentsAbsenceEvidenceUrl: p.documentsAbsenceEvidenceUrl,
    openAnomalies,
  });
  return { completeness_score: score, quality_status: status, breakdown, missing };
}

/** Среден резултат по списък (null при празен вход — не 0). */
export function averageScore(rows = []) {
  const vals = rows.map((r) => Number(r && (r.completeness_score ?? r.score)))
    .filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

/** Разпределение по quality_status (за отчетите и /about). */
export function qualityDistribution(rows = []) {
  const out = { complete: 0, good: 0, partial: 0, incomplete: 0, pending_review: 0, unknown: 0 };
  for (const r of rows) {
    const k = r && r.quality_status;
    if (k && Object.prototype.hasOwnProperty.call(out, k)) out[k]++;
    else out.unknown++;
  }
  return out;
}

const quality = {
  QUALITY_WEIGHTS, QUALITY_THRESHOLDS, computeCompleteness, qualityStatus,
  assessProcedure, averageScore, qualityDistribution,
};
export default quality;
