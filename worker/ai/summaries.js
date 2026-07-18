// Детерминистични резултатни резюмета за AI изпълненията. summary се строи от
// РЕАЛНИ метрики (брой обработени/промени/предупреждения), НЕ е свободен текст от
// модела. Чисти функции → директно тестируеми. Безопасен redaction за details.

const PURPOSE_VERB = {
  procedure_analysis: { verb: "Анализира", unit: "процедури" },
  document_analysis: { verb: "Прегледа", unit: "документа" },
  budget_analysis: { verb: "Структурира", unit: "бюджета" },
  recommendation: { verb: "Обнови", unit: "препоръки" },
  daily_review: { verb: "Провери", unit: "записа" },
};

// Кратко човешко резюме от реалните метрики.
export function buildResultSummary(purpose, m = {}) {
  const p = PURPOSE_VERB[purpose] || { verb: "Обработи", unit: "записа" };
  if (m.status === "failed" || m.status === "error") {
    return "Неуспешно: " + (m.safeError || "временна грешка от доставчика");
  }
  if (m.status === "skipped_unchanged" || (m.processed === 0 && (m.skipped || 0) > 0)) {
    return "Пропуснато: няма нови или променени записи";
  }
  const processed = m.processed ?? m.entityCount ?? 0;
  const requested = m.requested ?? processed;
  const parts = [];
  if (m.status === "partial" && requested && processed < requested) {
    parts.push(`Обработи ${processed} от ${requested} ${p.unit}`);
    if (m.failed) parts.push(`${m.failed} неуспешни`);
    return parts.join(" · ");
  }
  parts.push(`${p.verb} ${processed} ${p.unit}`);
  if (purpose === "recommendation" && m.profiles) parts[0] = `Обнови ${processed} препоръки за ${m.profiles} профила`;
  if (m.changes) parts.push(`откри ${m.changes} промени`);
  if (m.requiresReview) parts.push(`${m.requiresReview} изисква проверка`);
  if (m.warnings) parts.push(`${m.warnings} предупреждения`);
  if (m.conflicts) parts.push(`${m.conflicts} противоречия`);
  if (parts.length === 1 && purpose === "budget_analysis") parts.push("няма открити проблеми");
  return parts.join(" · ");
}

// Безопасни полета, които НИКОГА не влизат в details (redaction).
const FORBIDDEN = /(api[_-]?key|authorization|secret|prompt|reasoning|chain[_-]?of[_-]?thought|email|google[_-]?id|session|password|token)/i;
export function redactObject(obj, depth = 0) {
  if (depth > 6 || obj == null) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 50).map((x) => redactObject(x, depth + 1));
  if (typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (FORBIDDEN.test(k)) continue; // изхвърляме забранените ключове
      out[k] = redactObject(v, depth + 1);
    }
    return out;
  }
  if (typeof obj === "string" && obj.length > 500) return obj.slice(0, 500) + "…";
  return obj;
}

// Строи safe result_details_json (ограничен размер: агрегати + първите N детайла).
export function buildResultDetails(purpose, ctx) {
  const {
    summary, scope = {}, results = {}, items = [], quality = {}, execution = {}, warnings = [], safeErrors = [],
  } = ctx;
  const details = {
    summary,
    purpose,
    scope: {
      countryCode: scope.countryCode || null,
      entityType: scope.entityType || null,
      requested: scope.requested ?? null,
      processed: scope.processed ?? null,
      completed: scope.completed ?? null,
      failed: scope.failed ?? null,
      skipped: scope.skipped ?? null,
    },
    results: {
      newRecords: results.newRecords ?? null,
      updatedRecords: results.updatedRecords ?? null,
      unchangedRecords: results.unchangedRecords ?? null,
      warnings: results.warnings ?? null,
      requiresReview: results.requiresReview ?? null,
    },
    items: (items || []).slice(0, 20).map((it) => redactObject({
      entityId: it.entityId, entityType: it.entityType, title: (it.title || "").slice(0, 120),
      countryCode: it.countryCode, status: it.status, summary: (it.summary || "").slice(0, 200),
      changedFields: it.changedFields, requiresReview: !!it.requiresReview,
    })),
    itemsTruncated: (items || []).length > 20,
    quality: { valid: quality.valid ?? null, invalid: quality.invalid ?? null, averageConfidence: quality.averageConfidence ?? null },
    execution: {
      provider: execution.provider || null, modelId: execution.modelId || null,
      promptVersion: execution.promptVersion || null, schemaVersion: execution.schemaVersion || null,
      durationMs: execution.durationMs ?? null, inputTokens: execution.inputTokens ?? null,
      outputTokens: execution.outputTokens ?? null, cachedInputTokens: execution.cachedInputTokens ?? null,
      requestCount: execution.requestCount ?? null, retryCount: execution.retryCount ?? null,
      fallbackModel: execution.fallbackModel || null,
    },
    warnings: (warnings || []).slice(0, 20).map((w) => String(w).slice(0, 200)),
    safeErrors: (safeErrors || []).slice(0, 20).map((e) => String(e).slice(0, 200)),
  };
  // Твърд лимит на размера (защита срещу гигантски JSON).
  let json = JSON.stringify(details);
  if (json.length > 20000) { details.items = details.items.slice(0, 5); details.itemsTruncated = true; json = JSON.stringify(details); }
  return { object: details, json };
}
