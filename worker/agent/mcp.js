// MCP сървър (Model Context Protocol) — Streamable HTTP транспорт, САМО ЗА ЧЕТЕНЕ,
// плюс MCP Server Card на `/.well-known/mcp/server-card.json` (SEP-1649/SEP-2127,
// още в проект: github.com/modelcontextprotocol/modelcontextprotocol/pull/2127).
//
// Защо сървър, а не само карта: картата е указател към транспортен endpoint. Карта,
// която сочи към несъществуващ `/mcp`, минава скенера, но всеки истински агент, който
// я прочете и се свърже, получава 404. Затова тук има работещ сървър, а картата само
// го описва.
//
// Три решения, които държат този модул:
//
// 1. **Без състояние (stateless).** НЕ издаваме `Mcp-Session-Id`. Worker-ите нямат
//    споделена памет между изолатите — сесия щеше да значи D1 запис на всяка заявка
//    без никаква полза: всички наши инструменти са чисти четения без контекст.
//    Спецификацията позволява сървър без сесии.
//
// 2. **Без SSE.** Всеки отговор е един JSON. `GET /mcp` с `Accept: text/event-stream`
//    връща 405, както изисква спецификацията, когато сървърът не предлага поток.
//    (GET без този Accept НЕ е валиден MCP клиент — на него връщаме кратък JSON
//    указател към картата, за да не изглежда endpoint-ът счупен в браузър/скенер.)
//
// 3. **Само за четене.** Няма нито един инструмент, който пише. Няма достъп до
//    `/api/admin/*`, до профили или до запазени процедури — за лични данни се минава
//    през OAuth 2.1 (виж `oauth-server.js` и `/auth.md`), не оттук.

import { codeSlug } from "../../app/lib/slug.js";

const SITE = "https://euro-funds.eu";
const BRAND = "Euro-Funding";

export const MCP_PATH = "/mcp";
export const SERVER_CARD_PATH = "/.well-known/mcp/server-card.json";

// Име в reverse-DNS вид, както иска регистърът на MCP.
export const SERVER_NAME = "eu.euro-funds/euro-funding";
export const SERVER_TITLE = BRAND;

// Версия на протокола, която предпочитаме, и всички, които приемаме при
// договаряне. Редът има значение — първата е нашата.
export const PROTOCOL_VERSION = "2025-06-18";
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const SERVER_DESCRIPTION =
  "Read-only access to European and national funding procedures across the 27 EU member states: " +
  "search procedures, read one with its documents, list covered countries and their official sources, " +
  "and read the latest published coverage statistics. Public data, no credential required.";

// Текстът се дава на клиента при initialize. Тук влизат само нещата, които агент
// НЯМА как да отгатне от схемите — иначе е шум.
const INSTRUCTIONS = [
  `${BRAND} (${SITE}) tracks funding procedures across the 27 EU member states, compiled from official national and EU sources.`,
  "",
  "Four things that are easy to get wrong:",
  "- `budget_amount_eur: null` means the source published no parseable figure. It does NOT mean zero. Never sum without excluding nulls.",
  "- `deadline_date: null` does NOT mean 'no deadline'. Fall back to the free-text `deadline` and quote it verbatim.",
  "- `status` reflects the last sync, not this second. For anything the user will act on, link `official_url` and say when it was last synced.",
  "- The web URL is not the raw `id`. Each result carries a ready `url` field — use it.",
  "",
  "Attribute figures to " + BRAND + " and link `official_url` alongside. This data does not replace the official procedure documentation.",
  `Terms: ${SITE}/terms`,
].join("\n");

// ---------------------------------------------------------------------------
// JSON-RPC 2.0
// ---------------------------------------------------------------------------

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message, data) => {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id: id === undefined ? null : id, error };
};

// ---------------------------------------------------------------------------
// Инструменти
// ---------------------------------------------------------------------------

const COUNTRY_SCHEMA = {
  type: "string",
  pattern: "^[A-Za-z]{2}$",
  description: "ISO 3166-1 alpha-2 country code. Defaults to BG.",
};

// `readOnlyHint` не е декорация: това е обещанието на този сървър и клиентите го
// показват на потребителя, преди да разрешат извикване.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: "search_procedures",
    title: "Search funding procedures",
    description:
      "Search funding procedures for one country. Filter by free text, status and programme. " +
      "Returns the fields an agent needs to answer without a second call, plus the page URL for each result.",
    inputSchema: {
      type: "object",
      properties: {
        country: COUNTRY_SCHEMA,
        query: { type: "string", description: "Free text matched against the title, programme and eligible-applicants text.", maxLength: 200 },
        status: { type: "string", enum: ["open", "closing_soon", "upcoming", "closed"], description: "Status as of the last sync." },
        program: { type: "string", description: "Operational programme name (exact match).", maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      additionalProperties: false,
    },
    annotations: { ...READ_ONLY, title: "Search funding procedures" },
  },
  {
    name: "get_procedure",
    title: "Read one procedure",
    description:
      "Read a single procedure with its documents. Accepts either the raw procedure id or the URL slug. " +
      "Document `content` is a markdown summary, not the document itself — send users to `source_url` for the real guidelines.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Procedure id (e.g. BG05SFPR001-2.005) or the URL slug.", minLength: 1, maxLength: 300 },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { ...READ_ONLY, title: "Read one procedure" },
  },
  {
    name: "list_countries",
    title: "List covered countries",
    description:
      "List the 27 EU member states with their coverage status, currency, source counts and last successful sync. " +
      "Call this before assuming a country has usable data.",
    inputSchema: {
      type: "object",
      properties: {
        enabledOnly: { type: "boolean", default: false, description: "Return only countries that passed QA and are switched on." },
      },
      additionalProperties: false,
    },
    annotations: { ...READ_ONLY, title: "List covered countries" },
  },
  {
    name: "list_sources",
    title: "List official sources",
    description: "The official national and EU sources a country's procedures are compiled from, with their health and last check.",
    inputSchema: {
      type: "object",
      properties: { country: COUNTRY_SCHEMA },
      additionalProperties: false,
    },
    annotations: { ...READ_ONLY, title: "List official sources" },
  },
  {
    name: "platform_statistics",
    title: "Coverage statistics",
    description:
      "The latest published daily snapshot: procedure counts, document and budget coverage per country. " +
      "Budget totals cover only procedures with a validated procedure-level figure — `budgetProcedureCount` says how many that is.",
    inputSchema: {
      type: "object",
      properties: { country: COUNTRY_SCHEMA },
      additionalProperties: false,
    },
    annotations: { ...READ_ONLY, title: "Coverage statistics" },
  },
];

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

// ---------------------------------------------------------------------------
// Помощни
// ---------------------------------------------------------------------------

class ToolError extends Error {}

function askedCountry(args, field = "country") {
  const raw = args[field];
  if (raw == null || raw === "") return "BG";
  const s = String(raw).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) throw new ToolError(`\`${field}\` must be an ISO 3166-1 alpha-2 code, got: ${String(raw).slice(0, 20)}`);
  return s;
}

/** Екранира LIKE метасимволите, за да не се превърне потребителски текст в шаблон. */
function likeTerm(q) {
  return `%${String(q).replace(/[\\%_]/g, (m) => "\\" + m)}%`;
}

const PROC_COLUMNS =
  "id, name, program, priority, category, status, deadline, deadline_date, budget, budget_amount_eur, " +
  "eligible, country_code, official_url, link, managing_authority, original_language, first_seen, last_updated";

/** Един ред процедура → обект за агента, с готов адрес на страницата. */
function procedureOut(p) {
  return {
    id: p.id,
    name: p.name,
    url: `${SITE}/procedures/${codeSlug(p.id)}`,
    country_code: p.country_code,
    status: p.status,
    program: p.program,
    priority: p.priority,
    deadline: p.deadline,
    deadline_date: p.deadline_date,
    budget: p.budget,
    budget_amount_eur: p.budget_amount_eur == null ? null : p.budget_amount_eur,
    eligible: p.eligible,
    official_url: p.official_url || p.link || null,
    managing_authority: p.managing_authority,
    original_language: p.original_language,
    first_seen: p.first_seen,
    last_updated: p.last_updated,
  };
}

const STATUS_ORDER = "CASE status WHEN 'closing_soon' THEN 0 WHEN 'open' THEN 1 WHEN 'upcoming' THEN 2 ELSE 3 END";

async function db(env) {
  if (!env || !env.DB) throw new ToolError("The database is not reachable right now. Try again shortly; see " + SITE + "/api/health.");
  return env.DB;
}

// ---------------------------------------------------------------------------
// Изпълнение на инструментите
// ---------------------------------------------------------------------------

const IMPL = {
  async search_procedures(args, env) {
    const DB = await db(env);
    const country = askedCountry(args);
    const limitRaw = args.limit == null ? 25 : Number(args.limit);
    if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) throw new ToolError("`limit` must be an integer between 1 and 100.");

    const where = ["country_code = ?1"];
    const binds = [country];
    const next = () => `?${binds.length + 1}`;

    if (args.status != null && args.status !== "") {
      const st = String(args.status);
      if (!["open", "closing_soon", "upcoming", "closed"].includes(st)) {
        throw new ToolError("`status` must be one of: open, closing_soon, upcoming, closed.");
      }
      where.push(`status = ${next()}`);
      binds.push(st);
    }
    if (args.program != null && args.program !== "") {
      where.push(`program = ${next()}`);
      binds.push(String(args.program));
    }
    if (args.query != null && String(args.query).trim() !== "") {
      const term = likeTerm(String(args.query).trim());
      const a = next(); binds.push(term);
      const b = next(); binds.push(term);
      const c = next(); binds.push(term);
      where.push(`(name LIKE ${a} ESCAPE '\\' OR program LIKE ${b} ESCAPE '\\' OR eligible LIKE ${c} ESCAPE '\\')`);
    }

    const clause = where.join(" AND ");
    const total = await DB.prepare(`SELECT COUNT(*) AS n FROM projects WHERE ${clause}`).bind(...binds).first();
    const lim = next(); binds.push(limitRaw);
    const { results } = await DB.prepare(
      `SELECT ${PROC_COLUMNS} FROM projects WHERE ${clause} ORDER BY ${STATUS_ORDER}, deadline_date LIMIT ${lim}`
    ).bind(...binds).all();

    const rows = results || [];
    const matched = total ? total.n : rows.length;
    return {
      country,
      matched,
      returned: rows.length,
      truncated: matched > rows.length,
      procedures: rows.map(procedureOut),
      note: "`status` is as of the last sync. `budget_amount_eur: null` means no parseable figure was published, not zero.",
    };
  },

  async get_procedure(args, env) {
    const DB = await db(env);
    const raw = String(args.id == null ? "" : args.id).trim();
    if (!raw) throw new ToolError("`id` is required.");

    let p = await DB.prepare(`SELECT ${PROC_COLUMNS} FROM projects WHERE id = ?1`).bind(raw).first();
    if (!p) p = await DB.prepare(`SELECT ${PROC_COLUMNS} FROM projects WHERE id = ?1`).bind(raw.toUpperCase()).first();
    if (!p) {
      // Подаден е URL slug. Кодът е в началото му, а самите id-та са малко на брой —
      // сравняваме нормализирания код, както прави и страницата на процедурата.
      const s = raw.toLowerCase();
      const all = await DB.prepare("SELECT id FROM projects").all();
      const hit = (all.results || []).find((r) => {
        const cs = codeSlug(r.id);
        return cs && (s === cs || s.startsWith(cs + "-"));
      });
      if (hit) p = await DB.prepare(`SELECT ${PROC_COLUMNS} FROM projects WHERE id = ?1`).bind(hit.id).first();
    }
    if (!p) throw new ToolError(`No procedure matches \`${raw.slice(0, 120)}\`. Use search_procedures to find the right id.`);

    const docs = await DB.prepare(
      "SELECT id, title, doc_type, content, source_url FROM documents WHERE project_id = ?1 ORDER BY id"
    ).bind(p.id).all();

    return {
      procedure: procedureOut(p),
      documents: (docs.results || []).map((d) => ({
        id: d.id,
        title: d.title,
        doc_type: d.doc_type,
        source_url: d.source_url,
        summary: d.content,
      })),
      note: "Document `summary` is a markdown summary produced from the document, not the document itself. Send users to `source_url` for the official text.",
    };
  },

  async list_countries(args, env) {
    const DB = await db(env);
    const onlyEnabled = args.enabledOnly === true;
    const sql =
      "SELECT code, slug, name_bg, native_name, english_name, default_language, currency_code, enabled, " +
      "coverage_status, ingestion_status, source_count, active_source_count, last_successful_sync_at " +
      "FROM countries" + (onlyEnabled ? " WHERE enabled=1" : "") + " ORDER BY priority";
    const { results } = await DB.prepare(sql).all();
    const rows = results || [];
    return {
      count: rows.length,
      enabledOnly: onlyEnabled,
      countries: rows.map((c) => ({
        code: c.code,
        slug: c.slug,
        name: c.native_name || c.english_name || c.name_bg,
        englishName: c.english_name,
        nativeName: c.native_name,
        defaultLanguage: c.default_language,
        currency: c.currency_code,
        enabled: !!c.enabled,
        coverageStatus: c.coverage_status,
        ingestionStatus: c.ingestion_status,
        sources: c.source_count,
        activeSources: c.active_source_count,
        lastSuccessfulSyncAt: c.last_successful_sync_at,
        url: c.slug ? `${SITE}/procedures?country=${c.code}` : null,
      })),
      note: "`enabled: false` means the country has not passed QA yet — treat its data as incomplete.",
    };
  },

  async list_sources(args, env) {
    const DB = await db(env);
    const country = askedCountry(args);
    const { results } = await DB.prepare(
      "SELECT id, name, authority_name, authority_type, base_url, calls_url, programmes_url, source_type, source_level, " +
      "official, primary_source, coverage_description, source_language, update_frequency, verified, source_health, " +
      "last_success_at, last_checked_at FROM funding_sources WHERE country_code = ?1 ORDER BY priority"
    ).bind(country).all();
    const rows = results || [];
    return {
      country,
      count: rows.length,
      sources: rows.map((s) => ({
        id: s.id,
        name: s.name,
        authority: s.authority_name,
        authorityType: s.authority_type,
        url: s.base_url,
        callsUrl: s.calls_url,
        programmesUrl: s.programmes_url,
        type: s.source_type,
        level: s.source_level,
        official: !!s.official,
        primary: !!s.primary_source,
        coverage: s.coverage_description,
        language: s.source_language,
        updateFrequency: s.update_frequency,
        verified: !!s.verified,
        health: s.source_health,
        lastSuccessAt: s.last_success_at,
        lastCheckedAt: s.last_checked_at,
      })),
    };
  },

  async platform_statistics(args, env) {
    const DB = await db(env);
    const country = args.country == null || args.country === "" ? null : askedCountry(args);

    const last = await DB.prepare(
      "SELECT MAX(snapshot_date) AS d FROM country_daily_statistics WHERE publish_status='published'"
    ).first();
    const date = last && last.d;
    if (!date) {
      return { generatedAt: null, countries: [], totals: null, note: "No published snapshot yet — no numbers are reported rather than guessed." };
    }

    const sql =
      "SELECT s.country_code, s.total_procedures, s.active_procedures, s.upcoming_procedures, s.closed_procedures, " +
      "s.procedures_with_documents, s.published_budget_eur, s.budget_procedure_count, s.active_sources, " +
      "s.average_quality_score, s.last_successful_sync_at, s.coverage_status, " +
      "c.native_name, c.english_name, c.enabled " +
      "FROM country_daily_statistics s JOIN countries c ON c.code = s.country_code " +
      "WHERE s.snapshot_date = ?1 AND s.publish_status='published'" +
      (country ? " AND s.country_code = ?2" : "") +
      " ORDER BY c.priority";
    const stmt = country ? DB.prepare(sql).bind(date, country) : DB.prepare(sql).bind(date);
    const { results } = await stmt.all();
    const rows = results || [];

    const pct = (part, whole) => (whole > 0 ? Math.round(((part || 0) / whole) * 1000) / 10 : null);
    const countries = rows.map((r) => ({
      code: r.country_code,
      name: r.native_name || r.english_name,
      enabled: !!r.enabled,
      coverageStatus: r.coverage_status,
      totalProcedures: r.total_procedures,
      activeProcedures: r.active_procedures,
      upcomingProcedures: r.upcoming_procedures,
      closedProcedures: r.closed_procedures,
      proceduresWithDocuments: r.procedures_with_documents,
      documentCoveragePercent: pct(r.procedures_with_documents, r.total_procedures),
      publishedBudgetEur: r.published_budget_eur,
      budgetProcedureCount: r.budget_procedure_count,
      budgetCoveragePercent: pct(r.budget_procedure_count, r.total_procedures),
      averageQualityScore: r.average_quality_score,
      activeSources: r.active_sources,
      lastSuccessfulSyncAt: r.last_successful_sync_at,
    }));

    const sum = (f) => countries.reduce((a, c) => a + (c[f] || 0), 0);
    const totalProcedures = sum("totalProcedures");
    return {
      generatedAt: date,
      countries,
      totals: {
        countries: countries.length,
        totalProcedures,
        activeProcedures: sum("activeProcedures"),
        proceduresWithDocuments: sum("proceduresWithDocuments"),
        publishedBudgetEur: sum("publishedBudgetEur"),
        budgetProcedureCount: sum("budgetProcedureCount"),
        budgetCoveragePercent: pct(sum("budgetProcedureCount"), totalProcedures),
      },
      note:
        "`publishedBudgetEur` covers only the `budgetProcedureCount` procedures with a validated procedure-level figure. " +
        "It is not the total value of all procedures, and programme or per-project ceilings are deliberately excluded.",
    };
  },
};

/** Извиква инструмент. Грешките в данните стават `isError`, не протоколна грешка. */
export async function callTool(name, args, env) {
  const impl = IMPL[name];
  if (!impl) throw new ToolError(`Unknown tool: ${name}`);
  return impl(args && typeof args === "object" ? args : {}, env);
}

// ---------------------------------------------------------------------------
// Server Card
// ---------------------------------------------------------------------------

/**
 * Документът на `/.well-known/mcp/server-card.json`.
 *
 * Спецификацията е още в проект и се движи, затова картата носи И двата
 * установили се начина да се посочи транспортът: `url` на най-горно ниво
 * (както го чете скенерът на isitagentready.com) и `transport.endpoint`
 * (както е в по-новите чернови). Нарочно НЯМА `$schema`: единствената
 * публикувана схема още се мести, а строг валидатор, който я тегли, би се
 * счупил при първото ѝ преместване.
 */
export function serverCardDocument(version = "0.0.0", origin = SITE) {
  const endpoint = `${origin}${MCP_PATH}`;
  return {
    name: SERVER_NAME,
    title: SERVER_TITLE,
    description: SERVER_DESCRIPTION,
    version,
    websiteUrl: origin,
    documentationUrl: `${origin}/docs/api`,

    serverInfo: { name: SERVER_NAME, title: SERVER_TITLE, version },

    url: endpoint,
    transport: { type: "streamable-http", endpoint },
    remotes: [{ type: "streamable-http", url: endpoint }],

    protocolVersion: PROTOCOL_VERSION,
    supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,

    capabilities: { tools: { listChanged: false } },

    // Изброяването на инструменти е спорно в спецификацията (истината е `tools/list`),
    // но е полезно преди свързване. Държим само име и описание — сигнатурите идват
    // от протокола, за да не се разминат.
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),

    authentication: { type: "none", note: "Public data. Personal data is not exposed over MCP — see /auth.md and the OAuth 2.1 server." },

    _meta: {
      "eu.euro-funds/server": {
        readOnly: true,
        writeOperations: 0,
        specification: "https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127",
        sessions: false,
        streaming: false,
        discovery: {
          agentIndex: `${origin}/.well-known/agent-index.json`,
          agentSkills: `${origin}/.well-known/agent-skills/index.json`,
          apiCatalog: `${origin}/.well-known/api-catalog`,
          openapi: `${origin}/openapi.json`,
          llmsTxt: `${origin}/llms.txt`,
          authMd: `${origin}/auth.md`,
          health: `${origin}/api/health`,
        },
        termsOfService: `${origin}/terms`,
        privacyPolicy: `${origin}/privacy`,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Обработка на JSON-RPC съобщения
// ---------------------------------------------------------------------------

function negotiateProtocol(requested) {
  const want = typeof requested === "string" ? requested : null;
  if (want && SUPPORTED_PROTOCOL_VERSIONS.includes(want)) return want;
  return PROTOCOL_VERSION;
}

/** Обработва едно JSON-RPC съобщение. Връща отговор или null (за нотификация). */
async function handleMessage(msg, env, version) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return rpcError(null, INVALID_REQUEST, "Each message must be a JSON-RPC 2.0 object.");
  }
  if (msg.jsonrpc !== "2.0") {
    return rpcError(msg.id, INVALID_REQUEST, 'Missing or wrong "jsonrpc" field; it must be exactly "2.0".');
  }
  const method = typeof msg.method === "string" ? msg.method : null;
  if (!method) return rpcError(msg.id, INVALID_REQUEST, 'Missing "method".');

  const isNotification = msg.id === undefined || msg.id === null;
  const params = msg.params && typeof msg.params === "object" ? msg.params : {};

  // Нотификации: нямат отговор изобщо. Непознатата нотификация се игнорира —
  // така е по спецификация и пази клиента от излишни грешки.
  if (isNotification) {
    return null;
  }

  switch (method) {
    case "initialize":
      return rpcResult(msg.id, {
        protocolVersion: negotiateProtocol(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, title: SERVER_TITLE, version },
        instructions: INSTRUCTIONS,
      });

    case "ping":
      return rpcResult(msg.id, {});

    case "tools/list":
      // Всички инструменти се събират в един отговор — няма нужда от cursor.
      return rpcResult(msg.id, { tools: TOOLS });

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      if (!TOOL_NAMES.has(name)) {
        return rpcError(msg.id, INVALID_PARAMS, `Unknown tool: ${name || "(missing)"}`, {
          available: [...TOOL_NAMES],
        });
      }
      try {
        const data = await callTool(name, params.arguments, env);
        return rpcResult(msg.id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          isError: false,
        });
      } catch (e) {
        // Провалът НА ИНСТРУМЕНТА не е провал на протокола: връща се като резултат
        // с `isError`, за да може моделът да го прочете и да се коригира сам.
        const text = e instanceof ToolError ? e.message : "The tool failed unexpectedly. Nothing was changed — this server is read-only.";
        return rpcResult(msg.id, { content: [{ type: "text", text }], isError: true });
      }
    }

    // Не декларираме тези способности, затова методите им не съществуват.
    case "resources/list":
    case "resources/read":
    case "resources/templates/list":
    case "prompts/list":
    case "prompts/get":
    case "completion/complete":
    case "logging/setLevel":
      return rpcError(msg.id, METHOD_NOT_FOUND, `This server declares only the "tools" capability; "${method}" is not available.`);

    default:
      return rpcError(msg.id, METHOD_NOT_FOUND, `Unknown method: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP слой
// ---------------------------------------------------------------------------

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id, authorization",
  "access-control-expose-headers": "mcp-protocol-version",
  "access-control-max-age": "86400",
};

const RPC_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  ...CORS,
};

const CARD_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=3600",
  "x-content-type-options": "nosniff",
  "access-control-allow-origin": "*",
};

const rpc = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...RPC_HEADERS, "mcp-protocol-version": PROTOCOL_VERSION } });

/**
 * Рутер за `/mcp` и `/.well-known/mcp/server-card.json`. Връща null за всичко
 * останало, за да продължи основният рутер.
 */
export async function handleMcp(request, env, url, version = "0.0.0") {
  const { pathname } = url;

  // --- Картата -------------------------------------------------------------
  if (pathname === SERVER_CARD_PATH) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { allow: "GET, HEAD", ...CORS } });
    }
    const doc = serverCardDocument(version, SITE);
    return new Response(JSON.stringify(doc, null, 2), { status: 200, headers: CARD_HEADERS });
  }

  if (pathname !== MCP_PATH) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Спецификацията: GET на MCP endpoint-а е за SSE поток. Ние не предлагаме такъв.
  if (request.method === "GET" || request.method === "HEAD") {
    const accept = request.headers.get("accept") || "";
    if (/text\/event-stream/i.test(accept)) {
      return new Response(
        JSON.stringify({ error: "sse_not_supported", error_description: "This server returns a single JSON response per POST and offers no server-initiated stream." }),
        { status: 405, headers: { ...RPC_HEADERS, allow: "POST, OPTIONS" } }
      );
    }
    // Не-SSE GET не идва от MCP клиент (спецификацията изисква този Accept), а от
    // браузър или скенер. По-полезно е да види указател, отколкото гол 405.
    return new Response(
      JSON.stringify({
        transport: "streamable-http",
        method: "POST",
        endpoint: `${SITE}${MCP_PATH}`,
        protocolVersion: PROTOCOL_VERSION,
        supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
        serverCard: `${SITE}${SERVER_CARD_PATH}`,
        documentation: `${SITE}/docs/api`,
        readOnly: true,
      }, null, 2),
      { status: 200, headers: { ...RPC_HEADERS, "cache-control": "public, max-age=300" } }
    );
  }

  // Няма сесии → няма какво да се прекратява.
  if (request.method === "DELETE") {
    return new Response(null, { status: 405, headers: { allow: "POST, GET, OPTIONS", ...CORS } });
  }

  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST, GET, DELETE, OPTIONS", ...CORS } });
  }

  // Ако клиентът обяви версия на протокола, тя трябва да е такава, която можем.
  // Мълчаливото приемане на непозната версия води до тихи разминавания по-нататък.
  const declared = request.headers.get("mcp-protocol-version");
  if (declared && !SUPPORTED_PROTOCOL_VERSIONS.includes(declared)) {
    return rpc(rpcError(null, INVALID_REQUEST, `Unsupported MCP-Protocol-Version: ${String(declared).slice(0, 40)}`, {
      supported: SUPPORTED_PROTOCOL_VERSIONS,
    }), 400);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return rpc(rpcError(null, PARSE_ERROR, "Request body is not valid JSON."), 400);
  }

  try {
    // Партидите отпаднаха в 2025-06-18, но по-старите клиенти още ги пращат —
    // приемаме ги, за да не се чупи 2025-03-26 клиент.
    if (Array.isArray(payload)) {
      if (!payload.length) return rpc(rpcError(null, INVALID_REQUEST, "Empty batch."), 400);
      const out = [];
      for (const m of payload) {
        const r = await handleMessage(m, env, version);
        if (r) out.push(r);
      }
      // Само нотификации → няма тяло за връщане.
      if (!out.length) return new Response(null, { status: 202, headers: { ...CORS, "mcp-protocol-version": PROTOCOL_VERSION } });
      return rpc(out);
    }

    const response = await handleMessage(payload, env, version);
    if (!response) return new Response(null, { status: 202, headers: { ...CORS, "mcp-protocol-version": PROTOCOL_VERSION } });
    return rpc(response);
  } catch (e) {
    return rpc(rpcError(payload && payload.id !== undefined ? payload.id : null, INTERNAL_ERROR, "Internal server error.", {
      hint: String((e && e.message) || e).slice(0, 160),
    }), 500);
  }
}
