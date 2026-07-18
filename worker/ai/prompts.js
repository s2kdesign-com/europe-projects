// Versioned prompt templates + structured output schemas per purpose.
// Всеки purpose има собствен prompt (НЕ общ) и собствена JSON схема. Схемите са
// леки валидатори (без външна библиотека) — проверяват типове и задължителни полета.
// Version/schema_version участват в idempotency ключа (виж pipeline.js).

export const PROMPT_VERSIONS = {
  procedure_analysis: { id: "procedure-analysis-v1", version: "v1", schema: "v1" },
  document_analysis: { id: "document-analysis-v1", version: "v1", schema: "v1" },
  budget_analysis: { id: "budget-analysis-v1", version: "v1", schema: "v1" },
  recommendation: { id: "recommendation-v1", version: "v1", schema: "v1" },
};

const JSON_ONLY = "Върни САМО валиден JSON според схемата. Без markdown, без обяснения извън JSON. Ако липсва информация — използвай null; НЕ измисляй стойности.";

// --- Purpose-specific system prompts (кратки, детерминистични) ---
export const SYSTEM_PROMPTS = {
  procedure_analysis:
    "Ти си анализатор на процедури за европейско/национално финансиране. Структурирай САМО подадената процедура. " + JSON_ONLY,
  document_analysis:
    "Ти класифицираш и извличаш условия от официален документ по процедура. Ако документът е непълен/нечетим — постави requires_review=true и не измисляй съдържание. " + JSON_ONLY,
  budget_analysis:
    "Ти извличаш структуриран бюджет. Разграничавай общ бюджет от помощ на проект; извличай валута и съфинансиране. НЕ сумирай несравними стойности и НЕ измисляй бюджет. " + JSON_ONLY,
  recommendation:
    "Ти обясняваш защо дадена процедура е подходяща за структуриран профил. Ползвай само подадените полета. Не гарантирай допустимост или финансиране. " + JSON_ONLY,
};

// Построява user prompt-а от entity контекста.
export function buildPrompt(purpose, ctx) {
  if (purpose === "procedure_analysis") {
    return `Процедура:\nЗаглавие: ${ctx.name || ""}\nПрограма: ${ctx.program || ""}\nСтатус: ${ctx.status || ""}\nСрок: ${ctx.deadline || ""}\nДопустими: ${ctx.eligible || ""}\nБюджет (текст): ${ctx.budget || ""}\nБележки: ${ctx.notes || ""}\nДържава: ${ctx.country_code || ""}\n\nСхема: { "summary_short": string|null, "summary_long": string|null, "eligible_candidates": string[]|null, "activities": string[]|null, "key_requirements": string[]|null, "deadlines": string[]|null, "regions": string[]|null, "programme": string|null, "changes": string|null, "quality_flags": string[]|null, "confidence": number }`;
  }
  if (purpose === "document_analysis") {
    return `Документ по процедура ${ctx.project_id || ""}:\nЗаглавие: ${ctx.title || ""}\nТип: ${ctx.doc_type || ""}\nТекст (съкратен): ${(ctx.content || "").slice(0, 6000)}\n\nСхема: { "doc_class": string|null, "conditions": string[]|null, "required_attachments": string[]|null, "eligibility_criteria": string[]|null, "key_dates": string[]|null, "version_changes": string|null, "summary": string|null, "requires_review": boolean }`;
  }
  if (purpose === "budget_analysis") {
    return `Бюджет на процедура ${ctx.entity_id || ""}:\nПубликуван текст: ${ctx.budget || ""}\n\nСхема: { "total_budget": number|null, "currency": string|null, "max_per_project": number|null, "min_per_project": number|null, "cofinancing_pct": number|null, "own_contribution_pct": number|null, "components": string[]|null, "conflicts": string[]|null, "eur_normalized": number|null, "flags": string[]|null }`;
  }
  if (purpose === "recommendation") {
    // ВАЖНО: подаваме само неутрални структурирани полета (без имейл/име/Google ID).
    return `Профил (структуриран): държава=${ctx.p_country || ""}, тип=${ctx.p_org_type || ""}, размер=${ctx.p_size || ""}, сектори=${(ctx.p_sectors || []).join(",")}, регион=${ctx.p_region || ""}, бюджет=${ctx.p_budget || ""}\nПроцедура: ${ctx.name || ""} | програма=${ctx.program || ""} | допустими=${ctx.eligible || ""}\n\nСхема: { "match_score": number, "explanation": string, "mismatches": string[]|null }`;
  }
  return "";
}

// --- Леки схема-валидатори: типове + задължителни ключове ---
const T = {
  s: (v) => v == null || typeof v === "string",
  n: (v) => v == null || typeof v === "number",
  b: (v) => typeof v === "boolean",
  sa: (v) => v == null || (Array.isArray(v) && v.every((x) => typeof x === "string")),
};
const SCHEMAS = {
  procedure_analysis: { summary_short: T.s, summary_long: T.s, eligible_candidates: T.sa, activities: T.sa, key_requirements: T.sa, deadlines: T.sa, regions: T.sa, programme: T.s, changes: T.s, quality_flags: T.sa, confidence: T.n },
  document_analysis: { doc_class: T.s, conditions: T.sa, required_attachments: T.sa, eligibility_criteria: T.sa, key_dates: T.sa, version_changes: T.s, summary: T.s, requires_review: T.b },
  budget_analysis: { total_budget: T.n, currency: T.s, max_per_project: T.n, min_per_project: T.n, cofinancing_pct: T.n, own_contribution_pct: T.n, components: T.sa, conflicts: T.sa, eur_normalized: T.n, flags: T.sa },
  recommendation: { match_score: T.n, explanation: T.s, mismatches: T.sa },
};

// Опитва да извади JSON от отговора (толерира ограждащ текст), валидира по схема.
export function parseAndValidate(purpose, text) {
  const schema = SCHEMAS[purpose];
  if (!schema) return { ok: false, error: "no_schema" };
  let obj;
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    obj = JSON.parse(m ? m[0] : text);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  for (const [key, check] of Object.entries(schema)) {
    if (!(key in obj)) { if (key === "requires_review") obj[key] = false; else obj[key] = null; }
    if (!check(obj[key])) return { ok: false, error: "schema_type:" + key };
  }
  return { ok: true, value: obj };
}
