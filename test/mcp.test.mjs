// Тестове за MCP слоя: Server Card (SEP-2127, чернова) + работещият Streamable
// HTTP сървър на /mcp.
//
// Два инварианта държат всичко останало:
//
//   1. Картата НЕ ЛЪЖЕ. Всеки инструмент, обявен в картата, трябва наистина да
//      се връща от `tools/list`, а endpoint-ът в картата трябва да е нашият.
//      Карта, която сочи в празното, минава скенера и се чупи при първия агент.
//   2. Сървърът НЕ ПИШЕ. Всяка SQL заявка, която инструментите пускат, започва
//      със SELECT. Това е обещанието на `readOnlyHint` и на самата карта.
//
//   node test/mcp.test.mjs

import assert from "node:assert/strict";

import {
  handleMcp, serverCardDocument, callTool, TOOLS,
  MCP_PATH, SERVER_CARD_PATH, SERVER_NAME, PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS,
} from "../worker/agent/mcp.js";
import { AGENT_LINKS, agentIndex, apiCatalog, apiDocsMarkdown } from "../worker/agent/discovery.js";
import { DISCOVERY_RESOURCES, ROUTES } from "../worker/discovery/inventory.js";
import { executeCheck, STATUS } from "../worker/discovery/validation.js";

let passed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

const ORIGIN = "https://euro-funds.eu";
const VERSION = "2.53.0";

// ---------------------------------------------------------------------------
// Мок на D1
// ---------------------------------------------------------------------------
//
// Мокът пада с ясна грешка при непокрита заявка — по-добре шумен провал в теста,
// отколкото тих `undefined` в продукцията.

const PROJECT = {
  public_slug: "bg05sfpr001-2-005",
  id: "BG05SFPR001-2.005",
  name: "Подкрепа за ученици с таланти",
  program: "ПРЧР 2021-2027",
  priority: "Приоритет 2",
  category: "youth",
  status: "open",
  deadline: "до 30 септември 2026 г.",
  deadline_date: "2026-09-30",
  budget: "20 000 000 лв.",
  budget_amount_eur: 10225838,
  eligible: "Училища и общини",
  country_code: "BG",
  official_url: "https://eufunds.bg/bg05sfpr001-2005",
  link: "https://eufunds.bg/x",
  managing_authority: "МОН",
  original_language: "bg",
  first_seen: "2026-01-10",
  last_updated: "2026-07-30",
};

const PROJECT_NO_BUDGET = { ...PROJECT, public_slug: "bg16rfpr002-1-001", id: "BG16RFPR002-1.001", name: "Иновации в предприятията", status: "closing_soon", budget_amount_eur: null, deadline_date: null, deadline: "текущ прием", category: null };

function mockDb(overrides = {}) {
  const log = [];
  const rows = {
    projects: [PROJECT, PROJECT_NO_BUDGET],
    documents: [{ id: 1, title: "Условия за кандидатстване", doc_type: "guidelines", content: "# Кратко резюме", source_url: "https://eufunds.bg/doc.pdf" }],
    countries: [
      { code: "BG", slug: "bulgaria", name_bg: "България", native_name: "България", english_name: "Bulgaria", default_language: "bg", currency_code: "BGN", enabled: 1, coverage_status: "full", ingestion_status: "active", source_count: 6, active_source_count: 5, last_successful_sync_at: "2026-08-04" },
      { code: "BE", slug: "belgium", name_bg: "Белгия", native_name: "België", english_name: "Belgium", default_language: "nl", currency_code: "EUR", enabled: 0, coverage_status: "none", ingestion_status: "connector_ready", source_count: 2, active_source_count: 0, last_successful_sync_at: null },
    ],
    funding_sources: [{ id: 1, name: "eufunds.bg", authority_name: "ЦКЗ", authority_type: "national", base_url: "https://eufunds.bg", calls_url: null, programmes_url: null, source_type: "portal", source_level: "national", official: 1, primary_source: 1, coverage_description: "Всички ОП", source_language: "bg", update_frequency: "daily", verified: 1, source_health: "healthy", last_success_at: "2026-08-04", last_checked_at: "2026-08-04" }],
    stats: [{ country_code: "BG", total_procedures: 42, active_procedures: 20, upcoming_procedures: 5, closed_procedures: 17, procedures_with_documents: 30, published_budget_eur: 500000, budget_procedure_count: 21, active_sources: 5, average_quality_score: 72.5, last_successful_sync_at: "2026-08-04", coverage_status: "full", native_name: "България", english_name: "Bulgaria", enabled: 1 }],
    snapshotDate: "2026-08-04",
    ...overrides,
  };

  const run = (sql, binds) => {
    log.push({ sql, binds });
    const s = sql.replace(/\s+/g, " ").trim().replaceAll("FROM public_projects", "FROM projects");
    if(s.includes("public_slug IS NULL")) return {results:[]};
    if(s.includes("WHERE public_slug =")) return rows.projects.find(p=>p.public_slug===binds[0]) || null;

    if (/^SELECT COUNT\(\*\) AS n FROM projects/.test(s)) return { n: rows.projects.length };
    if (/^SELECT id FROM projects$/.test(s)) return { results: rows.projects.map((p) => ({ id: p.id })) };
    if (/FROM projects WHERE id = \?1$/.test(s)) return rows.projects.find((p) => p.id === binds[0]) || null;
    if (/FROM projects WHERE/.test(s)) return { results: rows.projects.slice(0, binds[binds.length - 1] || rows.projects.length) };
    if (/FROM documents WHERE project_id/.test(s)) return { results: rows.documents };
    if (/FROM countries WHERE enabled=1 ORDER BY priority$/.test(s)) return { results: rows.countries.filter((c) => c.enabled) };
    if (/FROM countries ORDER BY priority$/.test(s)) return { results: rows.countries };
    if (/FROM funding_sources WHERE country_code/.test(s)) return { results: rows.funding_sources };
    if (/MAX\(snapshot_date\) AS d FROM country_daily_statistics/.test(s)) return { d: rows.snapshotDate };
    if (/FROM country_daily_statistics s JOIN countries c/.test(s)) {
      const country = binds[1];
      return { results: country ? rows.stats.filter((r) => r.country_code === country) : rows.stats };
    }
    throw new Error("Мокът на D1 няма отговор за: " + s);
  };

  const DB = {
    prepare(sql) {
      let binds = [];
      const stmt = {
        bind(...b) { binds = b; return stmt; },
        async first() { const r = run(sql, binds); return r && r.results ? (r.results[0] || null) : r; },
        async all() { const r = run(sql, binds); return r && r.results ? r : { results: r ? [r] : [] }; },
      };
      return stmt;
    },
  };
  return { DB, log };
}

// ---------------------------------------------------------------------------
// Помощни
// ---------------------------------------------------------------------------

const post = (body, env = mockDb().DB && { DB: mockDb().DB }, headers = {}) => {
  const url = `${ORIGIN}${MCP_PATH}`;
  return handleMcp(
    new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }),
    env, new URL(url), VERSION
  );
};

const rpcOnce = async (message, env) => {
  const r = await post(message, env);
  assert.equal(r.status, 200, `очакван 200, получен ${r.status}`);
  return r.json();
};

const callToolRpc = async (name, args, env) => {
  const body = await rpcOnce({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } }, env);
  assert.ok(body.result, "очакван result, а не error: " + JSON.stringify(body.error));
  return body.result;
};

const getCard = async () => {
  const url = `${ORIGIN}${SERVER_CARD_PATH}`;
  const r = await handleMcp(new Request(url), {}, new URL(url), VERSION);
  return { res: r, doc: await r.clone().json() };
};

// ---------------------------------------------------------------------------
// Server Card
// ---------------------------------------------------------------------------

t("картата се сервира на .well-known пътя с правилни заглавки", async () => {
  const { res } = await getCard();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("cache-control"), /max-age=\d+/);
});

t("картата носи трите неща, които скенерът търси", async () => {
  const { doc } = await getCard();
  // serverInfo с име и версия
  assert.equal(typeof doc.serverInfo, "object");
  assert.equal(doc.serverInfo.name, SERVER_NAME);
  assert.equal(doc.serverInfo.version, VERSION);
  // транспортен endpoint — и по двата установили се начина
  assert.equal(doc.url, `${ORIGIN}${MCP_PATH}`);
  assert.equal(doc.transport.type, "streamable-http");
  assert.equal(doc.transport.endpoint, `${ORIGIN}${MCP_PATH}`);
  // капабилити
  assert.equal(typeof doc.capabilities.tools, "object");
});

t("версията в картата следва APP_VERSION, не е закована", async () => {
  const a = serverCardDocument("1.2.3", ORIGIN);
  assert.equal(a.version, "1.2.3");
  assert.equal(a.serverInfo.version, "1.2.3");
});

t("endpoint-ът е на собствения произход, не чужд", async () => {
  const { doc } = await getCard();
  for (const u of [doc.url, doc.transport.endpoint, doc.remotes[0].url]) {
    assert.equal(new URL(u).origin, ORIGIN, u);
  }
});

t("картата НЕ носи $schema — черновата се мести и строг валидатор би се счупил", async () => {
  const { doc } = await getCard();
  assert.equal(doc.$schema, undefined);
});

t("обявените в картата версии на протокола включват тази, която сървърът предпочита", async () => {
  const { doc } = await getCard();
  assert.equal(doc.protocolVersion, PROTOCOL_VERSION);
  assert.ok(doc.supportedProtocolVersions.includes(PROTOCOL_VERSION));
  assert.deepEqual(doc.supportedProtocolVersions, SUPPORTED_PROTOCOL_VERSIONS);
});

t("картата обявява честно, че е само за четене и без автентикация", async () => {
  const { doc } = await getCard();
  assert.equal(doc.authentication.type, "none");
  assert.equal(doc._meta["eu.euro-funds/server"].readOnly, true);
  assert.equal(doc._meta["eu.euro-funds/server"].writeOperations, 0);
});

t("не-GET към картата връща 405", async () => {
  const url = `${ORIGIN}${SERVER_CARD_PATH}`;
  const r = await handleMcp(new Request(url, { method: "POST" }), {}, new URL(url), VERSION);
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "GET, HEAD");
});

// ---------------------------------------------------------------------------
// ИНВАРИАНТ 1 — картата не лъже
// ---------------------------------------------------------------------------

t("всеки инструмент от картата се връща и от tools/list", async () => {
  const { doc } = await getCard();
  const { DB } = mockDb();
  const body = await rpcOnce({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { DB });
  const live = body.result.tools.map((x) => x.name);
  assert.ok(doc.tools.length > 0, "картата не изброява инструменти");
  for (const declared of doc.tools) {
    assert.ok(live.includes(declared.name), `картата обявява ${declared.name}, а tools/list не го връща`);
  }
  assert.equal(doc.tools.length, live.length, "картата и tools/list се разминават по брой");
});

t("описанията в картата съвпадат с тези в tools/list", async () => {
  const { doc } = await getCard();
  const byName = new Map(TOOLS.map((x) => [x.name, x]));
  for (const declared of doc.tools) {
    assert.equal(declared.description, byName.get(declared.name).description, declared.name);
  }
});

// ---------------------------------------------------------------------------
// tools/list
// ---------------------------------------------------------------------------

t("всеки инструмент има уникално име и обектна входна схема", async () => {
  const seen = new Set();
  for (const tool of TOOLS) {
    assert.match(tool.name, /^[a-z][a-z0-9_]*$/, tool.name);
    assert.ok(!seen.has(tool.name), "дублирано име: " + tool.name);
    seen.add(tool.name);
    assert.ok(tool.description && tool.description.length > 20, tool.name);
    assert.equal(tool.inputSchema.type, "object", tool.name);
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name + ": непознати аргументи трябва да се отхвърлят");
  }
});

t("всеки инструмент е обявен като само за четене", async () => {
  for (const tool of TOOLS) {
    assert.equal(tool.annotations.readOnlyHint, true, tool.name);
    assert.equal(tool.annotations.destructiveHint, false, tool.name);
  }
});

// ---------------------------------------------------------------------------
// Протокол
// ---------------------------------------------------------------------------

t("initialize връща поисканата версия, ако я поддържаме", async () => {
  const { DB } = mockDb();
  const body = await rpcOnce({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, { DB });
  assert.equal(body.result.protocolVersion, "2025-03-26");
  assert.equal(body.result.serverInfo.name, SERVER_NAME);
  assert.equal(body.result.serverInfo.version, VERSION);
  assert.equal(typeof body.result.capabilities.tools, "object");
  assert.ok(body.result.instructions.includes("budget_amount_eur"), "инструкциите трябва да предупредят за капана с null бюджета");
});

t("initialize с непозната версия връща нашата, вместо да се провали", async () => {
  const { DB } = mockDb();
  const body = await rpcOnce({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }, { DB });
  assert.equal(body.result.protocolVersion, PROTOCOL_VERSION);
});

t("ping връща празен резултат", async () => {
  const { DB } = mockDb();
  const body = await rpcOnce({ jsonrpc: "2.0", id: 7, method: "ping" }, { DB });
  assert.deepEqual(body.result, {});
  assert.equal(body.id, 7);
});

t("нотификация не получава тяло, а 202", async () => {
  const { DB } = mockDb();
  const r = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, { DB });
  assert.equal(r.status, 202);
  assert.equal(await r.text(), "");
});

t("непозната нотификация се преглъща, не гърми", async () => {
  const { DB } = mockDb();
  const r = await post({ jsonrpc: "2.0", method: "notifications/somethingNew", params: { x: 1 } }, { DB });
  assert.equal(r.status, 202);
});

t("партида от по-стар клиент се обработва", async () => {
  const { DB } = mockDb();
  const r = await post([
    { jsonrpc: "2.0", id: 1, method: "ping" },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ], { DB });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 2, "нотификацията не бива да дава отговор");
  assert.deepEqual(body.map((x) => x.id), [1, 2]);
});

t("неподдържан метод дава -32601, а не мълчалив успех", async () => {
  const { DB } = mockDb();
  for (const method of ["resources/list", "prompts/list", "totally/unknown"]) {
    const body = await rpcOnce({ jsonrpc: "2.0", id: 3, method }, { DB });
    assert.equal(body.error.code, -32601, method);
  }
});

t("липсващо jsonrpc поле дава -32600", async () => {
  const { DB } = mockDb();
  const body = await rpcOnce({ id: 1, method: "ping" }, { DB });
  assert.equal(body.error.code, -32600);
});

t("невалиден JSON дава -32700 и 400", async () => {
  const { DB } = mockDb();
  const r = await post("{ това не е JSON", { DB });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.error.code, -32700);
});

t("непозната версия на протокола в заглавката се отхвърля с 400", async () => {
  const { DB } = mockDb();
  const r = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { DB }, { "mcp-protocol-version": "2099-01-01" });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.error.code, -32600);
  assert.deepEqual(body.error.data.supported, SUPPORTED_PROTOCOL_VERSIONS);
});

t("поддържана версия в заглавката минава", async () => {
  const { DB } = mockDb();
  const r = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { DB }, { "mcp-protocol-version": "2025-06-18" });
  assert.equal(r.status, 200);
});

// ---------------------------------------------------------------------------
// HTTP методи на /mcp
// ---------------------------------------------------------------------------

const raw = (method, headers = {}) => {
  const url = `${ORIGIN}${MCP_PATH}`;
  return handleMcp(new Request(url, { method, headers }), {}, new URL(url), VERSION);
};

t("GET със заявка за SSE връща 405 — не предлагаме поток", async () => {
  const r = await raw("GET", { accept: "text/event-stream" });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "POST, OPTIONS");
});

t("GET от браузър/скенер връща указател, а не гол 405", async () => {
  const r = await raw("GET");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.transport, "streamable-http");
  assert.equal(body.endpoint, `${ORIGIN}${MCP_PATH}`);
  assert.equal(body.serverCard, `${ORIGIN}${SERVER_CARD_PATH}`);
  assert.equal(body.readOnly, true);
});

t("DELETE връща 405 — няма сесии за прекратяване", async () => {
  const r = await raw("DELETE");
  assert.equal(r.status, 405);
});

t("OPTIONS дава CORS preflight", async () => {
  const r = await raw("OPTIONS");
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.match(r.headers.get("access-control-allow-headers"), /mcp-protocol-version/);
});

t("отговорите на /mcp не се кешират", async () => {
  const { DB } = mockDb();
  const r = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { DB });
  assert.equal(r.headers.get("cache-control"), "no-store");
});

t("handleMcp не пипа чужди пътища", async () => {
  const url = `${ORIGIN}/procedures`;
  assert.equal(await handleMcp(new Request(url), {}, new URL(url), VERSION), null);
});

// ---------------------------------------------------------------------------
// ИНВАРИАНТ 2 — нищо не пише
// ---------------------------------------------------------------------------

t("всяка SQL заявка на всеки инструмент е SELECT", async () => {
  const { DB, log } = mockDb();
  await callTool("search_procedures", { query: "иновации" }, { DB });
  await callTool("get_procedure", { id: PROJECT.id }, { DB });
  await callTool("list_countries", {}, { DB });
  await callTool("list_sources", { country: "BG" }, { DB });
  await callTool("platform_statistics", {}, { DB });
  assert.ok(log.length >= 7, "очаквани поне 7 заявки, а са " + log.length);
  for (const q of log) {
    assert.match(q.sql.trim(), /^SELECT\b/i, "не-SELECT заявка: " + q.sql.slice(0, 80));
  }
});

// ---------------------------------------------------------------------------
// Инструменти
// ---------------------------------------------------------------------------

t("search_procedures по подразбиране е BG и връща готов адрес на страницата", async () => {
  const { DB } = mockDb();
  const res = await callToolRpc("search_procedures", {}, { DB });
  assert.equal(res.isError, false);
  const data = res.structuredContent;
  assert.equal(data.country, "BG");
  assert.equal(data.procedures[0].url, `${ORIGIN}/procedures/bg05sfpr001-2-005`);
  // Текстовото съдържание е същите данни — клиент без structuredContent пак работи.
  assert.deepEqual(JSON.parse(res.content[0].text), data);
});

t("search_procedures предупреждава, че null бюджет не е нула", async () => {
  const { DB } = mockDb();
  const data = (await callToolRpc("search_procedures", {}, { DB })).structuredContent;
  const noBudget = data.procedures.find((p) => p.id === PROJECT_NO_BUDGET.id);
  assert.equal(noBudget.budget_amount_eur, null);
  assert.match(data.note, /null/);
});

t("search_procedures екранира LIKE метасимволите", async () => {
  const { DB, log } = mockDb();
  await callTool("search_procedures", { query: "50% _тест_" }, { DB });
  const q = log.find((x) => /LIKE/.test(x.sql));
  assert.ok(q, "не е изпълнена LIKE заявка");
  assert.ok(q.sql.includes("ESCAPE"), "LIKE без ESCAPE — потребителският текст става шаблон");
  assert.equal(q.binds[1], "%50\\% \\_тест\\_%");
});

t("невалидна държава е грешка на инструмента, не на протокола", async () => {
  const { DB } = mockDb();
  const body = await rpcOnce({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_procedures", arguments: { country: "БГ" } } }, { DB });
  assert.ok(body.result, "трябва да е result с isError, не JSON-RPC error");
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /ISO 3166-1/);
});

t("limit извън обхвата се отказва ясно", async () => {
  const { DB } = mockDb();
  const res = await callToolRpc("search_procedures", { limit: 5000 }, { DB });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /between 1 and 100/);
});

t("невалиден статус се отказва вместо да върне празен списък", async () => {
  const { DB } = mockDb();
  const res = await callToolRpc("search_procedures", { status: "otvoreni" }, { DB });
  assert.equal(res.isError, true);
});

t("get_procedure намира процедурата и по URL slug", async () => {
  const { DB } = mockDb();
  const data = (await callToolRpc("get_procedure", { id: "bg05sfpr001-2-005" }, { DB })).structuredContent;
  assert.equal(data.procedure.id, PROJECT.id);
  assert.equal(data.documents.length, 1);
  assert.match(data.note, /source_url/);
});

t("get_procedure за несъществуващо id дава isError, не празен обект", async () => {
  const { DB } = mockDb();
  const res = await callToolRpc("get_procedure", { id: "няма-такава" }, { DB });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /search_procedures/);
});

t("list_countries казва честно кои държави не са минали QA", async () => {
  const { DB } = mockDb();
  const data = (await callToolRpc("list_countries", {}, { DB })).structuredContent;
  assert.equal(data.count, 2);
  assert.equal(data.countries.find((c) => c.code === "BE").enabled, false);
  assert.match(data.note, /enabled: false/);
  const only = (await callToolRpc("list_countries", { enabledOnly: true }, { DB })).structuredContent;
  assert.equal(only.count, 1);
});

t("list_sources връща само публично безопасни полета", async () => {
  const { DB } = mockDb();
  const data = (await callToolRpc("list_sources", { country: "BG" }, { DB })).structuredContent;
  assert.equal(data.country, "BG");
  const keys = Object.keys(data.sources[0]);
  for (const forbidden of ["parser_error", "last_error", "selector", "api_key"]) {
    assert.ok(!keys.includes(forbidden), "изтича вътрешно поле: " + forbidden);
  }
});

t("platform_statistics обяснява какво покрива бюджетното число", async () => {
  const { DB } = mockDb();
  const data = (await callToolRpc("platform_statistics", {}, { DB })).structuredContent;
  assert.equal(data.generatedAt, "2026-08-04");
  assert.equal(data.totals.totalProcedures, 42);
  assert.equal(data.totals.budgetProcedureCount, 21);
  assert.equal(data.totals.budgetCoveragePercent, 50);
  assert.match(data.note, /budgetProcedureCount/);
});

t("без публикуван snapshot не се измислят числа", async () => {
  const { DB } = mockDb({ snapshotDate: null });
  const data = (await callToolRpc("platform_statistics", {}, { DB })).structuredContent;
  assert.equal(data.generatedAt, null);
  assert.deepEqual(data.countries, []);
  assert.equal(data.totals, null);
});

t("недостъпна база дава ясна грешка на инструмента, не 500", async () => {
  const r = await post({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "list_countries", arguments: {} } }, {});
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /api\/health/);
});

t("непознат инструмент дава -32602 и изброява наличните", async () => {
  const { DB } = mockDb();
  const body = await rpcOnce({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "delete_everything" } }, { DB });
  assert.equal(body.error.code, -32602);
  assert.ok(body.error.data.available.includes("search_procedures"));
});

// ---------------------------------------------------------------------------
// Свързване с останалия слой за агенти
// ---------------------------------------------------------------------------

t("картата е в Link заглавките, в API каталога и в инвентара", async () => {
  assert.ok(AGENT_LINKS.some((l) => l.href === SERVER_CARD_PATH), "липсва в AGENT_LINKS");
  const catalog = await apiCatalog().json();
  const described = catalog.linkset[0].describedby.map((x) => x.href);
  assert.ok(described.includes(`${ORIGIN}${SERVER_CARD_PATH}`), "липсва в api-catalog");
  assert.ok(DISCOVERY_RESOURCES.some((r) => r.path === SERVER_CARD_PATH), "липсва в DISCOVERY_RESOURCES");
  assert.ok(ROUTES.some((r) => r.path === MCP_PATH && r.method === "POST"), "липсва в ROUTES");
});

t("агентският индекс вече вписва MCP сървъра — и не твърди обратното", async () => {
  const { DB } = mockDb();
  const env = { DB: { prepare: () => ({ first: async () => ({ p: 42, c: 1, s: "2026-08-04" }) }) } };
  void DB;
  const doc = await (await agentIndex(env, VERSION)).json();
  assert.equal(doc.agents.length, 1);
  const a = doc.agents[0];
  assert.equal(a.protocol, "mcp");
  assert.equal(a.endpoint, `${ORIGIN}${MCP_PATH}`);
  assert.equal(a.server_card, `${ORIGIN}${SERVER_CARD_PATH}`);
  assert.equal(a.read_only, true);
  assert.deepEqual(a.tools, TOOLS.map((x) => x.name));
  assert.ok(!/does not operate A2A or MCP/.test(doc.agents_note), "старият текст още твърди, че MCP сървър няма");
  assert.equal(doc.discovery.mcp_server_card, `${ORIGIN}${SERVER_CARD_PATH}`);
});

t("документацията за API-то описва MCP сървъра", async () => {
  const md = apiDocsMarkdown(VERSION);
  assert.match(md, /## MCP сървър/);
  assert.match(md, /POST \/mcp/);
  for (const tool of TOOLS) assert.ok(md.includes(tool.name), "липсва в документацията: " + tool.name);
});

// ---------------------------------------------------------------------------
// Админ проверката
// ---------------------------------------------------------------------------

/** Мок на живия сайт: картата + истинският MCP рутер зад нея. */
function liveSite({ card = null, missingCard = false, env = null } = {}) {
  const database = env || { DB: mockDb().DB };
  return async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === SERVER_CARD_PATH) {
      if (missingCard) return new Response("not found", { status: 404 });
      const doc = card === null ? serverCardDocument(VERSION, ORIGIN) : card;
      return new Response(JSON.stringify(doc), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
    }
    if (u.pathname === MCP_PATH) {
      return handleMcp(new Request(url, init), database, u, VERSION);
    }
    return new Response("not found", { status: 404 });
  };
}

const runCheck = (fetchImpl) => executeCheck({ code: "agents.mcp_server_card", category: "agents" }, { origin: ORIGIN, fetchImpl });

t("проверката минава срещу истинската карта и истинския сървър", async () => {
  const r = await runCheck(liveSite());
  assert.equal(r.status, STATUS.PASSED, JSON.stringify(r.safeDetails.problems));
  assert.equal(r.safeDetails.tools.length, TOOLS.length);
  assert.equal(r.safeDetails.handshake.serverName, SERVER_NAME);
});

t("липсваща карта е провал", async () => {
  const r = await runCheck(liveSite({ missingCard: true }));
  assert.equal(r.status, STATUS.FAILED);
});

t("карта, която обявява несъществуващ инструмент, е провал", async () => {
  const card = serverCardDocument(VERSION, ORIGIN);
  card.tools = [...card.tools, { name: "book_a_flight", description: "не съществува" }];
  const r = await runCheck(liveSite({ card }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("card_tool_missing:book_a_flight"));
});

t("карта, която сочи към чужд произход, е провал", async () => {
  const card = serverCardDocument(VERSION, ORIGIN);
  card.url = "https://example.com/mcp";
  card.transport.endpoint = "https://example.com/mcp";
  card.remotes[0].url = "https://example.com/mcp";
  const r = await runCheck(liveSite({ card }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("foreign_endpoint"));
});

t("разминаване между името в картата и името на сървъра е провал", async () => {
  const card = serverCardDocument(VERSION, ORIGIN);
  card.serverInfo.name = "some.other/server";
  const r = await runCheck(liveSite({ card }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("serverInfo_name_mismatch"));
});

t("карта без capabilities.tools е провал", async () => {
  const card = serverCardDocument(VERSION, ORIGIN);
  delete card.capabilities;
  const r = await runCheck(liveSite({ card }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("missing_capabilities"));
});

t("карта с endpoint, който не отговаря, е провал", async () => {
  const card = serverCardDocument(VERSION, ORIGIN);
  card.url = `${ORIGIN}/mcp-typo`;
  card.transport.endpoint = `${ORIGIN}/mcp-typo`;
  card.remotes[0].url = `${ORIGIN}/mcp-typo`;
  const r = await runCheck(liveSite({ card }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("initialize_unreachable"));
});

// ---------------------------------------------------------------------------
// Изпълнение (vitest, ако е налично; иначе самостоятелно)
// ---------------------------------------------------------------------------

if (typeof it === "function") {
  for (const [name, fn] of tests) it(name, fn);
} else {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log("ok  - " + name);
    } catch (e) {
      console.log("FAIL - " + name + " \n      " + (e && e.message));
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} passed (MCP)`);
}
