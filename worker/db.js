// Достъп до данните за автентикирани потребители (D1, параметризирани заявки).

import { nowISO, uuid } from "./util.js";
import { redactSecrets } from "./ai/crypto.js";

const PROFILE_ARRAYS = ["additional_sectors", "preferred_programs", "applicant_types", "preferred_activities", "preferred_regions"];
const PROFILE_BOOLS = ["youth_employment_interest", "innovation_interest", "digitalization_interest", "green_transition_interest", "research_interest", "training_interest"];
const PROFILE_STRINGS = ["organization_name", "organization_type", "company_or_registration_number", "region", "municipality", "organization_size", "employee_count_range", "annual_revenue_range", "primary_sector", "notes"];
const PROFILE_NUMS = ["minimum_project_budget", "maximum_project_budget", "maximum_self_financing_percentage"];

export const PERSONAL_STATUSES = ["za_pregled", "podhodyashta", "podgotovka", "kandidatstvane", "podadena", "nepodhodyashta", "arhivirana"];

// Роли и първи администратор (bootstrap).
export const ROLES = ["user", "premium", "admin"];
export const ADMIN_EMAILS = ["s2kdesign.digital@gmail.com"];

// ---- Потребител ----
export async function upsertUserFromClaims(env, claims) {
  const now = nowISO();
  const email = String(claims.email).toLowerCase();
  let user = await env.DB.prepare("SELECT * FROM users WHERE email = ?1").bind(email).first();
  if (user) {
    await env.DB.prepare("UPDATE users SET display_name=?1, avatar_url=?2, locale=?3, email_verified=1, updated_at=?4, last_login_at=?4 WHERE id=?5")
      .bind(claims.name || user.display_name || null, claims.picture || user.avatar_url || null, claims.locale || user.locale || null, now, user.id)
      .run();
  } else {
    const id = uuid();
    await env.DB.prepare("INSERT INTO users (id,email,email_verified,display_name,avatar_url,locale,created_at,updated_at,last_login_at) VALUES (?1,?2,1,?3,?4,?5,?6,?6,?6)")
      .bind(id, email, claims.name || null, claims.picture || null, claims.locale || null, now)
      .run();
    user = { id, email };
  }
  // Bootstrap на първия администратор.
  if (ADMIN_EMAILS.includes(email)) {
    await env.DB.prepare("UPDATE users SET role='admin' WHERE id=?1 AND role<>'admin'").bind(user.id).run();
  }
  const existing = await env.DB.prepare("SELECT id FROM oauth_accounts WHERE provider=?1 AND provider_account_id=?2").bind("google", String(claims.sub)).first();
  if (!existing) {
    await env.DB.prepare("INSERT INTO oauth_accounts (id,user_id,provider,provider_account_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)")
      .bind(uuid(), user.id, "google", String(claims.sub), now)
      .run();
  }
  await ensureDefaults(env, user.id, now);
  return user.id;
}

async function ensureDefaults(env, userId, now) {
  const prof = await env.DB.prepare("SELECT user_id FROM user_profiles WHERE user_id=?1").bind(userId).first();
  if (!prof) await env.DB.prepare("INSERT INTO user_profiles (user_id, profile_completion_percentage, created_at, updated_at) VALUES (?1,0,?2,?2)").bind(userId, now).run();
  const pref = await env.DB.prepare("SELECT user_id FROM user_preferences WHERE user_id=?1").bind(userId).first();
  if (!pref) await env.DB.prepare("INSERT INTO user_preferences (user_id, language, created_at, updated_at) VALUES (?1,'bg',?2,?2)").bind(userId, now).run();
}

// ---- Профил ----
function parseArr(v) { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }
export async function getProfile(env, userId) {
  const row = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id=?1").bind(userId).first();
  if (!row) return null;
  const out = { ...row };
  for (const k of PROFILE_ARRAYS) out[k] = parseArr(row[k]);
  for (const k of PROFILE_BOOLS) out[k] = !!row[k];
  return out;
}
function computeCompletion(p) {
  const checks = [
    p.organization_name, p.organization_type, p.region, p.primary_sector,
    (p.preferred_programs || []).length, (p.applicant_types || []).length,
    p.maximum_project_budget != null, (p.additional_sectors || []).length || PROFILE_BOOLS.some((b) => p[b]),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
export async function putProfile(env, userId, body) {
  const clean = {};
  for (const k of PROFILE_STRINGS) clean[k] = body[k] == null ? null : String(body[k]).slice(0, 500);
  for (const k of PROFILE_ARRAYS) clean[k] = Array.isArray(body[k]) ? body[k].map((x) => String(x).slice(0, 120)).slice(0, 40) : [];
  for (const k of PROFILE_BOOLS) clean[k] = body[k] ? 1 : 0;
  for (const k of PROFILE_NUMS) { const n = Number(body[k]); clean[k] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; }
  if (clean.maximum_self_financing_percentage != null) clean.maximum_self_financing_percentage = Math.min(100, clean.maximum_self_financing_percentage);
  if (clean.minimum_project_budget != null && clean.maximum_project_budget != null && clean.minimum_project_budget > clean.maximum_project_budget) return { error: "budget_range_invalid" };
  const completion = computeCompletion(clean);
  const now = nowISO();
  await env.DB.prepare(
    `UPDATE user_profiles SET organization_name=?1, organization_type=?2, company_or_registration_number=?3, region=?4, municipality=?5,
      organization_size=?6, employee_count_range=?7, annual_revenue_range=?8, primary_sector=?9,
      additional_sectors=?10, preferred_programs=?11, applicant_types=?12, preferred_activities=?13, preferred_regions=?14,
      minimum_project_budget=?15, maximum_project_budget=?16, maximum_self_financing_percentage=?17,
      youth_employment_interest=?18, innovation_interest=?19, digitalization_interest=?20, green_transition_interest=?21,
      research_interest=?22, training_interest=?23, notes=?24, profile_completion_percentage=?25, updated_at=?26 WHERE user_id=?27`
  ).bind(
    clean.organization_name, clean.organization_type, clean.company_or_registration_number, clean.region, clean.municipality,
    clean.organization_size, clean.employee_count_range, clean.annual_revenue_range, clean.primary_sector,
    JSON.stringify(clean.additional_sectors), JSON.stringify(clean.preferred_programs), JSON.stringify(clean.applicant_types), JSON.stringify(clean.preferred_activities), JSON.stringify(clean.preferred_regions),
    clean.minimum_project_budget, clean.maximum_project_budget, clean.maximum_self_financing_percentage,
    clean.youth_employment_interest, clean.innovation_interest, clean.digitalization_interest, clean.green_transition_interest,
    clean.research_interest, clean.training_interest, clean.notes, completion, now, userId
  ).run();
  return { completion };
}

// ---- Предпочитания ----
export async function getPreferences(env, userId) {
  const row = await env.DB.prepare("SELECT * FROM user_preferences WHERE user_id=?1").bind(userId).first();
  if (!row) return null;
  for (const k of ["email_notifications_enabled", "deadline_notifications_enabled", "change_notifications_enabled"]) row[k] = !!row[k];
  return row;
}
export async function putPreferences(env, userId, body) {
  const now = nowISO();
  const language = ["bg", "en"].includes(body.language) ? body.language : "bg";
  const days = Number(body.notification_days_before);
  await env.DB.prepare(
    `UPDATE user_preferences SET language=?1, default_view=?2, preferred_period=?3, email_notifications_enabled=?4, deadline_notifications_enabled=?5, change_notifications_enabled=?6, notification_days_before=?7, updated_at=?8 WHERE user_id=?9`
  ).bind(
    language, body.default_view ? String(body.default_view).slice(0, 20) : null, body.preferred_period ? String(body.preferred_period).slice(0, 20) : null,
    body.email_notifications_enabled ? 1 : 0, body.deadline_notifications_enabled ? 1 : 0, body.change_notifications_enabled ? 1 : 0,
    Number.isFinite(days) && days >= 0 && days <= 60 ? Math.floor(days) : 7, now, userId
  ).run();
}

// ---- Запазени процедури ----
export async function listSaved(env, userId) {
  const { results } = await env.DB.prepare("SELECT * FROM saved_procedures WHERE user_id=?1 ORDER BY saved_at DESC").bind(userId).all();
  for (const r of results || []) r.reminder_enabled = !!r.reminder_enabled;
  return results || [];
}
async function procedureLastUpdated(env, procedureId) {
  const row = await env.DB.prepare("SELECT id, last_updated FROM projects WHERE id=?1").bind(procedureId).first();
  return row ? (row.last_updated || null) : undefined;
}
export async function saveProcedure(env, userId, procedureId, fields = {}) {
  const lu = await procedureLastUpdated(env, procedureId);
  if (lu === undefined) return { error: "procedure_not_found", status: 404 };
  const now = nowISO();
  const existing = await env.DB.prepare("SELECT id FROM saved_procedures WHERE user_id=?1 AND procedure_id=?2").bind(userId, procedureId).first();
  if (existing) return { ok: true, duplicate: true };
  await env.DB.prepare("INSERT INTO saved_procedures (id,user_id,procedure_id,saved_at,personal_status,reminder_enabled,reminder_days_before,last_updated_at_save) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
    .bind(uuid(), userId, procedureId, now, fields.personal_status && PERSONAL_STATUSES.includes(fields.personal_status) ? fields.personal_status : "za_pregled", 0, null, lu).run();
  return { ok: true };
}
export async function patchSaved(env, userId, procedureId, fields = {}) {
  const existing = await env.DB.prepare("SELECT * FROM saved_procedures WHERE user_id=?1 AND procedure_id=?2").bind(userId, procedureId).first();
  if (!existing) return { error: "not_found", status: 404 };
  const status = fields.personal_status != null ? (PERSONAL_STATUSES.includes(fields.personal_status) ? fields.personal_status : existing.personal_status) : existing.personal_status;
  const note = fields.personal_note != null ? String(fields.personal_note).slice(0, 2000) : existing.personal_note;
  const reminder = fields.reminder_enabled != null ? (fields.reminder_enabled ? 1 : 0) : existing.reminder_enabled;
  const rdays = fields.reminder_days_before != null ? (Number.isFinite(Number(fields.reminder_days_before)) ? Math.floor(Number(fields.reminder_days_before)) : existing.reminder_days_before) : existing.reminder_days_before;
  const archived = fields.archived != null ? (fields.archived ? nowISO() : null) : existing.archived_at;
  const lastViewed = fields.viewed ? nowISO() : existing.last_viewed_at;
  await env.DB.prepare("UPDATE saved_procedures SET personal_status=?1, personal_note=?2, reminder_enabled=?3, reminder_days_before=?4, archived_at=?5, last_viewed_at=?6 WHERE user_id=?7 AND procedure_id=?8")
    .bind(status, note, reminder, rdays, archived, lastViewed, userId, procedureId).run();
  return { ok: true };
}
export async function deleteSaved(env, userId, procedureId) {
  await env.DB.prepare("DELETE FROM saved_procedures WHERE user_id=?1 AND procedure_id=?2").bind(userId, procedureId).run();
  return { ok: true };
}
export async function importLocal(env, userId, ids) {
  if (!Array.isArray(ids)) return { error: "invalid_body", status: 400 };
  const unique = [...new Set(ids.map((x) => String(x)).filter(Boolean))].slice(0, 200);
  let added = 0, skipped = 0;
  for (const pid of unique) {
    const lu = await procedureLastUpdated(env, pid);
    if (lu === undefined) { skipped++; continue; }
    const exists = await env.DB.prepare("SELECT id FROM saved_procedures WHERE user_id=?1 AND procedure_id=?2").bind(userId, pid).first();
    if (exists) { skipped++; continue; }
    await env.DB.prepare("INSERT INTO saved_procedures (id,user_id,procedure_id,saved_at,personal_status,reminder_enabled,last_updated_at_save) VALUES (?1,?2,?3,?4,'za_pregled',0,?5)").bind(uuid(), userId, pid, nowISO(), lu).run();
    added++;
  }
  return { ok: true, added, skipped };
}

export async function deleteAccount(env, userId) {
  for (const t of ["saved_procedures", "user_preferences", "user_profiles", "oauth_accounts", "sessions"]) {
    await env.DB.prepare(`DELETE FROM ${t} WHERE user_id=?1`).bind(userId).run();
  }
  await env.DB.prepare("DELETE FROM users WHERE id=?1").bind(userId).run();
  return { ok: true };
}

// ---- Администрация ----
export async function listUsers(env) {
  const { results } = await env.DB.prepare("SELECT id, email, display_name, avatar_url, role, created_at, last_login_at FROM users ORDER BY created_at DESC").all();
  return results || [];
}
export async function setUserRole(env, targetUserId, role) {
  if (!ROLES.includes(role)) return { error: "invalid_role", status: 400 };
  const u = await env.DB.prepare("SELECT id, email FROM users WHERE id=?1").bind(targetUserId).first();
  if (!u) return { error: "not_found", status: 404 };
  // Пазим bootstrap администратора да не бъде понижен.
  if (ADMIN_EMAILS.includes(String(u.email).toLowerCase()) && role !== "admin") return { error: "cannot_demote_root_admin", status: 400 };
  await env.DB.prepare("UPDATE users SET role=?1, updated_at=?2 WHERE id=?3").bind(role, nowISO(), targetUserId).run();
  return { ok: true };
}
export async function listErrors(env, limit = 100) {
  const n = Math.min(500, Math.max(1, Number(limit) || 100));
  const { results } = await env.DB.prepare("SELECT id, created_at, source, method, path, status, message, detail, user_id FROM error_log ORDER BY id DESC LIMIT ?1").bind(n).all();
  return results || [];
}
export async function clearErrors(env) {
  await env.DB.prepare("DELETE FROM error_log").run();
  return { ok: true };
}
export async function logError(env, e = {}) {
  try {
    await env.DB.prepare("INSERT INTO error_log (created_at, source, method, path, status, message, detail, user_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
      .bind(nowISO(), (e.source || "server").slice(0, 20), (e.method || "").slice(0, 10), (e.path || "").slice(0, 300), e.status || null, redactSecrets((e.message || "")).slice(0, 500), redactSecrets((e.detail || "")).slice(0, 2000), e.userId || null)
      .run();
  } catch { /* журналът не бива да чупи заявката */ }
}
