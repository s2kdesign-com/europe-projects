// Тестове за DNS-AID (draft-mozleywilliams-dnsop-dnsaid) — агентският индекс,
// към който сочи SVCB записът `_index._agents.euro-funds.eu`, и админ
// проверките, които следят и документа, и самия DNS запис.
//
//   node test/dns-aid.test.mjs

import assert from "node:assert/strict";

import { agentIndex, AGENT_LINKS, agentLinkHeader, apiCatalog, robotsTxt, CONTENT_SIGNAL } from "../worker/agent/discovery.js";
import { executeCheck, STATUS } from "../worker/discovery/validation.js";
import { parseSvcbRecord } from "../worker/discovery/parsers.js";
import { DISCOVERY_RESOURCES } from "../worker/discovery/inventory.js";

let passed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

const ORIGIN = "https://euro-funds.eu";
const INDEX_PATH = "/.well-known/agent-index.json";

function makeEnv({ fail = false } = {}) {
  return {
    DB: {
      prepare() {
        return {
          bind() { return this; },
          async first() {
            if (fail) throw new Error("D1 недостъпна");
            return { p: 880, c: 27, s: "2026-07-28" };
          },
        };
      },
    },
  };
}

const readIndex = async (env = makeEnv(), version = "2.50.0") => {
  const r = await agentIndex(env, version);
  return { res: r, body: await r.json() };
};

// ---------------------------------------------------------------------------
// Самият документ
// ---------------------------------------------------------------------------

t("индексът е валиден JSON с правилни заглавки", async () => {
  const { res, body } = await readIndex();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("cache-control"), /max-age=3600/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.ok(body.spec.includes("DNS-AID"));
  assert.equal(body.dns_record, "_index._agents.euro-funds.eu");
  assert.equal(body.dns_record_type, "SVCB");
  assert.equal(body.version, "2.50.0");
});

t("нула собствени агенти — но казано открито, не премълчано", async () => {
  const { body } = await readIndex();
  assert.deepEqual(body.agents, [], "не пускаме A2A/MCP агент");
  assert.ok(body.agents_note, "празният списък трябва да е обяснен");
  assert.match(body.agents_note, /does not operate/i);
  // Услугите пък са реални и не се представят за агенти.
  assert.ok(body.services.length >= 3);
  for (const s of body.services) {
    for (const f of ["id", "name", "protocol", "base_url", "methods", "authentication"]) {
      assert.ok(s[f], `услуга ${s.id}: липсва ${f}`);
    }
    assert.deepEqual(s.methods, ["GET"], "индексът обявява само четене");
  }
});

t("всички обявени адреси сочат към собствения произход", async () => {
  const { body } = await readIndex();
  const urls = [
    ...Object.values(body.discovery),
    ...body.services.flatMap((s) => [s.base_url, s.openapi, s.documentation].filter(Boolean)),
    body.organization.url, body.organization.about,
    body.authentication.agent_registration_skill, body.authentication.register_uri,
  ];
  assert.ok(urls.length > 10);
  for (const u of urls) assert.ok(String(u).startsWith(ORIGIN), `чужд адрес в индекса: ${u}`);
});

t("индексът не обещава запис и не рекламира администрацията", async () => {
  const { body } = await readIndex();
  assert.equal(body.usage.read_only, true);
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes("/api/admin"), "администрацията няма място в публичен индекс");
  assert.ok(!/\bPOST\b|\bPUT\b|\bDELETE\b/.test(JSON.stringify(body.services)));
  assert.equal(body.usage.content_signal, CONTENT_SIGNAL);
});

t("живите числа идват от базата", async () => {
  const { body } = await readIndex();
  assert.equal(body.data.procedures, 880);
  assert.equal(body.data.countries, 27);
  assert.equal(body.data.last_snapshot, "2026-07-28");
});

t("недостъпна база не сваля индекса — само числата липсват", async () => {
  const { res, body } = await readIndex(makeEnv({ fail: true }));
  assert.equal(res.status, 200, "индексът е статичен по същество");
  assert.equal(body.data.procedures, null);
  assert.equal(body.data.countries, null);
  assert.ok(body.services.length >= 3, "услугите не зависят от базата");
});

t("в индекса няма тайни", async () => {
  const { body } = await readIndex();
  const raw = JSON.stringify(body).toLowerCase();
  for (const bad of ["secret", "api_key", "apikey", "password", "private_key", "client_secret", "bearer "]) {
    assert.ok(!raw.includes(bad), `подозрителен низ в индекса: ${bad}`);
  }
});

// ---------------------------------------------------------------------------
// Свързаност с останалия discovery слой
// ---------------------------------------------------------------------------

t("индексът е обявен в Link заглавките, каталога, llms.txt и robots.txt", async () => {
  assert.ok(AGENT_LINKS.some((l) => l.href === INDEX_PATH && l.rel === "describedby" && l.type === "application/json"));
  assert.ok(agentLinkHeader().includes(`${ORIGIN}${INDEX_PATH}`));

  const catalog = await (apiCatalog()).json();
  const described = catalog.linkset[0].describedby.map((d) => d.href);
  assert.ok(described.includes(`${ORIGIN}${INDEX_PATH}`), "каталогът не сочи към индекса");

  const robots = await robotsTxt().text();
  assert.ok(robots.includes(INDEX_PATH));
  // Индексът трябва да е позволен за обхождане — иначе DNS записът води доникъде.
  assert.ok(robots.includes("Allow: /.well-known/"));

  assert.ok(DISCOVERY_RESOURCES.some((d) => d.path === INDEX_PATH && d.standard === "DNS-AID"));
});

t("Link заглавките пак ползват само регистрирани relation типове", () => {
  const registered = new Set(["api-catalog", "service-desc", "service-doc", "status", "describedby", "sitemap", "canonical", "alternate"]);
  for (const l of AGENT_LINKS) assert.ok(registered.has(l.rel), `нерегистриран rel: ${l.rel}`);
});

// ---------------------------------------------------------------------------
// Админ проверка: документът
// ---------------------------------------------------------------------------

const mockRes = (status, ct, body) => ({ status, headers: new Headers({ "content-type": ct }), text: async () => body });

function siteWith(indexBody, { ct = "application/json; charset=utf-8", status = 200 } = {}) {
  return {
    origin: ORIGIN,
    fetchImpl: async (url) => {
      const u = new URL(url);
      if (u.pathname === INDEX_PATH) return mockRes(status, ct, typeof indexBody === "string" ? indexBody : JSON.stringify(indexBody));
      return mockRes(404, "text/plain", "not found");
    },
  };
}

const GOOD_INDEX = {
  spec: "DNS-AID (draft-mozleywilliams-dnsop-dnsaid-02)",
  dns_record: "_index._agents.euro-funds.eu",
  organization: { name: "Euro-Funding" },
  agents: [],
  agents_note: "Euro-Funding does not operate A2A or MCP agents.",
  services: [{ id: "procedures-api" }, { id: "markdown-pages" }],
  discovery: { api_catalog: `${ORIGIN}/.well-known/api-catalog` },
};

const run = (code, site) =>
  executeCheck({ code, category: "agents", params: {} }, { origin: site.origin, fetchImpl: site.fetchImpl, db: null, sampleProcedurePaths: [] });

t("проверката на индекса минава при коректен документ", async () => {
  const r = await run("agents.agent_index", siteWith(GOOD_INDEX));
  assert.equal(r.status, STATUS.PASSED);
  assert.equal(r.safeDetails.agents, 0);
  assert.deepEqual(r.safeDetails.services, ["procedures-api", "markdown-pages"]);
});

t("липсващ индекс се отчита като неуспех", async () => {
  const r = await run("agents.agent_index", siteWith("", { status: 404, ct: "text/plain" }));
  assert.equal(r.status, STATUS.FAILED);
  assert.equal(r.summaryKey, "agentIndex.absent");
});

t("празен списък агенти БЕЗ обяснение е предупреждение", async () => {
  const { agents_note, ...noNote } = GOOD_INDEX;
  const r = await run("agents.agent_index", siteWith(noNote));
  assert.equal(r.status, STATUS.WARNING);
  assert.ok(r.safeDetails.problems.includes("empty_agents_without_note"));
});

t("липсващо задължително поле е неуспех", async () => {
  const { discovery, ...broken } = GOOD_INDEX;
  const r = await run("agents.agent_index", siteWith(broken));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("missing_discovery"));
});

t("невалиден JSON се хваща", async () => {
  const r = await run("agents.agent_index", siteWith("{не е json"));
  assert.equal(r.status, STATUS.FAILED);
  assert.equal(r.summaryKey, "agentIndex.invalidJson");
});

// ---------------------------------------------------------------------------
// Админ проверка: самият DNS запис (през DNS-over-HTTPS)
// ---------------------------------------------------------------------------

function dohSite({ answer = [], ad = false, status = 200, origin = ORIGIN } = {}) {
  return {
    origin,
    fetchImpl: async (url) => {
      const u = new URL(url);
      if (u.hostname.includes("dns")) {
        return mockRes(status, "application/dns-json", JSON.stringify({ Status: answer.length ? 0 : 3, AD: ad, Answer: answer }));
      }
      return mockRes(404, "text/plain", "not found");
    },
  };
}

const svcb = (data) => ({ name: "_index._agents.euro-funds.eu", type: 64, TTL: 3600, data });

// Двата вида, в които DoH резолверите връщат SVCB. Cloudflare дава суров
// RFC 3597 hex, Google — презентационен низ. Проверка чрез търсене на низа
// „alpn" минава на Google и се проваля на Cloudflare — точно това счупи
// проверката при първото пускане срещу истинския DNS.
const WIRE = "\\# 33 00 01 0a 65 75 72 6f 2d 66 75 6e 64 73 02 65 75 00 00 01 00 06 02 68 32 02 68 33 00 03 00 02 01 bb";
const PRES = '1 euro-funds.eu. alpn=h2,h3 port=443';

t("SVCB се разбира еднакво в суров и в презентационен вид", () => {
  const a = parseSvcbRecord(WIRE);
  const b = parseSvcbRecord(PRES);
  const c = parseSvcbRecord('1 euro-funds.eu. alpn="h2,h3" port="443"');
  for (const [label, r] of [["wire", a], ["presentation", b], ["quoted", c]]) {
    assert.equal(r.priority, 1, label);
    assert.equal(r.target, "euro-funds.eu.", label);
    assert.deepEqual(r.params.alpn, ["h2", "h3"], label);
    assert.equal(r.params.port, 443, label);
    assert.ok(r.keys.includes(1), `${label}: alpn (key 1)`);
    assert.ok(r.keys.includes(3), `${label}: port (key 3)`);
  }
  assert.deepEqual(a, b, "двата вида трябва да дават еднакъв резултат");
});

t("AliasMode и боклук се разпознават, а не се приемат мълчаливо", () => {
  const alias = parseSvcbRecord("0 agent-index.euro-funds.eu.");
  assert.equal(alias.priority, 0);
  assert.deepEqual(alias.keys, [], "AliasMode няма параметри");
  assert.equal(parseSvcbRecord(""), null);
  assert.equal(parseSvcbRecord("\\# 5 zz zz"), null);
  assert.equal(parseSvcbRecord("не е запис"), null);
});

t("суровият вид на Cloudflare минава проверката (регресия)", async () => {
  const r = await run("agents.dns_aid", dohSite({ answer: [svcb(WIRE)], ad: true }));
  assert.equal(r.status, STATUS.PASSED, "hex форматът не бива да дава фалшив missing_alpn");
  assert.deepEqual(r.safeDetails.problems, []);
  assert.deepEqual(r.safeDetails.records, [{ priority: 1, target: "euro-funds.eu.", alpn: ["h2", "h3"], port: 443 }]);
  // Суровият вид се пази, но за човека се показва разчетеният.
  assert.deepEqual(r.safeDetails.raw, [WIRE]);
});

t("суров AliasMode и суров запис без alpn пак са провал", async () => {
  const alias = await run("agents.dns_aid", dohSite({ answer: [svcb("\\# 16 00 00 0a 65 75 72 6f 2d 66 75 6e 64 73 02 65 75 00")], ad: true }));
  assert.equal(alias.status, STATUS.FAILED);
  assert.ok(alias.safeDetails.problems.includes("alias_mode_only"));

  const noAlpn = await run("agents.dns_aid", dohSite({ answer: [svcb("\\# 21 00 01 0a 65 75 72 6f 2d 66 75 6e 64 73 02 65 75 00 00 03 00 02 01 bb")], ad: true }));
  assert.equal(noAlpn.status, STATUS.FAILED);
  assert.ok(noAlpn.safeDetails.problems.includes("missing_alpn"));
});

t("подписан SVCB запис с alpn минава", async () => {
  const r = await run("agents.dns_aid", dohSite({ answer: [svcb('1 euro-funds.eu. alpn="h2,h3" port="443"')], ad: true }));
  assert.equal(r.status, STATUS.PASSED);
  assert.equal(r.safeDetails.dnssecAuthenticated, true);
  assert.equal(r.safeDetails.name, "_index._agents.euro-funds.eu");
  assert.equal(r.safeDetails.records[0].priority, 1);
  assert.deepEqual(r.safeDetails.problems, []);
});

t("запис без DNSSEC е предупреждение, не провал", async () => {
  const r = await run("agents.dns_aid", dohSite({ answer: [svcb('1 euro-funds.eu. alpn="h2,h3" port="443"')], ad: false }));
  assert.equal(r.status, STATUS.WARNING);
  assert.deepEqual(r.safeDetails.problems, ["dnssec_unauthenticated"]);
});

t("липсващ запис е неуспех", async () => {
  const r = await run("agents.dns_aid", dohSite({ answer: [] }));
  assert.equal(r.status, STATUS.FAILED);
  assert.equal(r.summaryKey, "dnsAid.absent");
});

t("AliasMode (приоритет 0) не върши работа — няма параметри", async () => {
  const r = await run("agents.dns_aid", dohSite({ answer: [svcb("0 agent-index.euro-funds.eu.")], ad: true }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("alias_mode_only"));
});

t("ServiceMode без alpn е неуспех", async () => {
  const r = await run("agents.dns_aid", dohSite({ answer: [svcb('1 euro-funds.eu. port="443"')], ad: true }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("missing_alpn"));
});

t("недостъпен резолвер е предупреждение — не твърдим, че записът липсва", async () => {
  const r = await run("agents.dns_aid", dohSite({ status: 500 }));
  assert.equal(r.status, STATUS.WARNING);
  assert.equal(r.summaryKey, "dnsAid.resolverUnreachable");
});

t("локална среда → проверката не важи", async () => {
  const r = await run("agents.dns_aid", dohSite({ origin: "http://localhost:8787" }));
  assert.equal(r.status, STATUS.NOT_APPLICABLE);
  assert.equal(r.summaryKey, "dnsAid.notPublic");
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
  console.log(`\n${passed}/${tests.length} passed (DNS-AID)`);
}
