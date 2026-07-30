// Тестове за Agent Skills Discovery (RFC v0.2.0 —
// github.com/cloudflare/agent-skills-discovery-rfc).
//
// Най-важният инвариант: дайджестът в индекса съвпада БАЙТ ПО БАЙТ със
// сервирания SKILL.md. Разминаване е тихо — индексът изглежда наред, а агентите
// мълчаливо отказват да ползват skill-овете.
//
//   node test/agent-skills.test.mjs

import assert from "node:assert/strict";

import {
  handleAgentSkills, skillDocument, skillDigest, skillsIndexDocument,
  skillDefinitionProblems, SKILL_NAMES, SKILLS_SCHEMA, SKILLS_INDEX_PATH,
} from "../worker/agent/skills.js";
import { AGENT_LINKS, agentLinkHeader, apiCatalog, robotsTxt } from "../worker/agent/discovery.js";
import { DISCOVERY_RESOURCES } from "../worker/discovery/inventory.js";
import { executeCheck, STATUS } from "../worker/discovery/validation.js";

let passed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

const ORIGIN = "https://euro-funds.eu";
const te = new TextEncoder();

const sha256 = async (text) => {
  const buf = await crypto.subtle.digest("SHA-256", te.encode(text));
  return "sha256:" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const call = (url, init = {}) => handleAgentSkills(new Request(url, init), {}, new URL(url));

// ---------------------------------------------------------------------------
// Индексът
// ---------------------------------------------------------------------------

t("индексът се сервира по RFC-то и няма излишни полета", async () => {
  const r = await call(`${ORIGIN}${SKILLS_INDEX_PATH}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  const body = await r.json();
  assert.equal(body.$schema, SKILLS_SCHEMA);
  assert.match(body.$schema, /^https:\/\/schemas\.agentskills\.io\/discovery\/0\.2\.0\//);
  // Строг валидатор може да се спъне в непознати полета на най-горно ниво.
  assert.deepEqual(Object.keys(body).sort(), ["$schema", "skills"]);
  assert.equal(body.skills.length, 3);
});

t("всеки запис носи всички задължителни полета в правилния вид", async () => {
  const { skills } = await skillsIndexDocument(ORIGIN);
  const seen = new Set();
  for (const s of skills) {
    assert.deepEqual(Object.keys(s).sort(), ["description", "digest", "name", "type", "url"]);
    assert.match(s.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `име: ${s.name}`);
    assert.ok(s.name.length >= 1 && s.name.length <= 64);
    assert.ok(!seen.has(s.name), `дублирано име: ${s.name}`);
    seen.add(s.name);
    assert.equal(s.type, "skill-md");
    assert.ok(s.description.length > 0 && s.description.length <= 1024);
    assert.equal(s.url, `${ORIGIN}${SKILLS_INDEX_PATH.replace("/index.json", "")}/${s.name}/SKILL.md`);
    assert.match(s.digest, /^sha256:[0-9a-f]{64}$/);
  }
});

// ---------------------------------------------------------------------------
// Дайджестът — сърцевината
// ---------------------------------------------------------------------------

t("дайджестът съвпада с байтовете, които реално се сервират", async () => {
  const { skills } = await skillsIndexDocument(ORIGIN);
  for (const s of skills) {
    const res = await call(s.url);
    assert.equal(res.status, 200, s.name);
    const served = await res.text();
    assert.equal(await sha256(served), s.digest, `дайджестът не отговаря на сервирания ${s.name}`);
  }
});

t("дайджестът е стабилен между извикванията (без дата, без броячи)", async () => {
  const a = await skillsIndexDocument(ORIGIN);
  await new Promise((r) => setTimeout(r, 5));
  const b = await skillsIndexDocument(ORIGIN);
  assert.deepEqual(a, b, "индексът трябва да е детерминистичен");
  for (const name of SKILL_NAMES) {
    assert.equal(skillDocument(name), skillDocument(name));
    assert.equal(await skillDigest(name), await skillDigest(name));
  }
});

t("съдържанието не съдържа нищо променливо във времето", () => {
  const year = String(new Date().getFullYear());
  for (const name of SKILL_NAMES) {
    const text = skillDocument(name);
    // Дата на генериране или ISO timestamp биха счупили дайджеста между две заявки.
    assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text), `${name}: ISO timestamp в съдържанието`);
    assert.ok(!new RegExp(`generated[^\\n]*${year}`, "i").test(text), `${name}: дата на генериране`);
  }
});

// ---------------------------------------------------------------------------
// Самите SKILL.md файлове
// ---------------------------------------------------------------------------

t("всеки SKILL.md започва с frontmatter, чиито name и description съвпадат с индекса", async () => {
  const { skills } = await skillsIndexDocument(ORIGIN);
  for (const s of skills) {
    const text = skillDocument(s.name);
    assert.ok(text.startsWith("---\n"), `${s.name}: липсва frontmatter`);
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
    assert.ok(fm, `${s.name}: незатворен frontmatter`);
    assert.match(fm[1], new RegExp(`^name: ${s.name}$`, "m"));
    assert.ok(fm[1].includes(s.description.replace(/"/g, '\\"')), `${s.name}: описанието се разминава с индекса`);
    // След frontmatter-а трябва да има истински инструкции, не празно.
    assert.ok(text.slice(fm[0].length).trim().length > 500, `${s.name}: съдържанието е твърде кратко`);
  }
});

t("вътрешните ни правила за skill-овете се спазват", () => {
  assert.deepEqual(skillDefinitionProblems(), []);
});

t("skill-овете не обещават запис и не рекламират администрацията", () => {
  for (const name of SKILL_NAMES) {
    const text = skillDocument(name);
    // Администрацията може да бъде спомената САМО за да се каже, че е недостъпна
    // — това спестява на агента безсмислено сондиране. Всяко друго споменаване
    // би било реклама на нещо, до което той няма и не бива да има достъп.
    for (const line of text.split("\n").filter((l) => l.includes("/api/admin"))) {
      assert.match(line, /\bnever\b|\bnot\b|\bno\b/i, `${name}: администрацията е спомената без отрицание: ${line.trim()}`);
    }
    assert.ok(!/\bcurl -X (POST|PUT|DELETE)\b/.test(text), `${name}: примери за запис`);
  }
  // Skill-ът за достъп ГОВОРИ за POST (регистрацията е POST) — но казва изрично
  // че данните са само за четене.
  assert.match(skillDocument("euro-funding-access"), /[Rr]ead-only/);
  assert.match(skillDocument("euro-funding-procedures"), /No credential required|needs no credential/i);
});

t("skill-овете сочат само към собствения произход", () => {
  for (const name of SKILL_NAMES) {
    const urls = skillDocument(name).match(/https?:\/\/[^\s)`"']+/g) || [];
    assert.ok(urls.length > 3, `${name}: няма адреси`);
    for (const u of urls) assert.ok(u.startsWith(ORIGIN), `${name}: чужд адрес ${u}`);
  }
});

t("непознат skill дава 404, а не празен файл", async () => {
  const r = await call(`${ORIGIN}/.well-known/agent-skills/no-such-skill/SKILL.md`);
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.equal(body.error, "not_found");
  assert.ok(body.index.endsWith(SKILLS_INDEX_PATH));
});

t("методи, различни от GET/HEAD, се отказват", async () => {
  const r = await call(`${ORIGIN}${SKILLS_INDEX_PATH}`, { method: "POST" });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "GET, HEAD");
});

t("непокрит път връща null (не прихваща чужди маршрути)", async () => {
  assert.equal(await call(`${ORIGIN}/procedures`), null);
  assert.equal(await call(`${ORIGIN}/.well-known/api-catalog`), null);
});

// ---------------------------------------------------------------------------
// Свързаност с discovery слоя
// ---------------------------------------------------------------------------

t("индексът е обявен в Link заглавките, каталога, llms.txt и robots.txt", async () => {
  assert.ok(AGENT_LINKS.some((l) => l.href === SKILLS_INDEX_PATH && l.rel === "describedby"));
  assert.ok(agentLinkHeader().includes(`${ORIGIN}${SKILLS_INDEX_PATH}`));

  const catalog = await apiCatalog().json();
  const described = catalog.linkset[0].describedby.map((d) => d.href);
  assert.ok(described.includes(`${ORIGIN}${SKILLS_INDEX_PATH}`));

  const robots = await robotsTxt().text();
  assert.ok(robots.includes("/.well-known/agent-skills/"));
  assert.ok(robots.includes("Allow: /.well-known/"), "skill-овете трябва да са достъпни за обхождане");

  assert.ok(DISCOVERY_RESOURCES.some((d) => d.path === SKILLS_INDEX_PATH));
});

// ---------------------------------------------------------------------------
// Админ проверката
// ---------------------------------------------------------------------------

const mockRes = (status, ct, body) => ({ status, headers: new Headers({ "content-type": ct }), text: async () => body });

/** Сайт, който сервира истинския ни индекс и истинските ни skill-ове. */
function liveSite(overrides = {}) {
  return {
    origin: ORIGIN,
    fetchImpl: async (url) => {
      const u = new URL(url);
      if (overrides[u.pathname]) {
        const o = overrides[u.pathname];
        return mockRes(o.status ?? 200, o.ct ?? "application/json; charset=utf-8", typeof o.body === "string" ? o.body : JSON.stringify(o.body));
      }
      if (u.pathname === SKILLS_INDEX_PATH) {
        return mockRes(200, "application/json; charset=utf-8", JSON.stringify(await skillsIndexDocument(ORIGIN), null, 2));
      }
      const m = /^\/\.well-known\/agent-skills\/([a-z0-9-]+)\/SKILL\.md$/.exec(u.pathname);
      if (m && skillDocument(m[1])) return mockRes(200, "text/markdown; charset=utf-8", skillDocument(m[1]));
      return mockRes(404, "text/plain", "not found");
    },
  };
}

const run = (site) =>
  executeCheck({ code: "agents.skills_index", category: "agents", params: {} },
    { origin: site.origin, fetchImpl: site.fetchImpl, db: null, sampleProcedurePaths: [] });

t("проверката минава срещу истинския индекс и истинските skill-ове", async () => {
  const r = await run(liveSite());
  assert.equal(r.status, STATUS.PASSED, JSON.stringify(r.safeDetails && r.safeDetails.problems));
  assert.equal(r.safeDetails.verified.length, 3);
  for (const v of r.safeDetails.verified) assert.equal(v.digestMatches, true, v.name);
});

t("разминат дайджест се хваща — това е целият смисъл на проверката", async () => {
  const doc = await skillsIndexDocument(ORIGIN);
  doc.skills[1].digest = "sha256:" + "0".repeat(64);
  const r = await run(liveSite({ [SKILLS_INDEX_PATH]: { body: doc } }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.some((x) => x.startsWith("digest_mismatch:")));
  assert.equal(r.safeDetails.verified.find((v) => v.name === doc.skills[1].name).digestMatches, false);
});

t("skill, който е в индекса, но не се сервира, е провал", async () => {
  const doc = await skillsIndexDocument(ORIGIN);
  doc.skills.push({ name: "ghost-skill", type: "skill-md", description: "Не съществува.", url: `${ORIGIN}/.well-known/agent-skills/ghost-skill/SKILL.md`, digest: "sha256:" + "a".repeat(64) });
  const r = await run(liveSite({ [SKILLS_INDEX_PATH]: { body: doc } }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.some((x) => x.startsWith("unreachable:ghost-skill")));
});

t("липсващо задължително поле и грешен тип се хващат", async () => {
  const doc = await skillsIndexDocument(ORIGIN);
  delete doc.skills[0].digest;
  doc.skills[2].type = "container";
  const r = await run(liveSite({ [SKILLS_INDEX_PATH]: { body: doc } }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.some((x) => x.startsWith("missing_digest:")));
  assert.ok(r.safeDetails.problems.some((x) => x.startsWith("bad_type:")));
});

t("чужд адрес в индекса е провал (агентът се праща другаде)", async () => {
  const doc = await skillsIndexDocument(ORIGIN);
  doc.skills[0].url = "https://evil.example/SKILL.md";
  const r = await run(liveSite({ [SKILLS_INDEX_PATH]: { body: doc } }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.some((x) => x.startsWith("foreign_url:")));
});

t("грешна схема и празен масив се хващат", async () => {
  const bad = { $schema: "https://example.com/other.json", skills: [] };
  const r = await run(liveSite({ [SKILLS_INDEX_PATH]: { body: bad } }));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("bad_schema"));
  assert.ok(r.safeDetails.problems.includes("empty"));
});

t("липсващ или невалиден индекс се отчита ясно", async () => {
  const missing = await run(liveSite({ [SKILLS_INDEX_PATH]: { status: 404, ct: "text/plain", body: "not found" } }));
  assert.equal(missing.status, STATUS.FAILED);
  assert.equal(missing.summaryKey, "skills.absent");

  const broken = await run(liveSite({ [SKILLS_INDEX_PATH]: { body: "{не е json" } }));
  assert.equal(broken.status, STATUS.FAILED);
  assert.equal(broken.summaryKey, "skills.invalidJson");

  const noArray = await run(liveSite({ [SKILLS_INDEX_PATH]: { body: { $schema: SKILLS_SCHEMA } } }));
  assert.equal(noArray.status, STATUS.FAILED);
  assert.equal(noArray.summaryKey, "skills.noArray");
});

t("SKILL.md без frontmatter се хваща", async () => {
  const path = `/.well-known/agent-skills/${SKILL_NAMES[0]}/SKILL.md`;
  const naked = "# Без frontmatter\n\nСамо текст.";
  const doc = await skillsIndexDocument(ORIGIN);
  doc.skills[0].digest = await sha256(naked);
  const r = await run(liveSite({
    [SKILLS_INDEX_PATH]: { body: doc },
    [path]: { ct: "text/markdown; charset=utf-8", body: naked },
  }));
  assert.equal(r.status, STATUS.WARNING, JSON.stringify(r.safeDetails.problems));
  assert.ok(r.safeDetails.problems.some((x) => x.startsWith("no_frontmatter:")));
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
  console.log(`\n${passed}/${tests.length} passed (Agent Skills)`);
}
