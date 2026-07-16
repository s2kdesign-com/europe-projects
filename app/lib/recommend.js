// Услуга за препоръки — ДЕТЕРМИНИСТИЧНА и тестируема логика, отделена от UI.
// Смята оценка (0–100) + разбираеми причини + несигурности от РЕАЛНИ полета.
// Не гарантира допустимост — това се проверява от официалните документи.

import { daysLeft, targetGroup } from "./project-utils.js";

export const ELIGIBILITY_DISCLAIMER =
  "Оценката е ориентировъчна. Окончателната допустимост се проверява в официалните документи на процедурата.";

const APPLICANT_KEYWORDS = {
  sme: /мсп|малки и средни|предприяти/i,
  large: /големи предприяти/i,
  ngo: /нпо|сдружени|неправителствен/i,
  municipality: /общин/i,
  public: /публичн|държавн(и|а) институци/i,
  school: /училищ|университет|образовател/i,
  startup: /стартъп|стартиращ/i,
};
const INTEREST_KEYWORDS = {
  training_interest: /обучени|квалификаци|умения/i,
  research_interest: /научн|изследван/i,
  innovation_interest: /иноваци/i,
  digitalization_interest: /дигитал|цифров/i,
  green_transition_interest: /зелен|околна среда|енергийн|въглерод|кръгова/i,
};

function text(p) {
  return [p.name, p.eligible, p.notes, p.priority, p.program].filter(Boolean).join(" ");
}

// Има ли профилът достатъчно за препоръки?
export function canRecommend(profile) {
  if (!profile) return false;
  const arr = (k) => Array.isArray(profile[k]) && profile[k].length > 0;
  const anyInterest = ["youth_employment_interest", "training_interest", "research_interest", "innovation_interest", "digitalization_interest", "green_transition_interest"].some((k) => profile[k]);
  return arr("preferred_programs") || arr("applicant_types") || Boolean(profile.primary_sector) || anyInterest;
}

export function scoreProcedure(p, profile, now = new Date()) {
  const reasons = [];
  const mismatches = [];
  let score = 0;
  const t = text(p);
  const open = p.status === "open" || p.status === "closing_soon";

  // Програма (силен, точен сигнал).
  if (Array.isArray(profile.preferred_programs) && profile.preferred_programs.includes(p.program)) {
    score += 35;
    reasons.push(`Съответства на предпочитаната програма „${p.program}"`);
  }

  // Тип кандидат.
  const applicants = profile.applicant_types || [];
  if (applicants.includes("youth") && targetGroup(p) === "youth") {
    score += 20;
    reasons.push("Насочена към младежка заетост");
  }
  for (const a of applicants) {
    if (a === "youth") continue;
    const re = APPLICANT_KEYWORDS[a];
    if (re && re.test(t)) {
      score += 12;
      reasons.push("Допустимите кандидати съвпадат с профила ви (по описание)");
      break;
    }
  }

  // Интереси.
  if (profile.youth_employment_interest && targetGroup(p) === "youth") {
    score += 12;
    reasons.push("Отговаря на интереса ви към младежка заетост");
  }
  for (const [key, re] of Object.entries(INTEREST_KEYWORDS)) {
    if (profile[key] && re.test(t)) {
      score += 8;
      reasons.push(`Свързана с интереса ви (${labelForInterest(key)})`);
    }
  }

  // Статус / срок.
  if (open) {
    score += 15;
    reasons.push("Отворена за кандидатстване");
    const dl = daysLeft(p.deadline_date, now);
    if (dl != null && dl >= 0 && dl <= 7) mismatches.push("Крайният срок наближава (по-малко от седмица)");
  } else if (p.status === "closed") {
    mismatches.push("Процедурата вече е приключена");
    score = Math.max(0, score - 20);
  } else if (p.status === "upcoming") {
    reasons.push("Предстояща — подгответе се навреме");
  }

  // Несигурности.
  if (!p.eligible) mismatches.push("Няма данни за допустимите кандидати — проверете официално");

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    mismatches,
    sufficient: Boolean(p.eligible && p.eligible.trim()),
  };
}

function labelForInterest(key) {
  return {
    training_interest: "обучение",
    research_interest: "научни изследвания",
    innovation_interest: "иновации",
    digitalization_interest: "дигитализация",
    green_transition_interest: "зелени технологии",
  }[key] || key;
}

export function recommend(projects, profile, now = new Date(), limit = 6) {
  if (!canRecommend(profile)) return [];
  return (projects || [])
    .map((p) => ({ p, rec: scoreProcedure(p, profile, now) }))
    .filter((x) => x.rec.score >= 25)
    .sort((a, b) => {
      if (b.rec.score !== a.rec.score) return b.rec.score - a.rec.score;
      const da = daysLeft(a.p.deadline_date, now);
      const db = daysLeft(b.p.deadline_date, now);
      const ra = da == null ? 1e9 : da < 0 ? 1e8 : da;
      const rb = db == null ? 1e9 : db < 0 ? 1e8 : db;
      return ra - rb;
    })
    .slice(0, limit);
}
