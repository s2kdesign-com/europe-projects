// Agent Skills Discovery (RFC v0.2.0 — github.com/cloudflare/agent-skills-discovery-rfc).
//
// Публикува индекс на /.well-known/agent-skills/index.json и самите skill-ове на
// /.well-known/agent-skills/<име>/SKILL.md. Skill е инструкция, която агент
// зарежда, преди да работи с даден ресурс — тук: как да търси процедури, как да
// получи достъп до лични данни и как да се ориентира в държавите и програмите.
//
// ЗАЩО СЪДЪРЖАНИЕТО Е КОНСТАНТА, А ДАЙДЖЕСТЪТ СЕ СМЯТА
//
// Всеки запис в индекса носи `digest: "sha256:<хекс>"` върху байтовете на
// артефакта. Ако дайджестът се пишеше на ръка, всяка редакция на текста без
// ръчно преизчисляване щеше да го разсинхронизира — агентът тегли skill-а,
// хешът не съвпада и с право отказва да го ползва. Затова дайджестът се смята
// от СЪЩАТА функция, която сервира файла. Разминаване е невъзможно по
// конструкция, а не по дисциплина.
//
// От същото следва и второ правило: съдържанието на SKILL.md трябва да е
// ДЕТЕРМИНИСТИЧНО. Без дата, без брояч от базата, без версия — иначе индексът и
// файлът могат да се разминат между две заявки и дайджестът пада. Живите числа
// живеят в /.well-known/agent-index.json, който няма дайджест.

const SITE = "https://euro-funds.eu";
const BRAND = "Euro-Funding";

export const SKILLS_BASE = "/.well-known/agent-skills";
export const SKILLS_INDEX_PATH = `${SKILLS_BASE}/index.json`;
export const SKILLS_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

const te = new TextEncoder();

// ---------------------------------------------------------------------------
// Skill 1 — процедури
// ---------------------------------------------------------------------------

const PROCEDURES_DESC =
  "Search and read European and national funding procedures across the 27 EU member states via the Euro-Funding public API. No credential required.";

const PROCEDURES_BODY = `# Searching Euro-Funding procedures

${BRAND} (${SITE}) tracks open, upcoming and closed funding procedures across
the 27 EU member states, compiled from official national and EU sources.

Everything in this skill is **public and needs no credential**. Register only if
you need a specific user's profile or saved list — see the \`euro-funding-access\`
skill for that.

## Base

\`${SITE}/api\` — read-only, \`GET\` only, JSON. Machine-readable description:
\`${SITE}/openapi.json\`.

## List procedures for a country

\`\`\`http
GET ${SITE}/api/projects?country=BG
\`\`\`

\`country\` is an ISO 3166-1 alpha-2 code and defaults to \`BG\`. Response:

\`\`\`json
{ "ok": true, "country": "BG", "projects": [ ... ], "snapshot": { ... } }
\`\`\`

Call \`GET ${SITE}/api/countries\` first if you need the list of covered
countries; each entry carries \`code\`, \`slug\`, names, \`currency_code\` and
\`coverage_status\`.

## Fields that matter

| Field | Meaning |
| --- | --- |
| \`id\` | Stable slug. Does not change between syncs — safe to store. |
| \`name\` | Procedure title as published by the source. |
| \`status\` | \`open\`, \`closing_soon\`, \`upcoming\` or \`closed\`. |
| \`deadline\` | The deadline **as worded by the source** (free text). |
| \`deadline_date\` | Parsed ISO date, or \`null\` when the source gave no parseable date. |
| \`budget\` | Budget as worded by the source. |
| \`budget_amount_eur\` | Parsed amount in EUR, or \`null\`. |
| \`eligible\` | Who may apply, as worded by the source. |
| \`official_url\` | The authoritative page at the issuing authority. |
| \`managing_authority\` | The body running the procedure. |
| \`country_code\` | Two uppercase letters. |
| \`program\`, \`priority\` | Operational programme and priority axis, when known. |

## Four traps worth knowing

**\`budget_amount_eur: null\` does not mean zero.** It means the source did not
publish a parseable figure. Never render it as "0 EUR" and never sum over it
without excluding nulls — you will understate totals.

**\`deadline_date: null\` does not mean "no deadline".** Fall back to the
free-text \`deadline\` field and show it verbatim.

**\`status\` reflects the last sync, not this second.** A procedure marked
\`open\` may have closed hours ago. For anything a user will act on, link to
\`official_url\` and say the status is as of the last sync.

**The web URL is not built from \`id\` directly.** The page path lowercases the
id and replaces every non-alphanumeric run with a single hyphen:

\`\`\`
id  BG:2024:BG16RFPR001-1.001
URL ${SITE}/procedures/bg-2024-bg16rfpr001-1-001
\`\`\`

Using the raw id gives a 404.

## One procedure, with its documents

\`\`\`http
GET ${SITE}/api/project?id=<id>
GET ${SITE}/api/documents?project_id=<id>
\`\`\`

Documents carry \`title\`, \`doc_type\`, \`source_url\` and \`content\` — a
markdown summary of the document, not the document itself. When the user needs
the actual guidelines, send them to \`source_url\`.

## Reading pages instead of JSON

Every public page also serves markdown:

\`\`\`http
GET ${SITE}/procedures/bg-2024-bg16rfpr001-1-001
Accept: text/markdown
\`\`\`

Useful when you want the rendered narrative rather than raw fields. The site map
for language models is at \`${SITE}/llms.txt\`.

## Rules

- Attribute figures to ${BRAND} and link \`official_url\` alongside. This data is
  compiled from official sources and does not replace the official procedure
  documentation.
- Do not present a procedure as still open without saying when it was last
  synced. \`GET ${SITE}/api/health\` reports \`dataSnapshot\`.
- Write access does not exist on this API. Any non-GET request is refused.
- Terms: ${SITE}/terms
`;

// ---------------------------------------------------------------------------
// Skill 2 — достъп до лични данни
// ---------------------------------------------------------------------------

const ACCESS_DESC =
  "Register an agent credential with Euro-Funding and read a user's funding profile and saved procedures. Read-only; requires the user's consent.";

const ACCESS_BODY = `# Getting access to a user's Euro-Funding data

Use this skill only when the user wants **their own** ${BRAND} profile or saved
procedures used in your work. Public procedure data needs no credential at all —
see the \`euro-funding-procedures\` skill.

The full protocol manifest is at \`${SITE}/auth.md\` and is the authoritative
source. This skill is the short version.

## Decide whether you need this

| You need | Credential? |
| --- | --- |
| Procedures, programmes, countries, sources | No |
| Markdown of any public page | No |
| The user's funding profile | Yes, linked to their account |
| The user's saved procedures | Yes, linked to their account |

## Discover, then register

1. \`GET ${SITE}/.well-known/oauth-protected-resource\`
2. \`GET ${SITE}/.well-known/oauth-authorization-server\` → read the \`agent_auth\` block
3. \`POST\` to its \`register_uri\` (currently \`${SITE}/agent/auth\`)

Read the URLs from the metadata rather than hard-coding them.

Three ways to register:

**Anonymous** — a credential immediately, public data only:

\`\`\`json
{ "identity_type": "anonymous", "agent": { "name": "Your Agent" } }
\`\`\`

**Verified email** — the user confirms with a 6-digit code:

\`\`\`json
{ "identity_type": "identity_assertion", "assertion_type": "verified_email",
  "email": "person@example.com", "agent": { "name": "Your Agent" } }
\`\`\`

**ID-JAG** — your identity provider asserts the user, no human step. Only
accepted from issuers registered with us; \`${SITE}/auth.md\` lists them.

## The claim ceremony

When the response says \`status: "unclaimed"\`, you hold a public-scope
credential and a \`claim\` object.

1. \`POST\` \`{ registration_id, email }\` to the \`claim_uri\` if you do not
   already have a \`claim_token\`.
2. We email the user a 6-digit code, valid 15 minutes.
3. **Ask the user for the code. Never guess it** — five wrong codes end the
   ceremony and you must start over.
4. \`POST\` \`{ claim_token, code }\` to the completion URI.

Hold \`claim_token\` in memory for the ceremony only. Never log it, never persist
it.

A \`409 no_account\` means the code was right but no verified account exists for
that address. Ask the user to sign in at ${SITE} once, then repeat. Do not try
to create an account — you cannot, and attempting it wastes the user's time.

## Using the credential

\`\`\`http
GET ${SITE}/api/saved-procedures
Authorization: Bearer <credential>
\`\`\`

- Scopes: \`procedures:read\` always; \`openid\`, \`profile:read\`,
  \`saved:read\` only after the claim completes.
- Credentials last one hour. Renew with \`{ refresh_token }\` at the token URI.
  Refresh tokens rotate — presenting a used one revokes the whole registration.
- Read-only. Any non-GET request returns \`403\`. \`/api/admin/*\` is never
  reachable.
- On \`401\`, start again at discovery. Never retry a stashed credential.

## Rules

- Tell the user what you are about to do **before** you assert their identity.
- Never assert an identity the user has not confirmed to you.
- Revoke when the work is done: \`POST { registration_id }\` to the revocation
  URI, or send the credential as a Bearer header. Revocation is immediate.
- The user's profile describes their company, not a person's private life —
  still, do not repeat it into contexts they did not ask for.
`;

// ---------------------------------------------------------------------------
// Skill 3 — държави и програми
// ---------------------------------------------------------------------------

const COUNTRIES_DESC =
  "Navigate Euro-Funding coverage by country: which member states are tracked, their operational programmes, regions, currencies and official sources.";

const COUNTRIES_BODY = `# Countries, programmes and sources on Euro-Funding

${BRAND} tracks funding across the 27 EU member states. Coverage is not uniform:
some countries have deep national programme data, others only what their
official portals publish. This skill is about finding out which is which before
you draw conclusions.

## Which countries are covered

\`\`\`http
GET ${SITE}/api/countries
\`\`\`

Each entry:

| Field | Meaning |
| --- | --- |
| \`code\` | ISO 3166-1 alpha-2, uppercase. Use this in every other call. |
| \`slug\` | URL-safe name for web page paths. |
| \`name_bg\`, \`native_name\`, \`english_name\` | Names. \`native_name\` may be \`null\`. |
| \`currency_code\` | National currency. Not every member state uses EUR. |
| \`coverage_status\` | How complete our tracking is for this country. |
| \`ingestion_status\` | State of the most recent sync. |
| \`last_successful_sync_at\` | When data for this country last updated. |

**Check \`last_successful_sync_at\` before comparing countries.** A country
synced last week and one synced last night are not comparable on "number of open
procedures", and presenting them side by side without saying so is misleading.

## Programmes, regions and currency for one country

\`\`\`http
GET ${SITE}/api/countries/profile-options?country=PL
\`\`\`

Returns the operational programmes, the regions used for eligibility, and the
currency for that country. This is what the site's own profile form is built
from, so the values match what procedures actually carry in \`program\` and
\`priority\`.

## Where the data comes from

\`\`\`http
GET ${SITE}/api/sources?country=PL
\`\`\`

The official portals and registers a country's data is compiled from. Cite these
when a user asks "where does this come from" — the honest answer is a national
authority, not us.

## Platform-wide numbers

\`\`\`http
GET ${SITE}/api/public/platform-statistics
GET ${SITE}/api/health
\`\`\`

The first gives statistics from the last published snapshot; the second reports
\`procedures\`, \`countries\` and \`dataSnapshot\` live. Prefer \`/api/health\`
when you need to state how fresh the data is.

If you do not know which country the user means, \`GET ${SITE}/api/geo\` returns
an approximate country for the request. Treat it as a default to confirm, never
as a fact about the user.

## Rules

- Currency is per country. Do not assume EUR — \`budget_amount_eur\` is a
  converted convenience field and is \`null\` when no figure could be parsed.
- Coverage gaps are real. "No open procedures in country X" may mean none exist,
  or may mean we have not synced X recently. Say which one you checked.
- Country names differ by language and by politics. Prefer \`code\` internally
  and show \`english_name\` or \`native_name\` to people.
`;

// ---------------------------------------------------------------------------
// Регистър
// ---------------------------------------------------------------------------

// Името е по правилата на RFC-то: 1–64 знака, само малки букви, цифри и тире,
// без водещо/крайно/двойно тире. Описанието се ползва И в индекса, И във
// frontmatter-а на файла — един източник, за да не се разминат.
const SKILLS = [
  { name: "euro-funding-procedures", description: PROCEDURES_DESC, body: PROCEDURES_BODY },
  { name: "euro-funding-access", description: ACCESS_DESC, body: ACCESS_BODY },
  { name: "euro-funding-countries", description: COUNTRIES_DESC, body: COUNTRIES_BODY },
];

export const SKILL_NAMES = SKILLS.map((s) => s.name);
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** YAML frontmatter + markdown. Детерминистично — виж бележката най-горе. */
function renderSkill(skill) {
  // Описанието влиза в YAML низ; кавичките се екранират по YAML правилата.
  const desc = skill.description.replace(/"/g, '\\"');
  return `---\nname: ${skill.name}\ndescription: "${desc}"\n---\n\n${skill.body}`;
}

const rendered = new Map(SKILLS.map((s) => [s.name, renderSkill(s)]));
const digests = new Map();

/** Текстът на един skill или null при непознато име. */
export function skillDocument(name) {
  return rendered.get(name) || null;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", te.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Дайджест върху точно байтовете, които се сервират. Кешира се — текстът е константа. */
export async function skillDigest(name) {
  if (digests.has(name)) return digests.get(name);
  const text = rendered.get(name);
  if (!text) return null;
  const hex = await sha256Hex(text);
  digests.set(name, `sha256:${hex}`);
  return digests.get(name);
}

/** Индексът по RFC v0.2.0. Само `$schema` и `skills` — без излишни полета. */
export async function skillsIndexDocument(origin = SITE) {
  const skills = [];
  for (const s of SKILLS) {
    skills.push({
      name: s.name,
      type: "skill-md",
      description: s.description,
      url: `${origin}${SKILLS_BASE}/${s.name}/SKILL.md`,
      digest: await skillDigest(s.name),
    });
  }
  return { $schema: SKILLS_SCHEMA, skills };
}

/** Проверка на самите ни правила — ползва се от тестовете и от админ одита. */
export function skillDefinitionProblems() {
  const problems = [];
  const seen = new Set();
  for (const s of SKILLS) {
    if (!NAME_RE.test(s.name) || s.name.length > 64) problems.push(`bad_name:${s.name}`);
    if (seen.has(s.name)) problems.push(`duplicate_name:${s.name}`);
    seen.add(s.name);
    if (!s.description || s.description.length > 1024) problems.push(`bad_description:${s.name}`);
    const text = rendered.get(s.name);
    if (!text.startsWith("---\n")) problems.push(`missing_frontmatter:${s.name}`);
    if (!text.includes(`\nname: ${s.name}\n`)) problems.push(`frontmatter_name_mismatch:${s.name}`);
    if (!text.includes(s.description.replace(/"/g, '\\"'))) problems.push(`frontmatter_description_mismatch:${s.name}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=3600",
  "access-control-allow-origin": "*",
  "x-content-type-options": "nosniff",
};
const MD_HEADERS = {
  "content-type": "text/markdown; charset=utf-8",
  "cache-control": "public, max-age=3600",
  "access-control-allow-origin": "*",
  "x-content-type-options": "nosniff",
};

/** Връща Response за пътищата на Agent Skills или null. */
export async function handleAgentSkills(request, env, url) {
  const { pathname } = url;
  if (!pathname.startsWith(SKILLS_BASE)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }

  if (pathname === SKILLS_INDEX_PATH) {
    // Каноничният домейн, не url.origin: индексът се сервира еднакво и през
    // workers.dev адреса, а дайджестите не зависят от произхода.
    const doc = await skillsIndexDocument(SITE);
    return new Response(JSON.stringify(doc, null, 2), { status: 200, headers: JSON_HEADERS });
  }

  const m = new RegExp(`^${SKILLS_BASE}/([a-z0-9-]{1,64})/SKILL\\.md$`).exec(pathname);
  if (m) {
    const text = skillDocument(m[1]);
    if (!text) {
      return new Response(JSON.stringify({ error: "not_found", error_description: "Unknown skill.", index: `${SITE}${SKILLS_INDEX_PATH}` }, null, 2), {
        status: 404, headers: { ...JSON_HEADERS, "cache-control": "no-store" },
      });
    }
    return new Response(text, {
      status: 200,
      headers: { ...MD_HEADERS, "x-skill-digest": await skillDigest(m[1]) },
    });
  }

  return null;
}
