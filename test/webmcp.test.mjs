// Тестове за WebMCP слоя (app/lib/webmcp.js) — инструментите на самата страница
// за агенти, които работят в браузъра.
//
//   node test/webmcp.test.mjs

import assert from "node:assert/strict";

import { webmcpBootstrap, WEBMCP_INIT_SCRIPT, WEBMCP_TOOL_NAMES } from "../app/lib/webmcp.js";

let passed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

// ---------------------------------------------------------------------------
// Фалшив браузър
// ---------------------------------------------------------------------------

const PROJECTS = [
  {
    public_slug: "bg05sfpr001-2-005", id: "BG05SFPR001-2.005", name: "Подкрепа за ученици с таланти", program: "Образование", priority: "П2",
    status: "open", deadline: "31.10.2026", deadline_date: "2026-10-31", budget: "10 000 000 лв.",
    budget_amount_eur: 5112919, eligible: "училища", country_code: "BG", official_url: "https://eufunds.bg/x",
    link: null, managing_authority: "УО Образование", last_updated: "2026-08-01",
  },
  {
    public_slug: "bg16rfpr002-1-014", id: "BG16RFPR002-1.014", name: "Иновации в предприятията", program: "Конкурентоспособност", priority: "П1",
    status: "closed", deadline: null, deadline_date: null, budget: null, budget_amount_eur: null,
    eligible: "МСП", country_code: "BG", official_url: null, link: "https://opic.bg/y",
    managing_authority: "УО ПКИП", last_updated: "2026-07-20",
  },
];

const ROUTES = {
  "/api/projects?country=BG": { ok: true, projects: PROJECTS, country: "BG", snapshot: null },
  "/api/projects?country=RO": { ok: true, projects: [], country: "RO", snapshot: null },
  "/api/project?id=BG05SFPR001-2.005": {
    ok: true, project: PROJECTS[0],
    documents: [{ id: 3, project_id: "BG05SFPR001-2.005", title: "Насоки", doc_type: "guidelines", content: "резюме", source_url: "https://eufunds.bg/doc.pdf" }],
  },
  "/api/countries": {
    ok: true,
    countries: [
      { code: "BG", slug: "bulgaria", enabled: 1, coverage_status: "active", currency_code: "BGN" },
      { code: "BE", slug: "belgium", enabled: 0, coverage_status: "connector_ready", currency_code: "EUR" },
    ],
  },
  "/api/sources?country=BG": { ok: true, country: "BG", meta: { source_count: 4 }, sources: [{ id: 1, url: "https://eufunds.bg" }] },
  "/api/public/platform-statistics": {
    ok: true, generatedAt: "2026-08-04", summary: { procedures: 512 },
    countries: [{ code: "BG", procedures: 42 }, { code: "RO", procedures: 18 }],
  },
};

/** Минимален fake `window` — само това, което bootstrap-ът наистина ползва. */
function makeScope({ surface = "navigator", store = null, pathname = "/" } = {}) {
  const calls = [];
  const navigated = [];
  const registered = [];

  const modelContext = surface === "spec"
    ? { registerTool: (tool) => { registered.push(tool); return Promise.resolve(); } }
    : { provideContext: (ctx) => { registered.push(...ctx.tools); } };

  const scope = {
    navigator: surface === "spec" ? {} : { modelContext },
    document: surface === "spec" ? { modelContext, addEventListener() {} } : { addEventListener() {} },
    location: {
      origin: "https://euro-funds.eu",
      pathname,
      assign(p) { navigated.push(p); },
    },
    localStorage: { getItem: (k) => (store && k in store ? store[k] : null) },
    addEventListener() {},
    setInterval() { throw new Error("не биваше да се стига до polling"); },
    clearInterval() {},
    fetch(url, init) {
      const path = String(url).replace("https://euro-funds.eu", "");
      calls.push({ path, init });
      const body = ROUTES[path] || (path === "/api/project?id=bg05sfpr001-2-005" ? ROUTES["/api/project?id=BG05SFPR001-2.005"] : null);
      if (!body) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ ok: false, error: "not_found" }) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    },
  };
  return { scope, calls, navigated, registered };
}

/** Стартира bootstrap-а и връща инструментите по име. */
function boot(opts) {
  const env = makeScope(opts);
  const state = webmcpBootstrap(env.scope);
  const byName = new Map(env.registered.map((tool) => [tool.name, tool]));
  return { ...env, state, byName, call: (name, args) => byName.get(name).execute(args) };
}

/** Данните от MCP-съвместим резултат. */
function data(result) {
  assert.equal(result.isError, undefined, "не се очакваше грешка: " + JSON.stringify(result.content));
  assert.ok(Array.isArray(result.content) && result.content[0].type === "text");
  return result.structuredContent !== undefined ? result.structuredContent : result.content[0].text;
}

// ---------------------------------------------------------------------------
// Регистрация
// ---------------------------------------------------------------------------

t("navigator.modelContext.provideContext получава всички инструменти", () => {
  const { registered, state } = boot();
  assert.deepEqual(registered.map((x) => x.name), WEBMCP_TOOL_NAMES);
  assert.equal(state.registered, true);
});

t("document.modelContext.registerTool (W3C чернова) също се поддържа", () => {
  const { registered, state } = boot({ surface: "spec" });
  assert.deepEqual(registered.map((x) => x.name), WEBMCP_TOOL_NAMES);
  assert.equal(state.registered, true);
});

t("всеки инструмент е с валиден дескриптор", () => {
  const { registered } = boot();
  for (const tool of registered) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{0,127}$/, tool.name + ": невалидно име");
    assert.ok(tool.description && tool.description.length > 40, tool.name + ": описанието е твърде кратко");
    assert.equal(typeof tool.execute, "function", tool.name + ": липсва execute");
    assert.equal(tool.inputSchema.type, "object", tool.name + ": inputSchema не е обект");
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name + ": позволява непознати полета");
    assert.equal(typeof tool.annotations.readOnlyHint, "boolean", tool.name + ": липсва readOnlyHint");
  }
});

t("четящите инструменти са readOnlyHint, навигиращите — не", () => {
  const { byName } = boot();
  for (const n of ["search_procedures", "get_procedure", "list_countries", "list_sources", "platform_statistics"]) {
    assert.equal(byName.get(n).annotations.readOnlyHint, true, n);
  }
  for (const n of ["open_procedure", "navigate_site"]) {
    assert.equal(byName.get(n).annotations.readOnlyHint, false, n);
  }
});

t("страницата излага обявеното без execute (за скенери)", () => {
  const { scope, state } = boot();
  assert.equal(scope.__WEBMCP__, state);
  assert.deepEqual(scope.__WEBMCP_TOOLS__.map((x) => x.name), WEBMCP_TOOL_NAMES);
  for (const tool of scope.__WEBMCP_TOOLS__) assert.equal(tool.execute, undefined);
});

t("повторно пускане не регистрира два пъти в същия интерфейс", () => {
  const env = makeScope();
  webmcpBootstrap(env.scope);
  webmcpBootstrap(env.scope);
  assert.equal(env.registered.length, WEBMCP_TOOL_NAMES.length);
});

t("липсващ modelContext не чупи страницата — само чака", () => {
  const env = makeScope();
  delete env.scope.navigator.modelContext;
  let scheduled = 0;
  env.scope.setInterval = () => { scheduled++; return 1; };
  const state = webmcpBootstrap(env.scope);
  assert.equal(state.registered, false);
  assert.equal(scheduled, 1);

  // Агентът инжектира API-то по-късно → ръчният retry регистрира.
  const late = [];
  env.scope.navigator.modelContext = { provideContext: (ctx) => late.push(...ctx.tools) };
  assert.equal(state.register(), true);
  assert.deepEqual(late.map((x) => x.name), WEBMCP_TOOL_NAMES);
});

t("bootstrap никога не чупи страницата", () => {
  // Празен скоуп (без document/navigator) — нито хвърля, нито регистрира.
  assert.doesNotThrow(() => webmcpBootstrap({}));
  assert.doesNotThrow(() => webmcpBootstrap(null));
  // Счупена имплементация на агента — страницата продължава да работи.
  assert.doesNotThrow(() => webmcpBootstrap({ navigator: { get modelContext() { throw new Error("boom"); } } }));
  assert.equal(webmcpBootstrap({ navigator: { modelContext: {} } }).registered, false);
});

// ---------------------------------------------------------------------------
// Четене
// ---------------------------------------------------------------------------

t("search_procedures връща процедурите с готов адрес", async () => {
  const { call, calls } = boot();
  const out = data(await call("search_procedures", {}));
  assert.equal(calls[0].path, "/api/projects?country=BG");
  assert.equal(out.country, "BG");
  assert.equal(out.matched, 2);
  assert.equal(out.procedures[0].url, "https://euro-funds.eu/procedures/bg05sfpr001-2-005");
  // Липсващият бюджет остава null — не се превръща в нула.
  assert.equal(out.procedures[1].budget_amount_eur, null);
  // official_url пада към link, когато го няма.
  assert.equal(out.procedures[1].official_url, "https://opic.bg/y");
});

t("search_procedures филтрира по статус, програма и свободен текст", async () => {
  const { call } = boot();
  assert.equal(data(await call("search_procedures", { status: "open" })).matched, 1);
  assert.equal(data(await call("search_procedures", { program: "Конкурентоспособност" })).matched, 1);
  assert.equal(data(await call("search_procedures", { query: "иновации" })).matched, 1);
  assert.equal(data(await call("search_procedures", { query: "МСП" })).matched, 1); // по eligible
  assert.equal(data(await call("search_procedures", { query: "няма такова" })).matched, 0);
});

t("search_procedures спазва limit и отхвърля невалидни стойности", async () => {
  const { call } = boot();
  assert.equal(data(await call("search_procedures", { limit: 1 })).procedures.length, 1);
  const bad = await call("search_procedures", { limit: 0 });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /limit/);
  const badStatus = await call("search_procedures", { status: "нещо" });
  assert.equal(badStatus.isError, true);
});

t("държавата идва от избора на посетителя, когато не е подадена", async () => {
  const store = { eurofunds_country_v1: JSON.stringify({ country: "RO", mode: "manual" }) };
  const { call, calls } = boot({ store });
  data(await call("search_procedures", {}));
  assert.equal(calls[0].path, "/api/projects?country=RO");
  // Изричният аргумент бие запазения избор.
  data(await call("search_procedures", { country: "bg" }));
  assert.equal(calls[1].path, "/api/projects?country=BG");
});

t("счупен localStorage не спира инструмента (private mode)", async () => {
  const env = makeScope();
  env.scope.localStorage = { getItem() { throw new Error("denied"); } };
  const state = webmcpBootstrap(env.scope);
  assert.equal(state.registered, true);
  const tool = env.registered.find((x) => x.name === "search_procedures");
  assert.equal(data(await tool.execute({})).country, "BG");
});

t("get_procedure намира процедурата и по slug, не само по суров id", async () => {
  const { call, calls } = boot();
  const direct = data(await call("get_procedure", { id: "BG05SFPR001-2.005" }));
  assert.equal(direct.procedure.id, "BG05SFPR001-2.005");
  assert.equal(direct.documents[0].summary, "резюме");
  assert.equal(direct.documents[0].source_url, "https://eufunds.bg/doc.pdf");

  calls.length = 0;
  const bySlug = data(await call("get_procedure", { id: "bg05sfpr001-2-005" }));
  assert.equal(bySlug.procedure.id, "BG05SFPR001-2.005");
  assert.equal(calls.length, 1); // неуспешен опит по id → списък → четене по намерения id
});

t("get_procedure дава смислена грешка, а не изключение", async () => {
  const { call } = boot();
  const missing = await call("get_procedure", { id: "няма-такава" });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /search_procedures/);
  const empty = await call("get_procedure", {});
  assert.equal(empty.isError, true);
});

t("list_countries може да върне само включените", async () => {
  const { call } = boot();
  assert.equal(data(await call("list_countries", {})).count, 2);
  const on = data(await call("list_countries", { enabledOnly: true }));
  assert.equal(on.count, 1);
  assert.equal(on.countries[0].code, "BG");
});

t("list_sources и platform_statistics връщат реалните данни", async () => {
  const { call } = boot();
  const src = data(await call("list_sources", {}));
  assert.equal(src.country, "BG");
  assert.equal(src.sources.length, 1);

  const all = data(await call("platform_statistics", {}));
  assert.equal(all.countries.length, 2);
  assert.equal(all.generatedAt, "2026-08-04");
  const one = data(await call("platform_statistics", { country: "RO" }));
  assert.equal(one.countries.length, 1);
  assert.equal(one.countries[0].code, "RO");
});

t("мрежова грешка се връща като isError, не като счупен инструмент", async () => {
  const env = makeScope();
  env.scope.fetch = () => Promise.reject(new Error("offline"));
  webmcpBootstrap(env.scope);
  const tool = env.registered.find((x) => x.name === "list_countries");
  const res = await tool.execute({});
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /offline/);
});

// ---------------------------------------------------------------------------
// Навигация (това, което сървърният MCP не може)
// ---------------------------------------------------------------------------

t("open_procedure отваря страницата на процедурата", async () => {
  const { call, navigated } = boot();
  const res = await call("open_procedure", { id: "BG05SFPR001-2.005" });
  assert.equal(res.isError, undefined);
  assert.deepEqual(navigated, ["/procedures/bg05sfpr001-2-005"]);
});

t("навигацията пази езиковия префикс", async () => {
  const { call, navigated } = boot({ pathname: "/en/procedures" });
  await call("open_procedure", { id: "BG05SFPR001-2.005" });
  await call("navigate_site", { section: "overview" });
  await call("navigate_site", { section: "calendar" });
  assert.deepEqual(navigated, ["/procedures/bg05sfpr001-2-005", "/en", "/en/calendar"]);
});

t("navigate_site подава търсенето към /procedures", async () => {
  const { call, navigated } = boot();
  await call("navigate_site", { section: "procedures", query: "иновации", status: "open" });
  assert.equal(navigated[0], "/procedures?q=" + encodeURIComponent("иновации") + "&status=open");
  await call("navigate_site", { section: "overview" });
  assert.equal(navigated[1], "/");
});

t("navigate_site отхвърля непознат раздел", async () => {
  const { call, navigated } = boot();
  const res = await call("navigate_site", { section: "admin" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /section/);
  assert.equal(navigated.length, 0);
});

// ---------------------------------------------------------------------------
// Инлайн скриптът
// ---------------------------------------------------------------------------

t("сериализираният скрипт е самоизпълняващ се и без външни зависимости", () => {
  assert.match(WEBMCP_INIT_SCRIPT, /^\(function webmcpBootstrap\(/);
  assert.match(WEBMCP_INIT_SCRIPT, /\}\)\(\);$/);
  assert.equal(WEBMCP_INIT_SCRIPT.includes("import "), false);
  assert.equal(WEBMCP_INIT_SCRIPT.includes("require("), false);
  // Не бива да затваря HTML тага, в който се вгражда.
  assert.equal(/<\/script/i.test(WEBMCP_INIT_SCRIPT), false);
});

t("скриптът съдържа буквално navigator.modelContext (за статични скенери)", () => {
  assert.ok(WEBMCP_INIT_SCRIPT.includes("navigator.modelContext"));
  assert.ok(WEBMCP_INIT_SCRIPT.includes("document.modelContext"));
  assert.ok(WEBMCP_INIT_SCRIPT.includes("provideContext"));
  assert.ok(WEBMCP_INIT_SCRIPT.includes("registerTool"));
  for (const name of WEBMCP_TOOL_NAMES) assert.ok(WEBMCP_INIT_SCRIPT.includes(name), "липсва " + name);
});

t("сериализираният скрипт работи след eval — не само изходният модул", async () => {
  const env = makeScope();
  // Същото, което прави браузърът с инлайн скрипта, но със скоуп, който можем
  // да наблюдаваме (в браузъра това е window).
  const expression = WEBMCP_INIT_SCRIPT.replace(/\(\);\s*$/, "");
  const bootstrap = new Function("return " + expression)();
  bootstrap(env.scope);
  assert.deepEqual(env.registered.map((x) => x.name), WEBMCP_TOOL_NAMES);
  const out = data(await env.registered[0].execute({}));
  assert.equal(out.matched, 2);
});

t("имената в WEBMCP_TOOL_NAMES са уникални и покриват регистрираното", () => {
  const { registered } = boot();
  assert.equal(registered.length, WEBMCP_TOOL_NAMES.length);
  assert.deepEqual([...new Set(WEBMCP_TOOL_NAMES)], WEBMCP_TOOL_NAMES, "дублирано име на инструмент");
});

// ---------------------------------------------------------------------------
// Пускане
// ---------------------------------------------------------------------------

if (typeof it === "function") {
  for (const [name, fn] of tests) it(name, fn);
} else {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log("ok  -", name);
    } catch (e) {
      console.error("FAIL -", name, "\n     ", e.message);
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} passed (webmcp)`);
}
