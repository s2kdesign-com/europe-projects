// Документи: нормализация на URL, класификация, дедупликация и версии (v2.52.0).
//
// Правила:
//  • URL-ите се нормализират ПРЕДИ дедупликация (tracking параметрите не правят
//    нов документ);
//  • един документ = един (project_id, normalized_url); нова версия = същият URL
//    с различен checksum;
//  • сканиран PDF без текстов слой НЕ се брои за успешно обработен — OCR е само
//    резервен вариант и се записва в extraction_method.

/** Параметри, които никога не са част от идентичността на документа. */
export const TRACKING_PARAMS = Object.freeze([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "fbclid", "msclkid", "yclid", "mc_cid", "mc_eid", "_ga", "_gl",
  "ref", "referrer", "source", "sessionid", "sid", "phpsessid", "jsessionid",
  "aspxautodetectcookiesupport",
]);

/** Класификация на документите (стабилни ключове за D1 `doc_category`). */
export const DOC_CATEGORIES = Object.freeze([
  "guidelines",        // насоки за кандидатстване
  "call",              // официална покана
  "conditions_apply",  // условия за кандидатстване
  "conditions_exec",   // условия за изпълнение
  "decision",          // заповед / решение
  "application_form",  // формуляр за кандидатстване
  "budget_template",   // бюджетен шаблон
  "financial_annex",   // финансово приложение
  "declaration",       // декларации
  "evaluation_criteria",
  "evaluation_methodology",
  "faq",               // въпроси и отговори
  "clarification",     // разяснения
  "amendment",         // изменения
  "corrigendum",
  "eligible_activities_list",
  "contract_template",
  "annex",
  "presentation",      // презентации от информационни дни
  "other",
]);

/** Категории, които могат да бъдат „основен официален документ". */
export const PRIMARY_CATEGORIES = Object.freeze([
  "guidelines", "conditions_apply", "call", "decision",
]);

/** Категории, които сами по себе си означават промяна в процедурата. */
export const AMENDMENT_CATEGORIES = Object.freeze(["amendment", "corrigendum", "clarification"]);

const RULES = [
  [/(насок|guideline|guide for applicant|ghid(ul)?\s+solicitantului|wytyczne|pokyny|smernice|richtlinie|leitfaden|οδηγ)/i, "guidelines"],
  [/(услови[яе]\s+за\s+кандидатстване|conditions?\s+for\s+appl|conditions?\s+of\s+the\s+call)/i, "conditions_apply"],
  [/(услови[яе]\s+за\s+изпълнение|conditions?\s+for\s+implement|implementation\s+conditions)/i, "conditions_exec"],
  [/(corrigend)/i, "corrigendum"],
  [/(изменени|amendment|modificare|zmiana|änderung|trop)/i, "amendment"],
  [/(разяснени|clarification|clarificari|wyjaśnien)/i, "clarification"],
  [/(въпроси\s+и\s+отговори|\bq\s*&\s*a\b|\bfaq\b|frequently asked)/i, "faq"],
  [/(критерии\s+за\s+оцен|evaluation\s+criteria|selection\s+criteria|kryteria)/i, "evaluation_criteria"],
  [/(методолог|methodolog)/i, "evaluation_methodology"],
  [/(формуляр|application\s+form|формата\s+за\s+кандидат|cerere\s+de\s+finan|wniosek)/i, "application_form"],
  [/(бюджет|budget\s+(template|form|sheet)|buget)/i, "budget_template"],
  [/(финансов[оа]\s+приложение|financial\s+annex|financial\s+plan)/i, "financial_annex"],
  [/(деклараци|declaration|declaratie|oświadcz)/i, "declaration"],
  [/(договор|contract|contract\s+model|umow)/i, "contract_template"],
  [/(заповед|решение|decision|ordin|order\s+no)/i, "decision"],
  [/(покана|call\s+for\s+proposal|apel|nabór|ausschreibung|πρόσκληση)/i, "call"],
  [/(допустими\s+дейности|eligible\s+activities)/i, "eligible_activities_list"],
  [/(презентац|presentation|информационен\s+ден|info\s*day)/i, "presentation"],
  [/(приложение\s*№?\s*\d|annex\s*\d|anexa\s*\d|załącznik)/i, "annex"],
];

/**
 * Нормализира URL за дедупликация:
 *  • маха схемата, `www.`, fragment-а и tracking параметрите;
 *  • подрежда останалите query параметри;
 *  • маха завършващ `/` и свежда host-а до lowercase (path-ът остава чувствителен).
 * При невалиден вход връща trim-нат lowercase низ (по-добре от изключение).
 */
export function normalizeUrl(raw) {
  if (!raw) return null;
  const input = String(raw).trim();
  if (!input) return null;
  let u;
  try {
    u = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    return input.toLowerCase().replace(/#.*$/, "");
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const params = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (TRACKING_PARAMS.includes(k.toLowerCase())) continue;
    params.push([k, v]);
  }
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)));
  const qs = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}` : "";
  let path = u.pathname.replace(/\/+$/, "");
  if (path === "") path = "/";
  const port = u.port && u.port !== "80" && u.port !== "443" ? `:${u.port}` : "";
  return `${host}${port}${path}${qs}`;
}

/** Класифицира документ по заглавие + URL (+ MIME като слаб сигнал). */
export function classifyDocument({ title = "", url = "", mimeType = "" } = {}) {
  const hay = `${title} ${url}`;
  for (const [re, cat] of RULES) if (re.test(hay)) return cat;
  if (/\.(ppt|pptx)(\?|$)/i.test(url) || /presentation/i.test(mimeType)) return "presentation";
  if (/\.(xls|xlsx|csv)(\?|$)/i.test(url) || /spreadsheet/i.test(mimeType)) return "budget_template";
  return "other";
}

export function isPrimaryCategory(cat) { return PRIMARY_CATEGORIES.includes(cat); }
export function isAmendmentCategory(cat) { return AMENDMENT_CATEGORIES.includes(cat); }

/** MIME по разширение — за случаите, когато сървърът не го дава. */
export function guessMimeType(url = "") {
  const m = String(url).toLowerCase().match(/\.([a-z0-9]{2,5})(?:\?|#|$)/);
  const ext = m && m[1];
  return ({
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed",
    odt: "application/vnd.oasis.opendocument.text", txt: "text/plain", html: "text/html", htm: "text/html",
  })[ext] || null;
}

/**
 * Дедупликация на списък с открити документи по нормализиран URL.
 * Запазва първото срещане и събира алтернативните URL-и (за одит).
 */
export function dedupeDocuments(docs = []) {
  const seen = new Map();
  const duplicates = [];
  for (const d of docs) {
    if (!d) continue;
    const norm = normalizeUrl(d.source_url || d.url);
    if (!norm) continue;
    if (seen.has(norm)) {
      seen.get(norm).alternateUrls.push(d.source_url || d.url);
      duplicates.push({ normalized_url: norm, url: d.source_url || d.url });
      continue;
    }
    seen.set(norm, { ...d, normalized_url: norm, alternateUrls: [] });
  }
  return { documents: [...seen.values()], duplicates };
}

/**
 * Решава какво да се направи с входящ документ спрямо вече съществуващия.
 *  'insert'    — няма такъв normalized_url за процедурата
 *  'version'   — има, но checksum-ът е различен → нова версия (старата се пази)
 *  'unchanged' — същият checksum → само last_checked_at
 */
export function classifyIncomingDocument(existing, incoming) {
  if (!existing) return { action: "insert", reason: "new_url" };
  const a = existing.checksum || null;
  const b = incoming && incoming.checksum ? incoming.checksum : null;
  if (!b) return { action: "unchanged", reason: "no_checksum" };
  if (!a) return { action: "version", reason: "checksum_first_seen" };
  if (a === b) return { action: "unchanged", reason: "same_checksum" };
  return { action: "version", reason: "checksum_changed" };
}

/** Стабилен ключ за версия, когато източникът не публикува номер на версия. */
export function versionLabel({ publishedAt = null, checksum = null, index = 0 } = {}) {
  if (publishedAt) return String(publishedAt).slice(0, 10);
  if (checksum) return `sha-${String(checksum).slice(0, 8)}`;
  return `v${index + 1}`;
}

/** Статус на извличането — сканиран PDF без текст НЕ е „complete". */
export function extractionOutcome({ textLength = 0, usedOcr = false, error = null } = {}) {
  if (error) return { extraction_status: "failed", extraction_method: usedOcr ? "ocr" : "text", extraction_error: String(error).slice(0, 500) };
  if (textLength <= 0) {
    return {
      extraction_status: "failed",
      extraction_method: usedOcr ? "ocr" : "text",
      extraction_error: usedOcr ? "OCR не върна текст" : "Няма текстов слой; нужен е OCR",
    };
  }
  if (textLength < 200) {
    return { extraction_status: "partial", extraction_method: usedOcr ? "ocr" : "text", extraction_error: null };
  }
  return { extraction_status: "complete", extraction_method: usedOcr ? "ocr" : "text", extraction_error: null };
}

/** Избира основния официален документ измежду класифицираните. */
export function pickPrimaryDocument(docs = []) {
  const rank = new Map(PRIMARY_CATEGORIES.map((c, i) => [c, i]));
  let best = null;
  for (const d of docs) {
    const cat = d && (d.doc_category || d.category);
    if (!rank.has(cat)) continue;
    if (d.extraction_status === "failed") continue;
    if (!best || rank.get(cat) < rank.get(best.doc_category || best.category)) best = d;
  }
  return best;
}

const documents = {
  TRACKING_PARAMS, DOC_CATEGORIES, PRIMARY_CATEGORIES, AMENDMENT_CATEGORIES,
  normalizeUrl, classifyDocument, isPrimaryCategory, isAmendmentCategory,
  guessMimeType, dedupeDocuments, classifyIncomingDocument, versionLabel,
  extractionOutcome, pickPrimaryDocument,
};
export default documents;
