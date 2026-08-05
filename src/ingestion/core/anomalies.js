// Откриване на аномалии и противоречия в бюджетите (v2.52.0).
//
// Правило номер едно: НЕ смесвай различни видове бюджет. Когато страницата и
// официалният документ се разминават — печели по-новият официален ДОКУМЕНТ,
// двете стойности се записват в anomaly log, процедурата отива за проверка и
// стойностите НИКОГА не се сумират автоматично.

/** Обхвати на бюджета — не се сумират помежду си. */
export const BUDGET_SCOPES = Object.freeze([
  "programme",       // бюджет на цялата програма
  "priority",        // бюджет на приоритет
  "procedure",       // бюджет на процедурата ← това влиза в „Известен публикуван бюджет"
  "per_project",     // максимален бюджет на ЕДИН проект
  "eligible_costs",  // общ размер на допустимите разходи
]);

export const ANOMALY_TYPES = Object.freeze([
  "budget_conflict", "budget_out_of_range", "zero_budget", "duplicate_budget",
  "project_budget_as_total", "currency_mismatch", "invalid_min_max",
  "missing_document", "date_inconsistency", "duplicate_document", "scope_unknown",
]);

/** Над този праг стойността е подозрително голяма за ЕДНА процедура (EUR). */
export const MAX_PLAUSIBLE_PROCEDURE_BUDGET_EUR = 20_000_000_000;
/** Под този праг стойността рядко е бюджет на цяла процедура (EUR). */
export const MIN_PLAUSIBLE_PROCEDURE_BUDGET_EUR = 1_000;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const anomaly = (type, severity, extra = {}) => ({ anomaly_type: type, severity, ...extra });

/**
 * Съгласува бюджет от страница и от документ.
 * Връща { value, currency, source_type, source_url, anomalies[] }.
 * НИКОГА не сумира. При конфликт печели по-новият официален документ.
 */
export function reconcileBudget({ page = null, document = null, tolerance = 0.01 } = {}) {
  const anomalies = [];
  const pv = page && num(page.amount);
  const dv = document && num(document.amount);

  if (pv == null && dv == null) return { value: null, currency: null, source_type: null, source_url: null, anomalies };
  if (pv != null && dv == null) {
    return { value: pv, currency: page.currency || null, source_type: "page", source_url: page.url || null, anomalies };
  }
  if (pv == null && dv != null) {
    return { value: dv, currency: document.currency || null, source_type: "document", source_url: document.url || null, anomalies };
  }

  const differ = pv === 0 ? dv !== 0 : Math.abs(dv - pv) / Math.max(Math.abs(pv), 1) > tolerance;
  if (!differ) {
    return { value: dv, currency: document.currency || page.currency || null, source_type: "document", source_url: document.url || page.url || null, anomalies };
  }

  anomalies.push(anomaly("budget_conflict", "warning", {
    field_name: "budget_amount",
    page_value: String(pv),
    document_value: String(dv),
    observed_value: String(dv),
    expected_value: String(pv),
    source_url: document.url || page.url || null,
    notes: "Страницата и официалният документ дават различни стойности; използва се документът.",
  }));
  // По-новият официален документ печели; ако документът е по-стар от страницата,
  // маркираме за преглед, но пак НЕ сумираме.
  const docNewer = !page.date || !document.date || Date.parse(document.date) >= Date.parse(page.date);
  const chosen = docNewer ? dv : pv;
  return {
    value: chosen,
    currency: (docNewer ? document.currency : page.currency) || null,
    source_type: docNewer ? "document" : "page",
    source_url: (docNewer ? document.url : page.url) || null,
    anomalies,
  };
}

/**
 * Проверки върху един бюджетен запис.
 * p = { budget_amount_eur, budget_currency, budget_scope, min_grant_eur,
 *       max_grant_eur, min_project_size_eur, max_project_size_eur,
 *       min_financing_rate, max_financing_rate, country_currency }
 */
export function detectBudgetAnomalies(p = {}) {
  const out = [];
  const total = num(p.budget_amount_eur);
  const scope = p.budget_scope || null;

  if (total !== null && total === 0) {
    out.push(anomaly("zero_budget", "warning", { field_name: "budget_amount_eur", observed_value: "0" }));
  }
  if (total !== null && total > MAX_PLAUSIBLE_PROCEDURE_BUDGET_EUR) {
    out.push(anomaly("budget_out_of_range", "critical", {
      field_name: "budget_amount_eur", observed_value: String(total),
      notes: `Стойността надхвърля прага от ${MAX_PLAUSIBLE_PROCEDURE_BUDGET_EUR} EUR за една процедура.`,
    }));
  }
  if (total !== null && total > 0 && total < MIN_PLAUSIBLE_PROCEDURE_BUDGET_EUR) {
    out.push(anomaly("budget_out_of_range", "warning", {
      field_name: "budget_amount_eur", observed_value: String(total),
      notes: "Подозрително малка стойност за общ бюджет на процедура.",
    }));
  }
  if (total !== null && scope && scope !== "procedure") {
    out.push(anomaly("project_budget_as_total", "critical", {
      field_name: "budget_scope", observed_value: scope, expected_value: "procedure",
      notes: "В budget_amount_eur влиза САМО бюджет с обхват „procedure\".",
    }));
  }
  if (total !== null && !scope) {
    out.push(anomaly("scope_unknown", "warning", {
      field_name: "budget_scope", observed_value: "null",
      notes: "Липсва обхват на бюджета — не може да се докаже, че е бюджет на процедурата.",
    }));
  }
  // Бюджет на един проект, погрешно записан като общ бюджет.
  const maxGrant = num(p.max_grant_eur);
  if (total !== null && maxGrant !== null && maxGrant > 0 && Math.abs(total - maxGrant) < 1) {
    out.push(anomaly("project_budget_as_total", "warning", {
      field_name: "budget_amount_eur", observed_value: String(total), expected_value: `max_grant_eur=${maxGrant}`,
      notes: "Общият бюджет съвпада с максималната помощ за един проект.",
    }));
  }
  // Невалидни съотношения min/max.
  for (const [lo, hi, name] of [
    [num(p.min_grant_eur), num(p.max_grant_eur), "grant"],
    [num(p.min_project_size_eur), num(p.max_project_size_eur), "project_size"],
    [num(p.min_financing_rate), num(p.max_financing_rate), "financing_rate"],
  ]) {
    if (lo !== null && hi !== null && lo > hi) {
      out.push(anomaly("invalid_min_max", "warning", {
        field_name: name, observed_value: `min=${lo}, max=${hi}`,
        notes: "Минималната стойност е по-голяма от максималната.",
      }));
    }
  }
  const rate = num(p.max_financing_rate);
  if (rate !== null && (rate < 0 || rate > 1)) {
    out.push(anomaly("invalid_min_max", "warning", {
      field_name: "max_financing_rate", observed_value: String(rate),
      notes: "Процентът на финансиране се записва като част от 1 (0..1).",
    }));
  }
  // Валута, която не съответства на държавата.
  const cur = p.budget_currency ? String(p.budget_currency).toUpperCase() : null;
  const countryCur = p.country_currency ? String(p.country_currency).toUpperCase() : null;
  if (cur && countryCur && cur !== "EUR" && cur !== countryCur) {
    out.push(anomaly("currency_mismatch", "warning", {
      field_name: "budget_currency", observed_value: cur, expected_value: `${countryCur} или EUR`,
    }));
  }
  return out;
}

/** Под този праг съвпадението между държави е твърде вероятно да е случайно. */
export const DUPLICATE_BUDGET_MIN_EUR = 1_000_000;
/** Кратните на тази стъпка са „кръгли" суми — те се повтарят естествено. */
export const DUPLICATE_BUDGET_ROUNDING_STEP = 100_000;

/** Кръгла ли е сумата (точно кратна на стъпката)? */
export function isRoundAmount(v, step = DUPLICATE_BUDGET_ROUNDING_STEP) {
  const n = num(v);
  if (n === null || step <= 0) return false;
  return Math.abs(n % step) < 0.005;
}

/**
 * Дублирани еднакви бюджети между РАЗЛИЧНИ държави — сигнал за грешка при копиране.
 * rows = [{ project_id, country_code, budget_amount_eur }].
 *
 * ВАЖНО (мерено срещу продукцията): при праг 1 000 EUR правилото дава 57 групи, почти
 * всички кръгли числа (200 000 в 5 държави е нормално — това е типичен максимален
 * размер на помощта, а не копиран бюджет). При праг 1 млн + изключване на кръглите
 * остават 3 групи — това е реалният сигнал. Затова прагът НЕ е общият минимум за
 * правдоподобен бюджет.
 */
export function detectCrossCountryDuplicateBudgets(rows = [], {
  minAmount = DUPLICATE_BUDGET_MIN_EUR,
  roundingStep = DUPLICATE_BUDGET_ROUNDING_STEP,
} = {}) {
  const byAmount = new Map();
  for (const r of rows) {
    const v = num(r && r.budget_amount_eur);
    if (v === null || v < minAmount) continue;
    if (isRoundAmount(v, roundingStep)) continue;   // кръглите съвпадения са очаквани
    const key = v.toFixed(2);
    if (!byAmount.has(key)) byAmount.set(key, []);
    byAmount.get(key).push(r);
  }
  const out = [];
  for (const [key, group] of byAmount) {
    const countries = new Set(group.map((g) => g.country_code));
    if (countries.size > 1) {
      for (const g of group) {
        out.push(anomaly("duplicate_budget", "warning", {
          project_id: g.project_id, country_code: g.country_code,
          field_name: "budget_amount_eur", observed_value: key,
          notes: `Същата стойност се среща в ${countries.size} различни държави (${[...countries].sort().join(", ")}).`,
        }));
      }
    }
  }
  return out;
}

/** Логически проверки на датите. */
export function detectDateAnomalies(p = {}) {
  const out = [];
  const parse = (v) => (v ? Date.parse(v) : NaN);
  const pairs = [
    ["publication_date", "opening_date"],
    ["opening_date", "deadline_date"],
    ["questions_deadline", "deadline_date"],
    ["cost_eligibility_start", "cost_eligibility_end"],
  ];
  for (const [a, bb] of pairs) {
    const va = parse(p[a]); const vb = parse(p[bb]);
    if (Number.isFinite(va) && Number.isFinite(vb) && va > vb) {
      out.push(anomaly("date_inconsistency", "warning", {
        field_name: `${a} > ${bb}`, observed_value: `${p[a]} > ${p[bb]}`,
      }));
    }
  }
  return out;
}

/** Всички проверки за една процедура наведнъж. */
export function detectAll(p = {}) {
  return [...detectBudgetAnomalies(p), ...detectDateAnomalies(p)];
}

/** Има ли аномалия, която задължително праща процедурата в pending_review? */
export function requiresReview(anomalies = []) {
  return anomalies.some((a) => a && (a.severity === "critical" || a.anomaly_type === "budget_conflict"));
}

const anomalies = {
  BUDGET_SCOPES, ANOMALY_TYPES, DUPLICATE_BUDGET_MIN_EUR, DUPLICATE_BUDGET_ROUNDING_STEP,
  reconcileBudget, detectBudgetAnomalies, isRoundAmount,
  detectCrossCountryDuplicateBudgets, detectDateAnomalies, detectAll, requiresReview,
};
export default anomalies;
