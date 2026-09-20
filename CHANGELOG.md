## 2.60.0 — 2026-09-20

- Added a daily EU-27 social publishing pipeline with live D1 facts, native-language framing and image/link cadence.
- Added cloud history, atomic platform claims, conservative uncertain-delivery handling and isolated KV image delivery.
- Included bundled Unicode fonts, offline tests, live-data dry-run checks and setup/run documentation.
- Social publishing activation requires owner-provided Facebook and LinkedIn credentials; no social posts were sent during implementation.

## 2.59.0 — 2026-09-20

- Country-local daily notification hour with a 10:00 default, DST handling, and persisted preferences.
- Configured Premium plan selector, truthful annual savings, and all supported UI translations.
- Shared responsive procedure actions, paired Save/Compare, and constrained translated cards/drawers.
- Resolve existing lint errors in navigation and helper naming.

## 2.58.0 — 2026-09-20

- Fixed direct notification activation and optional Google onboarding return context.
- Added anonymous country alerts in the existing push pipeline, safe account linking, and canonical daily counts.
- Preserved Premium reports/preferences and added a server-enforced daily notification cap.

## 2.57.0 — 2026-09-19

- Added database-managed monthly/annual Stripe subscriptions, secure checkout and customer portal.
- Added verified lifecycle webhooks, immutable price history, payment records and admin Payments controls.
- Added server-authorized Premium daily AI reports, owned history and report notifications; preserved manual Premium and free alerts.

# 2.56.0 — 2026-09-19

Opt-in browser push with real server tests, session-bound subscriptions, saved-procedure change and deadline notifications, preference enforcement, and welcome/scroll/24-hour onboarding. See docs/web-push.md for security and deployment.

## 2.55.1 — 2026-09-19

- Show the latest completed audit per category without counting retired historical samples as current failures.
- Correct procedure counts, measured sitemap cache and official-source fallback validation.
- Use concise, distinct page metadata and flag elapsed deadlines without inventing closure dates.
- Add Google's supported plain-text sitemap with the same validated inventory as XML, plus parity monitoring.

## 2.55.0 — 2026-09-17

- Permanent unique procedure and scoped program URLs; preserve legacy winners and working drawer links.
- Complete, validated dynamic sitemap with explicit retryable failures.
- Crawlable country directories, corrected sources, canonical signals and structured data.
- Regression coverage and public production SEO monitoring.

# Дневник на промените (Changelog)

Форматът следва [Keep a Changelog](https://keepachangelog.com/) и семантично
версиониране. Най-новото е най-отгоре. Добавяй нов запис при всяка версия.

## 2.54.0 — 2026-08-05

### Добавено — WebMCP: инструменти на СТРАНИЦАТА за агенти в браузъра

Скенерът на isitagentready.com отчиташе `No WebMCP tools detected on page load`.
v2.53.0 покри ОТДАЛЕЧЕНИЯ агент (`POST /mcp`); това тук е другият
случай — агент, който е ВЪТРЕ в браузъра на потребителя и вижда отворения
таб, сесията и избраната държава.

#### `app/lib/webmcp.js` (нов)
- **Форма:** една самостоятелна функция `webmcpBootstrap(scope)`, сериализирана
  с `Function.prototype.toString()` в `WEBMCP_INIT_SCRIPT`. Не реферира НИЩО извън
  собственото си тяло (иначе минификаторът щеше да пренапише име, което в
  HTML-а няма да съществува) и е писана в ES5 стил — без arrow/async, за да не
  влезе regenerator помощник от модулния скоуп.
- **Двата интерфейса:** `navigator.modelContext.provideContext({tools})` (Chrome EPP)
  И `document.modelContext.registerTool(tool)` (W3C чернова). Регистрира се във
  всеки наличен, ако са различни обекти — спецификацията още се мести.
- **Инструменти (7):** `search_procedures`, `get_procedure`, `list_countries`,
  `list_sources`, `platform_statistics` (огледални на сървърните, `readOnlyHint`)
  + `open_procedure` и `navigate_site` — това, което отдалечен агент НЕ може.
- **Данни:** само публичните REST endpoint-и (`/api/projects`, `/api/project`,
  `/api/countries`, `/api/sources`, `/api/public/platform-statistics`), винаги
  `credentials: "omit"` — агент не може да се вози на сесията на потребителя.
  Липсваща държава → guest предпочитанието от `eurofunds_country_v1` → BG.
- **URL-и:** през опростен `codeSlug` (кодовете са ASCII → без транслитерация);
  `get_procedure` приема и slug — при неуспех по суров id го търси по кодовата
  част. Навигацията пази езиковия префикс (`/en/...`).
- **Грешки:** проблем в данните → `isError` с четим текст (моделът се коригира
  сам), не хвърлено изключение. Целият bootstrap е в try/catch — готовността
  за агенти никога не чупи страницата за хората.
- **Късно инжектиране:** ако интерфейсът го няма на page load → retry в ограничен
  прозорец (250 ms × 60) + `DOMContentLoaded`/`load`/`modelcontextready`.
  НАРОЧНО БЕЗ `Object.defineProperty` върху `navigator` — собствено свойство би
  засенчило истинската имплементация, инсталирана по-късно на прототипа.
- **За скенери:** `window.__WEBMCP__` / `window.__WEBMCP_TOOLS__` излагат обявеното
  без `execute`; достъпът е изрично `G.navigator.modelContext`, за да остане литералът
  `navigator.modelContext` в сервирания HTML дори след минификация.

#### `app/layout.jsx`
- Инлайн `<script id="webmcp">` в `<head>`, веднага след no-flash скрипта и ПРЕДИ
  GA. Клиентски компонент НЕ върши работа: сайтът е статичен експорт, React
  бъндълът се зарежда след първия рисунък, а скенерите гледат „на page load".
  Размер на инлайн скрипта след минификация: ~10.7 KB (~3 KB gzip).

#### Тестове
- `test/webmcp.test.mjs` (26) — регистрация през двата интерфейса, валидност на
  дескрипторите, изпълнение на всеки инструмент срещу fake `fetch`, slug
  fallback, навигация с езиков префикс, счупен localStorage, мрежова грешка,
  късно инжектиране и eval на сериализирания скрипт.
- Допълнителна проверка срещу esbuild `--minify` bundle: след минификация
  скриптът все още регистрира и 7-те инструмента и гради верните URL-и.

## 2.53.0 — 2026-08-05

### Добавено — MCP сървър + Server Card (SEP-1649/SEP-2127, чернова)

Скенерът на isitagentready.com отчиташе `MCP Server Card not found`.
Публикувана е карта на `/.well-known/mcp/server-card.json` — но НЕ само карта:
зад нея стои работещ MCP сървър. Карта, сочеща към несъществуващ endpoint,
минава скенера и се чупи при първия агент, който я прочете.

#### `worker/agent/mcp.js` (нов)
- **Транспорт:** Streamable HTTP на `POST /mcp`. Един JSON отговор на заявка,
  **без SSE** и **без сесии** (`Mcp-Session-Id` не се издава) — изолатите на
  Worker-а нямат обща памет, а всички инструменти са чисти четения.
- **Методи:** `initialize` (с договаряне на версията), `ping`, `tools/list`,
  `tools/call`, нотификации → `202` без тяло. Партиди от 2025-03-26 клиенти се
  приемат. Недекларирани способности (`resources/*`, `prompts/*`) → `-32601`.
- **Версии:** `2025-06-18` (предпочитана), `2025-03-26`, `2024-11-05`.
  Непозната стойност в заглавката `MCP-Protocol-Version` → `400`.
- **`GET /mcp`:** с `Accept: text/event-stream` → `405` (по спецификация);
  без него (браузър/скенер) → кратък JSON указател към картата.
- **Инструменти (5, само за четене):** `search_procedures`, `get_procedure`,
  `list_countries`, `list_sources`, `platform_statistics`. Всички носят
  `readOnlyHint: true`; нито един не пише. LIKE търсенето екранира `% _ \`
  с `ESCAPE`. Всеки резултат носи готов `url` през `codeSlug()`.
- **Грешки:** проблем в данните → `result` с `isError` (моделът може да се
  коригира сам), не JSON-RPC грешка. Недостъпна база → ясно съобщение, не 500.
- **`initialize` инструкции:** четирите капана (null бюджет ≠ нула, null срок ≠
  „без срок“, статусът е към последната синхронизация, URL ≠ суров id).

#### Карта
- `serverInfo` (name/title/version), `url` **и** `transport.endpoint` (двата
  установили се начина), `capabilities.tools`, `remotes`, поддържани версии,
  списък инструменти, `_meta` с reverse-DNS ключ. Версията следва `APP_VERSION`.
- Нарочно **без `$schema`**: единствената публикувана схема още се мести и
  строг валидатор, който я тегли, би се счупил.

#### Вписване в останалия слой за агенти
- `AGENT_LINKS` (`rel="describedby"`), `/.well-known/api-catalog`, `llms.txt`,
  `/docs/api` (HTML + markdown), `DISCOVERY_RESOURCES`, `ROUTES`.
- `/.well-known/agent-index.json`: `agents` вече НЕ е празен — вписан е MCP
  сървърът. Старият текст „does not operate A2A or MCP agents“ е сменен с
  честен: един MCP сървър, никакъв A2A агент.

#### Админ одит
- Нова проверка `agents.mcp_server_card` (група „agents“). Не спира до „картата
  е валиден JSON“: прави истинско `initialize` + `tools/list` срещу обявения
  endpoint, сверява име и версия и че **всеки обявен в картата инструмент
  наистина съществува**. `card_tool_missing`, `foreign_endpoint`,
  `serverInfo_*_mismatch`, `initialize_*`, `tools_list_*` → failed.
- Нова карта „MCP сървър“ в таб „API & Agents“ — показва броя инструменти,
  които СЪРВЪРЪТ върна, не броя, обявен в картата.
- `probe()` приема `body`/`contentType`/`extraHeaders` (нужно за POST проверки).

#### Тестове
- `test/mcp.test.mjs` — **54 теста**. Двата инварианта: (1) картата не лъже —
  обявените инструменти се сверяват с `tools/list`; (2) сървърът не пише —
  всяка изпълнена SQL заявка започва със `SELECT`.
- `test/dns-aid.test.mjs` обновен: вече изисква вписан MCP агент и изрично
  твърдение, че A2A агент няма.

## 2.52.0 — 2026-08-04

**Дълбоко извличане и по-широко покритие на дневната синхронизация.**

### Покритие на държавите
- Weighted round-robin: времето на изпълнение се дели 45% нови/променени, 30% допълване, 15% ниско покритие, 10% откриване на източници (`src/ingestion/core/coverage.js`).
- Таван 15–25 пълни процедури на държава; изключение само при критично затварящи процедури или много голям backlog.
- Цел ≥ 4 различни държави на успешно изпълнение; динамична приоритизация без hardcoded кодове (`COUNTRY_PRIORITY_SQL`).

### Извличане
- 77 нови колони в `projects` (идентификация, описание, допустимост, дати, кандидатстване, бюджет) + 1:1 разширения `project_details` и `project_budget_terms` (D1 има таван 100 колони на таблица).
- Нормализирани таблици: `project_budget_components`, `project_eligibility`, `document_versions`, `project_change_history`, `project_anomalies`, `source_discovery_candidates`, `source_health_history`, `source_pagination_cursors`.
- 20 нови колони в `documents` (нормализиран URL, категория, checksum, версия, извличане/OCR статус), 16 в `funding_sources` (архив/RSS/API/sitemap/търсене + health метрики).

### Качество и аномалии
- `quality.js`: completeness score 0–100 с тежести 10/15/20/15/10/10/10/5/5 и статуси complete/good/partial/incomplete/pending_review. Без основен документ → не може „complete“.
- `anomalies.js`: конфликт страница/документ (печели по-новият документ, без сумиране), нулев бюджет, извън диапазон, бюджет на проект като общ, дублирани бюджети между държави, несъответствие на валута, невалидни min/max, несъгласувани дати.
- `changes.js`: append-only история с тип и важност на промяната.

### Отчети и UI
- `scheduled_sync_runs` + 31 нови колони; нов internal endpoint `POST /api/internal/sync-runs/report` (HMAC).
- Нов админ таб „Скенер“ (`/api/admin/sync/*`): изпълнения, cursor, backlog, аномалии, промени, източници, качество, кандидати — с филтри.
- `/about`: покритие с документи, основен официален документ, качество, източници по здраве, историческа дълбочина + tooltip обяснения.
- `SNAPSHOT_SQL`: „Известен публикуван бюджет“ изключва непроцедурни обхвати и процедури с открита критична аномалия.

### Миграции
- `0025_deep_extraction.sql` — приложена в продукция (само additive; заварените 11 дублирани документа са записани като аномалии, а не изтрити).


## [2.51.0] — 2026-07-29

### Добавено — Agent Skills Discovery (RFC v0.2.0)

Скенерът на isitagentready.com отчиташе `Agent Skills index not found`.
Публикуван е индекс на `/.well-known/agent-skills/index.json` по
[RFC v0.2.0](https://github.com/cloudflare/agent-skills-discovery-rfc) с три
истински skill-а на `/.well-known/agent-skills/<име>/SKILL.md`:

| Име | За какво е |
| --- | --- |
| `euro-funding-procedures` | Търсене и четене на процедури; полета, статуси, капани |
| `euro-funding-access` | Регистрация на креденшъл и четене на профил/запазени |
| `euro-funding-countries` | Държави, програми, региони, валути, официални източници |

Индексът съдържа САМО `$schema` и `skills` — строг валидатор може да се спъне в
непознати полета на най-горно ниво.

**Дайджестът се СМЯТА, не се пише.** Всеки запис носи
`digest: "sha256:<хекс>"` върху байтовете на артефакта. Ако се въвеждаше ръчно,
всяка редакция без преизчисляване щеше да го разсинхронизира — агентът тегли
skill-а, хешът не съвпада и с право отказва да го ползва. Дайджестът се смята от
същата функция, която сервира файла: разминаване е невъзможно по конструкция.

⚠️ От това следва второ правило: **съдържанието на SKILL.md е детерминистично**.
Без дата, без брояч от базата, без версия — иначе индексът и файлът могат да се
разминат между две заявки. Живите числа живеят в
`/.well-known/agent-index.json`, който няма дайджест. Тест го пази.

- Нов модул `worker/agent/skills.js`. Frontmatter-ът (`name`, `description`) и
  записът в индекса идват от един източник — не могат да се разминат.
- Админ проверка `agents.skills_index`: тегли ВСЕКИ skill и сверява дайджеста
  байт по байт, проверява frontmatter-а, имената по правилата на RFC-то
  (малки букви, цифри, тире; без водещо/крайно/двойно тире), типа
  (`skill-md`/`archive`) и че адресите са към собствения произход.
- Индексът се обявява в Link заглавките, `/.well-known/api-catalog`,
  `/llms.txt` и `robots.txt`.
- Тестове: `test/agent-skills.test.mjs` — 21 теста.

### Поправено — `app/lib/version.js` беше отрязан при вдигането на 2.50.1

Скрипт от вида
`open(p,'w').write(open(p).read().replace(...))` отваря файла за запис ПРЕДИ да
прочете — четенето връща вече празен файл. Файлът е възстановен изцяло.
Тестовете не го хванаха, защото нито един от тях не внася `version.js`;
`test/discovery.test.mjs` го откри чак при следващото пълно пускане.

## [2.50.1] — 2026-07-29

### Поправено — `agents.dns_aid` даваше фалшив `missing_alpn`

Записът беше въведен правилно в Cloudflare, но проверката го обяви за неуспешен.
Грешката е в проверката, не в DNS-а, и се хвана при първото пускане срещу
истинския домейн — не в тестовете.

**Причина.** DoH резолверите връщат SVCB в два различни вида и това не зависи от
клиента:

```
Google      1 euro-funds.eu. alpn=h2,h3 port=443
Cloudflare  \# 33 00 01 0a 65 75 72 6f 2d 66 75 6e 64 73 02 65 75 00
            00 01 00 06 02 68 32 02 68 33 00 03 00 02 01 bb
```

Проверката правеше `joined.includes("alpn")`. През Google минаваше, през
Cloudflare (който е първият в списъка) се проваляше — `alpn` е ключ `00 01`,
не низ. Същото важеше и за `/^\s*0\s/` при разпознаването на AliasMode.

**Поправка.** Нов `parseSvcbRecord()` в `worker/discovery/parsers.js` разбира и
двата вида и връща `{ priority, target, keys, params }`. Суровият вид се
декодира по RFC 9460 §2.2: 2 байта приоритет, некомпресирано DNS име, после
тройки ключ/дължина/стойност. Двата вида вече дават идентичен резултат.

- `safeDetails.records` носи разчетения запис (приоритет, цел, alpn, порт) —
  администрацията показва него. Суровият остава в `safeDetails.raw`.
- Тестовете покриват и двата вида, включително суров AliasMode и суров запис
  без `alpn`. `test/dns-aid.test.mjs` — 25 теста (от 21).

Състояние след поправката: `warning` с единствен проблем
`dnssec_unauthenticated` — записът е валиден, зоната още не е подписана.

## [2.50.0] — 2026-07-29

### Добавено — DNS-AID: откриване на платформата през DNS

Скенерът на isitagentready.com отчиташе `dnsAid: not found`. DNS-AID
([draft-mozleywilliams-dnsop-dnsaid-02](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/),
върху [RFC 9460](https://www.rfc-editor.org/rfc/rfc9460)) публикува SVCB запис на
`_index._agents.<домейн>`, който сочи към регистър на организацията. Черновата
нарочно оставя ФОРМАТА на регистъра извън обхвата си — тук е нашият.

**Нов документ `/.well-known/agent-index.json`** (`agentIndex()` в
`worker/agent/discovery.js`). Пътят е `agent-index.json`, а НЕ `agents.json`:
последният вече е зает от друга конвенция (wild-card-ai/agents-json), която
описва API действия и потоци — агент, който очаква онзи формат, щеше да прочете
нашия и да се обърка.

⚠️ Документът обявява **нула собствени агенти**. `agents: []` + `agents_note`,
който казва открито, че euro-funds.eu не пуска A2A или MCP сървър. Домейнът е
ресурс ЗА агенти, не доставчик на агенти. Изброените услуги са само за четене и
това се проверява от теста (`methods: ["GET"]` за всяка услуга).

Съдържа: организация, услуги (публично API, markdown представяне, лични данни),
всички машинни описания (`api-catalog`, `openapi.json`, `llms.txt`, `auth.md`,
OAuth метаданни, JWKS, health, sitemap, robots), обхватите за автентикация,
Content Signal и живи числа от D1 (процедури, държави, последна снимка).
Недостъпна база НЕ сваля документа — числата стават `null`.

**DNS записът** (въвежда се ръчно в Cloudflare, не е в кода):

```
_index._agents  SVCB  1 euro-funds.eu. alpn="h2,h3" port="443"
```

ServiceMode (приоритет ≠ 0) — AliasMode не носи параметри. TargetName е
`euro-funds.eu.`, без долни черти, защото се ползва публичният X.509 сертификат.

**Защо не `_a2a` / `_mcp`.** Не пускаме такива сървъри. Запис за протокол, който
не обслужваме, праща агенти към несъществуващ endpoint.

- Индексът се обявява в Link заглавките (`rel="describedby"`), в
  `/.well-known/api-catalog`, в `/llms.txt` и в коментарите на `robots.txt`.
- Администрация → „API & Agents": нови проверки `agents.agent_index` (наличност,
  задължителни полета, обяснен празен списък агенти) и `agents.dns_aid` (SVCB
  през DNS-over-HTTPS с резервен резолвер; AliasMode и липсващ `alpn` са провал,
  неподписана зона е предупреждение, локална среда е `not_applicable`).
- Тестове: `test/dns-aid.test.mjs` — 21 теста. `node test/dns-aid.test.mjs`.

### Остава ръчно (не може от кода)

1. SVCB записът в Cloudflare DNS (конекторът дава D1/KV/R2/Workers, не DNS).
2. **DNSSEC.** Зоната НЕ е подписана — няма DS при `.eu`, няма DNSKEY, `AD=false`.
   Cloudflare → DNS → Settings → Enable DNSSEC, после DS записът се въвежда при
   регистратора на домейна. Без това записът съществува, но не е доказано наш.

## [2.49.0] — 2026-07-29

### Добавено — auth.md: агент може сам да си поиска достъп

Досега единственият път към личните данни на потребител минаваше през
`/oauth/authorize` — тоест през човек пред браузъра. Скенерът на
isitagentready.com отчиташе `authMd: not found`. Добавена е конвенцията
[auth.md](https://workos.com/auth-md) (github.com/workos/auth.md).

**`/auth.md`** се генерира от Worker-а (`worker/agent/agent-auth.js`), не е файл
в `public/`. Причината е същата, както при markdown представянето: съдържанието
зависи от състоянието на базата — списъкът с доверени издатели и това дали
имейл доставчикът е конфигуриран се четат от D1 при всяка заявка. Документът е
на **английски** нарочно: това е протоколен манифест за агенти, не текст за
потребители (човешката документация остава на `/docs/api`, на български).
Заглавието H1 съдържа „auth.md", както изисква проверката.

⚠️ Не бъркайте с `AUTH.md` в корена на хранилището — той е инструкция за
настройка на Google SSO и няма нищо общо. Затова новият документ НЕ е файл.

**Блок `agent_auth`** в `/.well-known/oauth-authorization-server`: `skill`,
`register_uri`, `claim_uri`, `revocation_uri`, `token_uri`,
`identity_types_supported`, `assertion_types_supported`,
`credential_types_supported`, `events_supported` (CAEP). Блокът е САМО тук —
`/.well-known/openid-configuration` остава чист OIDC документ.
`/.well-known/oauth-protected-resource` получава указателя `agent_auth_skill`.

**Три потока на регистрация** (`POST /agent/auth`):

| `identity_type` | `assertion_type` | Резултат |
| --- | --- | --- |
| `identity_assertion` | `urn:ietf:params:oauth:token-type:id-jag` | свързан веднага, ако имейлът съвпада с потвърден акаунт |
| `identity_assertion` | `verified_email` | свързан след 6-цифрен код по имейл |
| `anonymous` | — | само публични данни, може да бъде свързан по-късно |

ID-JAG се проверява срещу JWKS на издателя (RS256/PS256/ES256, кеш 6 ч в
`agent_issuer_keys`), с `aud` = `https://euro-funds.eu/api`, максимална възраст
5 минути и **еднократен `jti`** (`agent_assertion_jti`). Издателят трябва да е
вписан в `agent_trusted_issuers` — таблицата се създава ПРАЗНА нарочно: без
изричен запис всяко твърдение се отхвърля с `invalid_assertion`, а `/auth.md`
казва това честно, вместо да обещава поток, който не работи.

**Церемония по потвърждаване:** `POST /agent/auth/claim` →6-цифрен код по имейл
(Resend HTTP API, нов секрет `RESEND_API_KEY`; по избор `AGENT_CLAIM_FROM`) →
`POST /agent/auth/claim/complete`. Кодът важи 15 минути, 5 опита. В базата се
пазят само хешове — нито claim токенът, нито кодът се записват в прав вид.
Липсващ доставчик на имейл НЕ се премълчава: отговорът връща
`delivered: false` и `delivery_error`.

**Граница на правата.** Нов обхват `procedures:read` (публични данни). Докато
регистрацията не е свързана с акаунт, това е ЕДИНСТВЕНИЯТ обхват — `requireUser`
в `worker/handlers.js` връща `403 insufficient_scope` за Bearer без потребител.
След успешен claim: `procedures:read openid profile:read saved:read`. Всичко си
остава само за четене; `/api/admin/*` не е достижим с креденшъл.

**Креденшълът** е JWT (`at+jwt`), подписан със същия ES256 ключ, но със
`sub = "agent:<registration_id>"`. `authenticateBearer` чете реда в
`agent_registrations` при ВСЯКА заявка → отменянето действа веднага, а обхватът
идва от базата, не от токена (подправен, но валидно подписан токен с по-широк
`scope` не получава нищо повече). Access токен: 1 час. Refresh: 30 дни за
свързан, 7 дни за непотвърден, с ротация; преизползване гаси регистрацията.

**`GET /agent/auth`** връща безопасно описание без странични ефекти — за да не
се налага скенер да прави `POST` (който създава запис и праща имейл).

- Миграция `0024_agent_auth.sql`: `agent_registrations`, `agent_refresh_tokens`,
  `agent_claims`, `agent_trusted_issuers`, `agent_issuer_keys`,
  `agent_assertion_jti`, `agent_auth_events`. Само добавяща.
- `/auth.md` се обявява в Link заглавките (`rel="describedby"`), в
  `/.well-known/api-catalog`, в `/llms.txt` и в коментарите на `robots.txt`.
- Администрация → „API & Agents": нови проверки `api.auth_md` (наличност, тип,
  H1) и `api.oauth.agent_auth` (пълнота на блока, указатели към собствения
  произход).
- Анонимните регистрации се ограничават до 20/час на източник. В дневника се
  пише псевдоним (SHA-256 с `AUTH_SECRET`), никога суров IP адрес.
- Тестове: `test/auth-md.test.mjs` — 34 теста (и трите потока, replay на `jti`,
  `alg=none`, подправен подпис, грешен `aud`, ротация, отменяне, границата на
  обхватите). `node test/auth-md.test.mjs`.

## [2.48.5] — 2026-07-26

### Поправено — резултатите „изчезваха" след презареждане
Тест в браузър: пускаш SEO одит, той минава, презареждаш — и всички карти
показват „Няма валидация", въпреки че картата „Последен SEO одит" носи дата.
Данните не са изтривани; интерфейсът гледаше грешния одит.

**Причина 1 — общ обхват за двата таба.** `overview` връщаше „последния
завършил одит" без значение чий е:

```
21:45:01  ["api","agents"]   ← най-нов
21:41:54  ["seo","sitemap",…]
```

Отвориш ли „SEO & Discovery" след одит в „API & Agents", табът получаваше
проверките на API одита. В тях няма нито един `seo.*` код → всяка карта пада на
„Няма валидация", а датата на одита се вижда. Точно това изглежда като
„загубени данни след презареждане" — преди презареждането табът държеше своя
резултат само в паметта на браузъра.

- `useDiscovery(scope)` приемаше обхват, но никога не го изпращаше. Сега клиентът
  пита `/api/admin/discovery/overview?scope=api|seo`.
- `SCOPE_GROUPS` на сървъра дели групите между двата таба; `runInScope` решава
  дали един одит принадлежи на таба. Обхватът важи и за историята, и за активния
  одит, и за сигналите.
- Прегледът вече връща **последния резултат за всяка проверка**, а не проверките
  на един run. Затова частична валидация („само sitemap") вече не смъква
  останалите карти на „Няма валидация", а всяка карта носи собствената си дата.

**Причина 2 — шаблоните с двоеточие не съвпадаха.** `indexChecks` държи
проверките под ключ „частта преди двоеточието" (`seo.metadata`), но `rollup`
търсеше с `"seo.metadata:*".slice(0, -1)` → `"seo.metadata:"`. Никога не
съвпадаше, така че „Индексируеми публични страници", „Страници с пълни
метаданни", „Страници със структурирани данни" и „Публично API" стояха на
„Няма валидация" дори при напълно успешен одит. Шаблонът вече губи и звездата,
и двоеточието.

`indexChecks` е изнесена в `app/admin/discovery-index.js` (чист JS), за да се
тества директно с node.

### Поправено — 11 проверки се проваляха с 404 по вина на самия одит
Останалите провали след поправката на 522 бяха всичките върху три процедури:

```
seo.metadata:/procedures/HU:hu-palyazat:ssns-ncc-hu-2026-fstp   404
agents.procedure_fields:/procedures/LT:lt-esinvesticijos:step-defence   404
seo.structured_data:/procedures/SI:si-podjetniskisklad:jp-start-up-mentorji   404
```

`sampleProcedurePaths` строеше адреса от суровия `id`, който съдържа двоеточия.
Рутерът обаче разпознава само каноничния `codeSlug`. Проверено на живо:

```
/procedures/HU:hu-palyazat:ssns-ncc-hu-2026-fstp     → 404
/procedures/hu-hu-palyazat-ssns-ncc-hu-2026-fstp     → 200 (и html, и markdown)
```

Същата грешка беше и в `/api/admin/discovery/procedures`: колоната „Каноничен"
и бутонът „Отвори" в таблицата водеха към 404 за всяка процедура с двоеточие в
идентификатора. И двете места вече минават през `codeSlug`.

84/84 теста минават — 13 нови покриват трите случая по-горе.

## [2.48.4] — 2026-07-26

### Поправено — HTTP 522 при всички self-fetch проверки в производството
Тест през браузър на живата администрация показа, че последното изпълнение на
одита завършва с `passed: 2, warning: 3, failed: 28` от 37. Всички провалени
проверки връщаха един и същ отговор:

```json
{"code":"seo.sitemap","http":522,"key":"sitemap.unreachable"}
{"code":"seo.robots","http":522,"key":"robots.unreachable"}
{"code":"seo.metadata:/","http":522,"key":"metadata.unreachable"}
```

**Причина.** Cloudflare Worker не може да `fetch`-ва собствения си hostname —
подзаявката излиза до edge-а, връща се в същия Worker и се засича като цикъл
(522). Локалните ми изпълнения даваха 73/73, защото fetch-ваха отвън.

**Решение.**
- `worker.js`: конвейерът за една заявка е изнесен в `pipeline(request, env)`
  (HEAD нормализация → рутер → `withAgentHeaders`). При всяка заявка се
  подава `env.SELF_FETCH = (input, init) => pipeline(new Request(input, init), env)`.
- `worker/discovery/handlers.js`: `makeFetchImpl(env, origin)` пренасочва към
  `env.SELF_FETCH` само адресите на собствения origin; всичко останало минава
  през обикновения `fetch`. Пътища под `/api/admin/discovery` се блокират
  (`403 recursion_blocked`), за да не рекурсира одитът в себе си.
- `driveRun` и `testEndpoint` ползват този fetch.

Резултатът от проверката вече отразява реалното състояние на страницата, а не
мрежово ограничение на платформата.

### Поправено — колони, свити до една буква на ред
Инспекция в браузър на таблицата с процедури („SEO & Discovery") показа
заглавие „ДЪР/ЖА/ВА" и бутон „Отвори", разтегнат на **102px** (буква на ред)
вместо 44px.

Причина: `.admin-table td, th { overflow-wrap: anywhere }`. За разлика от
`break-word`, `anywhere` смъква и **min-content** ширината на клетката до един
знак, така че при 10 колони браузърът свива колоната докрай.

- `overflow-wrap: break-word` за клетките — пренасянето остава, но min-content
  пази най-дългата дума, така че колона не може да колабира. Излишната ширина
  отива в скрола на `.table-scroll` (контейнерен, не на страницата — 1407/1407).
- `anywhere` остава само за `.disc-code` (машинни адреси с ограничена max-width).
- Колоната „Каноничен" отпадна — тя съдържаше `/procedures/<идентификатор>`,
  т.е. същото като съседната колона. Сега идентификаторът сам е връзка към
  каноничния адрес. 10 → 9 колони.
- Домейнът в „Официален източник" е на един ред с многоточие (`.disc-host`).
- `.btn-xs` се ползваше, но никъде не беше дефиниран. Вече е истински компактен
  размер (32px), който при сензорен екран става 44px.

Измерено на живата страница след поправката: редове 65–102px вместо 130px+,
заглавия на един ред, бутон „Отвори" 44×65px.

## [2.48.3] — 2026-07-26

### Поправено — визуална консистентност на новите админ раздели
Инспекция на живата страница в браузър (не само на кода) откри:
- **Бутоните нямаха оформление.** Ползвах `className="btn-primary"` / `"btn-ghost"`, но в
  системата размерът идва от базовия клас `.btn` (min-height 44px, `--r`, `--line-strong`),
  а модификаторът носи само цвета. Резултат: 23 бутона се рендираха като 21px системни
  бутони, а `<a class="btn-ghost">` — като подчертана връзка. Поправени във всички компоненти.
- **Собствена палитра вместо токените.** `.disc-*` съдържаше твърдо зададени `#dcfce7`,
  `#e2e8f0`, `#0f2942`… CSS-ът е пренаписан и ползва само `:root` променливите
  (`--green-bg`, `--line`, `--ink`, `--r`, `--sh-1`, `--s1…--s7`) — 119 употреби.
- **Разкъсан ред от обобщаващи карти:** `minmax(210px,1fr)` даваше 5 колони и 8 карти се
  подреждаха 5+3. Сега 4 колони (3 на ≤1100px, 2 на ≤820px) → 4+4.
- **Девет големи празни блока** при непусната валидация. Заменени с един призив за
  действие + компактни празни състояния (от ~120px на 50px).
- **Счупена граматика от конкатенация:** `${n} ${tl("маршрута")}` → „15 the route".
  Числото е самостоятелна стойност, мерната единица е в `hint`.
- `a.btn` вече не носи подчертаване на връзка.

### Проверено в браузър
На живата страница: карти 4+4, бутони 44px с радиус `--r` и `--primary` фон, връзки-бутони
без подчертаване, празни състояния 50px, без хоризонтално преливане (1407/1407).

## [2.48.2] — 2026-07-26

### Поправено
- **i18n:** три надписа в новите админ раздели („Няма" ×2, „версия") не бяха в batch
  масива и оставаха на български при чужд UI език.
- **`seo.procedures.language`** строеше адреса от суровия `id` вместо от `codeSlug` —
  при id-та с „:" (напр. `HU:hu-nkfih:mec_26`) не намираше нито една страница и
  отчиташе всички като несъответстващи. Проверено срещу продукцията: 6/6 унгарски
  страници връщат `lang="hu"`.

### Добавено
- **`test/i18n-admin-audit.mjs`** — постоянен i18n одит: сверява 263 преводими низа
  срещу 780 регистрирани и проверява, че протоколни имена/методи/медийни типове НЕ
  попадат в масива за превод. `node test/i18n-admin-audit.mjs`.

## [2.48.1] — 2026-07-26

### Поправено — открито от одита срещу ЖИВАТА продукция
- **Фалшиво положително за API ключ:** словашки идентификатори като
  `sk-sk-minzp-psk-mzp-001-2023-dv-efrr` съвпадаха с шаблона за OpenAI ключ (`sk-…`) и
  markdown-ът на началната страница се отчиташе като „изтичане на данни". Шаблонът вече
  изисква дълга непрекъсната алфанумерична поредица, каквато слъговете нямат.
- **Покритието на sitemap** сравняваше суровия `id` с адресите; sitemap-ът публикува
  каноничния `codeSlug`, затова процедури с „:" или кирилица изглеждаха липсващи.
- **XSL изгледът** се отчиташе като липсващ, защото се сервира като `application/xml` —
  проверката вече гледа съдържанието (`<xsl:stylesheet`), не само типа.
- **og:image без `content-length`** се показваше като „0 байта" вместо „неизвестен".
- **Markdown отговорите вече носят Link заглавките за откриване** — агент, поискал
  markdown, откриваше API-то само ако поиска и HTML вариант.
- **`/docs/api`**: markdown вариантът ползва истински връзки (беше с голи адреси) и е
  добавен `twitter:card` в HTML.
- **HEAD връщаше 404 за машинно четимите маршрути.** `/.well-known/api-catalog`,
  `/openapi.json`, `/llms.txt`, `/robots.txt`, `/docs/api` и `/api/health` бяха зад
  `method === "GET"` и HEAD падаше към статиката. Сега HEAD минава през същия път
  като GET и се връща без тяло (RFC 9110 §9.3.2) — RFC 9727 изисква HEAD да работи.
- **Езикът на страницата на процедурата** беше винаги `lang="bg"`, дори когато
  съдържанието е на езика на официалния източник (унгарски, немски, гръцки…). Това
  подвежда търсачките, екранните четци и автоматичния превод. Сега `<html lang>`,
  `hreflang`, `og:locale` и JSON-LD `inLanguage` се вземат от
  `projects.original_language` (840 от 880 процедури го имат); при липса остава `bg`.
- **Заглавието на `/about`** беше ~78 знака и се отрязваше в резултатите от търсене —
  скъсено до „Относно платформата" (със суфикса остава под ~60 знака).

### Тестове
- Нови регресионни тестове за езика на процедурната страница и за HEAD семантиката.
  Общо **119** (68 discovery + 51 agent-readiness).

## [2.48.0] — 2026-07-26

### Добавено — администрация: „API & Agents" и „SEO & Discovery"
- **Два нови таба** в `/admin` (`app/admin/ApiAgentsTab.jsx`, `app/admin/SeoDiscoveryTab.jsx`)
  + споделен UI слой `discovery-ui.jsx` и преводими резюмета `discovery-summaries.js`.
  Визуалният език е непроменен: `.prof-card`, `.sys-grid`, `.admin-table`, компактни бейджове.
- **`SiteDiscoveryValidationService`** (`worker/discovery/`): `inventory.js` (единен източник
  за класификацията на маршрутите), `parsers.js` (Link/robots/sitemap/HTML/JSON-LD + редакция),
  `validation.js` (план + изпълнение на проверките), `handlers.js` (админ API, сигнали).
  Групи: api, agents, seo, sitemap, robots, metadata, structured_data, social, i18n_seo, procedures.
- **Одитът се изпълнява на парчета сървърно** — планът се записва в D1 като чакащи проверки,
  всяко „drive" изпълнява до 18 s. Презареждане на страницата не прекъсва одита.
- **Миграция `0023_discovery_audit.sql`**: `agent_readiness_runs`, `agent_readiness_check_results`,
  `discovery_signals` (UNIQUE по `signal_key` → дедупликация).
- Ново админ API: `GET/POST /api/admin/discovery/runs`, `POST …/runs/:id/{drive,stop}`,
  `GET …/runs/:id`, `GET …/overview`, `GET …/procedures`, `GET …/signals`,
  `POST …/endpoint-test`. Всичко е `no-store` и само за администратор.

### Сигурност
- Всяко `safeDetails` минава през `redactObject` ПРЕДИ запис в D1 и преди отговор към браузъра;
  заглавките `authorization`/`cookie`/`x-api-key` никога не се връщат.
- Тестът за JWKS проверява, че частният компонент `d` не изтича; тестове потвърждават, че
  тайни не попадат нито в резултата, нито в сигналите.
- Вътрешните маршрути се probe-ват само за да се докаже, че искат вход — и никога от таблицата.

### Поправено (открито от новия одит срещу продукцията)
- **`/calendar` не връщаше markdown** на `Accept: text/markdown` — добавен маршрут с крайните
  срокове по месец от D1.
- **Разбор на Link заглавки**: стойност в кавички със `;` (реалната
  `type="application/openapi+json;version=3.1"`) се отрязваше — параметрите вече се четат коректно.
- **„Най-нов lastmod"** се смяташе и от невалидни дати; вече се броят само ISO дати.
- Редакцията на JWT хващаше само дълги токени.

### Тестове
- `test/discovery.test.mjs` — **66 теста**: класификация на маршрути, сравнение с OpenAPI,
  Link/robots/sitemap/JSON-LD парсери, разпознаване на празна SPA обвивка, редакция на тайни,
  дедупликация на сигнали, план на одита и интеграционни проверки срещу мокнат сайт.
- Общо с `agent-readiness` — 116 теста. Playwright сценарии: `test/e2e/admin-discovery.spec.mjs`
  (desktop + мобилно, изтичане на тайни, защита на админ API-тата).

## [2.47.0] — 2026-07-26

### Добавено — готовност за AI агенти
- **Markdown content negotiation**: `Accept: text/markdown` на всяка публична страница
  връща markdown (`text/markdown; charset=utf-8`, `Vary: Accept`, `x-markdown-tokens`).
  Генерира се от D1 в `worker/agent/markdown.js` — НЕ се конвертира от HTML, защото
  сайтът е статичен SPA shell и конвертор би върнал празен документ. Покрити: `/`,
  `/procedures`, `/procedures/:slug`, program/candidate/deadline/status landing-и,
  `/sources`, `/about`, `/changelog`, `/docs/api` (+ `/bg|/en|/de` префикси).
- **`/llms.txt`** — карта на съдържанието по llmstxt.org.
- **Link заглавки (RFC 8288)** на HTML страниците: `api-catalog`, `service-desc`,
  `service-doc`, `status`, `describedby`, `sitemap` + `alternate` към markdown версията.
  Добавят се централно в `withAgentHeaders()` (`worker/agent/discovery.js`).
- **API каталог (RFC 9727)**: `/.well-known/api-catalog` (`application/linkset+json`),
  `/openapi.json` (OpenAPI 3.1), `/docs/api` (човешка документация, също с markdown
  вариант) и `/api/health` (статус на база, версия, обхват).
- **OAuth 2.1 authorization server (само за четене)** — `worker/agent/oauth-server.js`:
  `/oauth/authorize` (страница за съгласие, PKCE S256 задължително), `/oauth/token`
  (authorization_code + refresh с ротация и откриване на преизползване), `/oauth/revoke`,
  `/oauth/userinfo`, `/.well-known/jwks.json`, `/.well-known/openid-configuration`,
  `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`.
  Обхвати: `openid`, `profile:read`, `saved:read`. Подпис ES256; частният ключ се пази
  криптиран (AES-256-GCM) в D1. Миграция `0022_oauth_server.sql`.
- **Content Signals** в robots.txt: `search=yes, ai-input=yes, ai-train=yes`
  (contentsignals.org). robots.txt вече се сервира динамично от Worker-а.

### Сигурност
- Bearer токените НИКОГА не дават писане и никога не стигат до `/api/admin/*` — при
  не-GET заявка или админ път се връща `403 insufficient_scope`. Сесията в браузъра
  остава единственият път за писане; Google OAuth потокът не е променян.
- Authorization кодовете са еднократни; повторна употреба гаси всички refresh токени
  за двойката (потребител, клиент). Съгласието е защитено с HMAC токен, обвързан със
  сесията И с точните параметри на заявката (CSRF).
- Непознат `client_id` или несъвпадащ `redirect_uri` НЕ водят до пренасочване.

### Поправено
- `WWW-Authenticate` заглавката се чисти до ASCII — кирилско `error_description` би
  хвърлило `TypeError` и би превърнало 401 в 500 (открито от новите тестове).
- Кешът на подписващия ключ е `WeakMap` по `env`, а не глобален — за да не се смесват
  ключове между binding-и.

### Тестове
- `test/agent-readiness.test.mjs` — 50 теста: negotiation (вкл. че браузърски `Accept`
  НЕ дава markdown), Link заглавки, каталог/OpenAPI, Content Signals, пълен OAuth поток
  срещу мок на D1, `alg=none`/`HS256` отказ, audience, ротация на refresh токени.

## [2.46.2] — 2026-07-19

### Поправено (след пълен E2E тест на живо, prod = 2.46.1)
- **Дублиран title суфикс** „… | Euro-Funding | Euro-Funding“: под-layout `title` вече
  съдържаше суфикса, а root `title.template` го добавя пак → махнат от plain title в
  8 layout-а (calendar/changelog/cookies/how-ai-works/privacy/procedures/sources/terms);
  og:title остава пълен. (/about беше коректен.)
- **Скрол до „Документи“ изоставаше** (scrollTop 210 при цел ~645): async преводът +
  авторазгънатият документ растат НАД секцията след първия скрол → добавена корекция
  (повторен scrollIntoView след 700ms) в ProjectDrawer.
- E2E резултати (Chrome, живо): Обзор/Процедури/за /about/sources/changelog ✓; drawer
  без табове ✓, 6 секции EN ✓, авторазгънат единичен документ ✓, без quick nav ✓;
  bg⇄en превключване ✓; мобилен /about (390px iframe) 0px преливане ✓; 0 конзолни
  грешки; version.json 2.46.1 (билд 20260724).

## [2.46.1] — 2026-07-19

### Променено
- **Премахната quick navigation** („Към секция“): select-ът, `goTo()` handler-ът,
  етикетът и `.drawer-quicknav` стиловете. Header-ът е компактен (статус, заглавие,
  програма, close) и съдържанието започва веднага след него. Section id-тата
  (`#procedure-*`) и backward compat за `?tab=`/`#hash` са запазени.
- **Документи по брой** (`ProjectDrawer` + `DocumentBody`):
  - `0` → „Няма публикувани документи към тази процедура.“ (броячът не се показва);
  - `1` → **винаги разгънат**, без accordion бутон; H4 заглавие + тип + AI резюме +
    „Отвори документа“ / „Оригинален файл“;
  - `>1` → списък, първият разгънат, `aria-expanded` + `aria-controls`, „Покажи още“.
- `sortDocuments()` в `procedure-sections.js`: основни условия/обявление → най-нова
  дата → приложения (стабилна, не мутира входа).
- Документите вече **не се дублират** в „Официални източници“ (само уникални източници,
  различни от официалната страница). При липсващ анализ действията остават активни.
- CSS: `.doc-single/.doc-single-head/.doc-single-title/.doc-actions/.doc-origin`.
- Тестове: `test/procedure-sections.test.mjs` → 14 (0/1/2+ документа, липса на quick nav,
  подредба, error state, дедупликация, anchor id-та).

## [2.46.0] — 2026-07-19

### Променено
- **ProjectDrawer без табове → единичен вертикален скрол**: премахнати `drawer-tabs`
  + tab state; всички секции (Обзор/Кандидати/Финансиране/Срокове/Документи/Източници)
  се рендират последователно в `.drawer-scroll`. Layout: `.drawer` е grid
  `auto minmax(0,1fr) auto` (sticky head + scroll + sticky actions), `overflow-x:hidden`.
- Нов `app/lib/procedure-sections.js` (`PROCEDURE_SECTIONS` + `sectionIdForTab`) — единен
  ред + anchor id-та (`#procedure-overview`…`#procedure-sources`); backward compat за
  initialTab/„Документи“ бутон (scroll до секцията при отваряне).
- Компактна навигация „Към секция“ (select, не табове) със smooth scroll
  (`prefers-reduced-motion`). Секции = `<section aria-labelledby>` + H3.
- Per-section empty states вместо „—“; документи: първите 5 + „Покажи още“.
- `.drawer-actions` responsive: `flex:1`, `nowrap`, 44px, телефон 2×2 grid.
- Нови CSS класове: `.drawer-scroll/.drawer-section/.drawer-section-head/.drawer-quicknav/
  .drawer-prose/.drawer-empty/.drawer-disclaimer`. Тест `test/procedure-sections.test.mjs`
  (5, ред/id/mapping). ProjectDrawer данни+документи си остават преведени (v2.45.1).

## [2.45.1] — 2026-07-19

### Поправено
- **Детайл на процедурата + документи не се превеждаха**: `ProjectDrawer` рендираше
  суровите данни (име/програма/бюджет/кандидати/срок/бележки) + документите (заглавие/
  тип/съдържание) на оригиналния език (латвийски и български резюмета). Сега втори batch
  `useUiTranslate(dataStrings)` (`td`) превежда всички тези полета във ВСИЧКИ табове при
  en/de; при bg → оригинал. Ползва кеширания pipeline с chunking.
- Картите остават с превод през `TranslatedProjectsProvider` (name/budget/eligible/deadline).

## [2.45.0] — 2026-07-19

### Добавено
- **XSL изглед за sitemap** (`/sitemap.xsl`, `sitemapStylesheet()` в worker/sitemap.js
  + route в worker.js): брандиран Euro-Funding изглед — брой URL-и, колони Тип/URL/
  Last modified/Change freq./Priority, визуално разграничени начало/процедури/листинги/
  инфо/правни; responsive, без JS/външни либи. XSLT 1.0 с `xmlns:sm` prefix.
- `sitemap.xml` вече започва с `<?xml …?>` + `<?xml-stylesheet type="text/xsl"
  href="/sitemap.xsl"?>`; headers: `Content-Type: application/xml; charset=utf-8`,
  `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=0, s-maxage=3600,
  stale-while-revalidate=300`.
- `test/sitemap.test.mjs` (+`npm run test:sitemap`), 15 проверки: декларация на поз. 0
  (без BOM), stylesheet PI, namespace, headers, абсолютни https, без дубликати, без
  admin/profile/login/saved/api, W3C lastmod, escaping, first_seen fallback, D1 error
  fallback, XSL валидност. Динамичното D1 генериране е непроменено.

## [2.44.3] — 2026-07-19

### Подобрено
- **Sitemap freshness**: `worker/sitemap.js` вече чете процедурите ПЪРВО и подава
  `lastmod` = най-скорошната `last_updated` на листинг-страниците (/, /procedures,
  /calendar) и landing-ите (status/deadlines/candidates/programs). Всяка процедура пази
  собствения си `lastmod`. `urlEntryLang` приема lastmod.
- Валидация на живо (SEO): sitemap.xml е динамичен от D1 (1051 URL-а, 715 процедури с
  lastmod, новите RO/HU вътре); robots.txt → sitemap; процедурните страници са SSR
  (200, уникален title/description, self-canonical, og:article, JSON-LD, index,follow).

## [2.44.2] — 2026-07-19

### Подобрено
- **Широчина на вътрешните страници = /about**: `.legal` (900px → var(--maxw)),
  `.prose-page` (820px → var(--maxw); покрива /sources и /how-ai-works) и `.changelog`
  (820px → var(--maxw)). Вече ползват пълните 1200px на `.container`, като „Относно
  системата". `.profile` (900px, форма) остава по-тясна за четимост.

## [2.44.1] — 2026-07-19

### Поправено
- **Хоризонтално преливане на мобилно** (/about и др.): `<main>` е flex item на
  `body { display:flex }`; без явна ширина flex-ът го оразмеряваше по min/max-content
  → 472px при 371px viewport (преливане 101px), съдържанието се измества настрани.
  Диагностирано в Chrome чрез 390px iframe (реален mobile viewport, тъй като
  resize_window не сви ultrawide дисплея). Fix: `#main { width:100%; min-width:0 }`
  (клампва към контейнера; `.container max-width` + `box-sizing:border-box` пазят
  desktop центрирането).

## [2.44.0] — 2026-07-19

### Променено
- **Ребрандинг „Европроекти“ → „Euro-Funding“** навсякъде (83 замени в 26 файла):
  layout metadata (title/template/OG/Twitter/JSON-LD/applicationName), всички
  `*/layout.jsx`, changelog/login/how-ai-works/about страници, `company.js`
  (serviceName), `project-utils.js` (ICS PRODID), `globals.css`, `site.webmanifest`,
  `favicon.svg`, worker `i18n-pages.js` (BRAND_BG + ROOT_EN + OG alt) и
  `procedure-page.js` (13× — brand/footer/og:site_name/титли).
- Английската марка „Euro Funds“ също → „Euro-Funding“ (унифицирана).
- `glossary.js` DO_NOT_TRANSLATE: „Европроекти“ → „Euro-Funding“ (остава непреведена).
- D1 `changelog_entries`: историческите редове с марката са обновени.
- НЕ са пипани: домейн `euro-funds.eu`, фирма S2K Design, localStorage ключове
  (`evroproekti_*`), SEO ключова дума „европроекти“.

## [2.43.1] — 2026-07-19

### Поправено
- **Batch преводът се режеше на 128** низа (`worker/handlers.js`
  `body.items.slice(0,128)`), а `ADMIN_LABELS` беше 192+ → всичко след 128-ия оставаше
  на български (AI модели таб, pipeline, задачи). `translate-client.js` вече **разбива
  на партиди по 100** (`Promise.all`) — покрива всеки дълъг списък (админ, профил).
- **ADMIN_LABELS**: добавени ~165 липсващи етикета (AGENT_DESC, pipeline/jobs действия
  и статуси, „Разход 30 дни/1 година", диалози). Скан потвърждава 0 `tl()` литерала
  извън списъка.
- Обвити последните hardcoded низове в `AiModelsTab.jsx` (интро на таблицата,
  предупреждение за `AI_CREDENTIALS_MASTER_KEY`, aria-етикети на филтрите в „AI логове").

## [2.43.0] — 2026-07-19

### Добавено
- **Google Analytics 4 (G-EDMN8Q86T6)** с **Google Consent Mode v2**: `gtag.js` в
  `<head>` (layout.jsx), `analytics_storage='denied'` по подразбиране + `anonymize_ip`.
  Инлайн скриптът чете запомнено съгласие (`evroproekti_cookie_consent_v1.analytics`)
  и разрешава преди `config`, за да не се губи първият page_view.
- **Consent update**: `AppChrome.saveConsent` вика `gtag('consent','update',...)` при
  избор в банера (grant/deny) — замени стария placeholder.
- **Cookie политика**: добавени `_ga`/`_ga_EDMN8Q86T6` редове + обновена секция 4
  (GA4 + Consent Mode); `legalDocumentVersion` 1.0 → 1.1, `legalLastUpdated` 19.07.2026.
- Работи на всички локали (/bg,/en,/de) — `worker/i18n-pages.js` прави само точкови
  замени и не маха head скриптовете (проверено).

## [2.42.2] — 2026-07-19

### Поправено
- **Грешни/бъдещи дати в „AI логове"**: (1) дневната Claude scheduled task пишеше
  `started_at`/`completed_at` от собствения run-id вместо от D1 часовника — промптът
  вече задължава всички времена от `datetime('now')`/`date('now')`/`strftime` (UTC);
  (2) `fmtTs` в `AiModelsTab.jsx` четеше SQLite `YYYY-MM-DD HH:MM:SS` (UTC без зона)
  като местно време — сега naive стойностите се третират като UTC.
- **D1 cleanup**: 30 `daily_review` реда с бъдещ `started_at` нормализирани към
  реалното време на вписване (`julianday` сравнение + `datetime()` канонизация; без
  триене на логове).

## [2.42.1] — 2026-07-19

### Поправено
- **Разход/заявки по агент, не по модел**: usage заявката в `worker/ai/handlers.js`
  групираше само по `model_id`, затова два агента на един модел (procedure_analysis
  и future_chat → `gpt-5.6-terra`) показваха идентични заявки/токени/разход. Сега
  `GROUP BY purpose, model_id` + join по `purpose + model_id` в `AiModelsTab.jsx`.
- future_chat няма собствени `ai_execution_runs` → показва „—“ (потвърдено в D1: само
  procedure_analysis 513, recommendation 421, budget_analysis 152, daily_review 51).

## [2.42.0] — 2026-07-19

### Подобрено
- **Пълен i18n одит на кода**: сканиране за оставени hardcoded български низове в
  публичния UI (JSX деца + видими атрибути, без коментари). Открити ~12 файла без
  превод.
- **Интерактивни компоненти** през `useUiTranslate`/`tl()` (без нови bg.json ключове,
  без catalog regen): `ProjectDrawer` (табове, dt/dd, документи, действия, aria),
  `CompareDrawer` (редове + клетки), `FeedbackModal`, `ViewControls` (търсене/сорт/
  изглед/чипове/aria/title), `Chart` (donut „общо“), `ProjectListRow`,
  `UpcomingDeadlines` (пропуснати title/aria).
- **Статични страници**: `changelog` (заглавия, филтри, състояния, „Виж“), `login`
  (грешки + текстове), напълно преведени.
- **Правни + инфо страници** (`terms`/`privacy`/`cookies`/`how-ai-works`): нов
  `AutoTranslateRegion` + runtime обхождане на текстовите възли в `LegalPage` —
  превежда цялата проза при en/de през кеширания `translateItems` pipeline и
  възстановява българския оригинал при bg. Покрива готовите JSX възли без
  преструктуриране на съдържанието.
- SEO `sr-only` H1 заглавията (`/`, `/calendar`, `/procedures`, `/saved`) остават
  на български умишлено (индексиране за България). `ProfileModal.jsx` е мъртъв код
  (без импортьори) — пропуснат.
- Валидация: 14/14 test файла минават; всички засегнати компоненти минават esbuild
  bundle. Живата проверка на `/changelog?lang=en` в production потвърди проблема
  (страницата беше изцяло на български) — фиксът предстои след deploy.

## [2.41.0] — 2026-07-19

### Поправено
- **Честно бюджетно покритие** (migration 0021): `country_daily_statistics` +
  `budget_text_procedures`/`foreign_currency_procedures`; `budgetBreakdown` +
  `countryBudgetStatus` в statistics.js. Публичният summary връща `budget` обект
  (knownPublishedBudgetEur, validatedBudgetProcedures, budgetCoveragePercent) + per
  country budgetStatus/budgetCoveragePercent.
- **/about**: „Total published budget“ → „Известен публикуван бюджет“ + „Изчислен
  върху 170 от 651“ + coverage лента (26,1%, aria-progressbar). Таблицата показва
  честен статус вместо „—“ + точна сума в tooltip (LT/SI различни точни суми под
  еднакъв компактен €172,7M). Count/active бележки + голям disclaimer.
- **Real-data audit**: 651 процедури, 170 валидирани, €6.95B; LT/SI = съвпадение (не
  дубликат); AT 0% защото няма бюджетен текст в източниците; кръглите €30M/€60M са
  различни процедури (не double-count — всяка процедура е в 1 държава).
- Тестове: `test/budget-coverage.test.mjs` (10). Общо 144 unit теста.

## [2.40.0] — 2026-07-19

### Ново
- **Всички AI агенти на /about** (`#how-we-use-ai`, `#how-ai-works`): `PublicAIAgentCard`
  grid за 6-те агента + `ModelOverview` (collapsible). Данните от разширения
  `/api/ai/public-configuration` (нов `agents[]` масив: purpose/provider/modelId/
  status/lastRun/metrics от D1 + ai_execution_runs + ai_jobs; ETag + swr кеш).
- Safe статус mapping (`publicAgentStatus`): active/upcoming/temporarily_unavailable/
  needs_configuration/last_run_failed — без вътрешни статуси/ключове/грешки.
  future_chat = „Предстоящо“ докато feature flag-ът е изключен.
- i18n: about.agents.* (имена/описания/отговорности), статуси, метрики, бележки.
  Model names/provider не се превеждат. Тестове: `test/public-agents.test.mjs` (8).
- Премахнати старите 2 дублиращи model cards; заменени с обобщение.

## [2.39.0] — 2026-07-19

### Подобрено
- **Превод на „Изход“**: ръчни override-и (catalog.js + ui-translate.js UI_OVERRIDES)
  → en „Sign off“, de „Abmelden“ (машинният превод даваше „Exodus“).
- **„Изтрий акаунта“**: плътно червен (`.prof-delete`) и подравнен вдясно.
- **Footer стат-карти кликаеми** (`FooterStat` → `<a href>`): държави/бюджет →
  /about#about-system, източници → /sources, процедури → /about#how-we-use-ai.

## [2.38.0] — 2026-07-19

### Ново
- **Многоезични социални (OG/Twitter) тагове** (worker/i18n-pages.js): `applyHead`
  локализира пълния набор (og:title/description/site_name/image:alt/locale, twitter:*)
  сървърно. Маршрути: `/` и `/en` → английски OG, `/bg` → български, `/de` → немски
  (`handleRootSocial` за бара /, `handleLocalePage` за префиксите; locale regex вкл. bg).
  Поправен пропуск: досега само `<title>`/description се превеждаха на /en,/de, а
  og:title/og:description оставаха на bg. Тестове: `test/i18n-social.test.mjs` (4).

## [2.37.0] — 2026-07-19

### Ново
- **Разход на моделите** (admin → Активни AI модели): нови колони „Разход 30 дни“ /
  „Разход 1 година“ (USD) — usage query разширен с in_30d/out_30d/in_365d/out_365d
  прозорци; `estimateCost`/`costLabel` в ai-pricing.js (токени × официална цена/1M).
  На живо от ai_execution_runs. Тестове: `test/ai-cost.test.mjs` (6).
- **Описания на агентите** под името в таблицата (AGENT_DESC).
- Диагноза: `document_analysis` не е повреден — 0 задачи, защото 31-те процедури с
  документи (всички BG) още нямат завършен procedure_analysis; doc jobs се създават
  чак след родителя (dependency graph). Ще се появят автоматично.

## [2.36.0] — 2026-07-19

### Ново
- **Настройка на часа за nightly старт**: dropdown в admin (PipelinePanel) →
  `PATCH /api/admin/ai/schedules/nightly-time` обновява preferred_time/timezone на
  всички изпълними purposes. `scheduled()` вече чете preferred_time+timezone
  (Europe/Sofia) и стартира в прозорец [want, want+2min) вместо hardcoded UTC hour.

## [2.35.1] — 2026-07-19

### Поправено
- **Pipeline не се самозадвижваше** — обработката зависеше само от cron `*/15` по 5
  задачи (без continuation), затова 395 чакащи изглеждаха „заседнали“ с В ход:0.
  Добавен `driveJobs` (time-budgeted цикъл ~20-22s), cron → `*/2`, scheduled()+internal
  jobs/process ползват driveJobs, нов admin endpoint `/pipelines/:id/process` + бутон
  „Обработи чакащите сега“.

## [2.35.0] — 2026-07-18

### Ново
- **Управляем вечерен AI pipeline**: главен бутон Start↔Stop от реалния backend
  статус (`/api/admin/ai/pipelines/active`); safe stop (`/stop` — cancel pending,
  running приключва, приложените резултати остават) → stopped/partial; per-agent
  `/stop-purpose` (блокира зависимите). maybeFinishRun финализира и `stopping`.
- **Stage indicators** по агент (готови/работят/чакат/неуспешни) + прогрес по
  (completed+failed+skipped+cancelled)/total.
- **Нов раздел „Задачи“** (`JobsPanel`): jobs summary (`/jobs/summary`), филтри
  (purpose/status/country), таблица с преведени статуси, страниране.
- **„Преизчисли статистиките“** (преименувано) + обяснителен modal (какво се
  обновява, без AI разход); **recover-stuck** (`/jobs/recover-stuck`, stuckJobCount)
  — изтекли locks → queue, orphaned running при terminal run → failed.
- Тестове: `test/ai-stop.test.mjs` (5). Общо 116 unit теста.

## [2.34.0] — 2026-07-18

### Подобрено
- **Footer статистика**: `FooterStat`×4 (държави/източници/процедури/общ бюджет) от
  `/api/public/platform-statistics` (същия като /sources) — без hardcode; skeleton +
  „Статистиката временно не е налична“; компактен locale-aware EUR формат.
- **FooterLink** (reusable) с водеща стрелка (aria-hidden, hover shift) за ВСИЧКИ
  навигационни връзки; текст/имейл/copyright без стрелка.
- **Mobile**: „Полезни връзки“ в 2 колони (1 под 340px); стат-картите 2×2.
- **RouteSwipe** (глобален, монтиран в AppChrome): единствен source of truth е
  pathname (`getMainRouteIndex`/`MAIN_ROUTES` в routes.js). От вътрешна страница
  първият swipe → „/“ (scroll reset); детайл-маршрутите (/procedures/:slug) не са в
  carousel-а; exclusions за select/link/footer/scrollable/[data-disable-route-swipe].
  Премахнат дублиращият swipe от DashboardShell. `tabFromPath` връща null за вътрешни
  страници (без фалшив активен таб). Тестове: `test/route-swipe.test.mjs` (9).

## [2.33.0] — 2026-07-18

### Поправено
- **Обзор**: 8 KPI карти на един ред (`.ov-kpi` repeat(8), компактни отстъпи; 4×2
  таблет, 2 колони телефон; правилните класове .kpi-n/.kpi-l).
- **AI apply**: executor-ите вече ПРИЛАГАТ резултата — budget_analysis пише
  `budget_amount_eur`/`budget_currency` в projects (EUR директно, BGN по 1.95583,
  плаваща валута → NULL) и извиква recomputeCountrySnapshot; „success“ = приложено,
  иначе `failed_persistence`.
- **Recompute + диагностика**: `/api/admin/ai/recompute-aggregates` (без AI) +
  `/api/admin/ai/budget-diagnostics`; бутон „Преизчисли агрегатите“.
- **/about**: голото „—“ в таблицата → „Няма структурирани бюджетни данни“.
  Диагноза: AT/CZ/EE/SK/DE без публикуван общ бюджет; PL/HU/DK/SE в национална валута.
- Тестове: `test/ai-apply.test.mjs` (7). Общо 102 unit теста.

## [2.32.0] — 2026-07-18

### Ново
- **Реални резултати в „AI логове“** (migration 0019): `ai_execution_runs.result_summary`
  + `result_details_json` + count колони; `worker/ai/summaries.js` строи детерминистично
  резюме от реални метрики (не свободен текст от модела). Причината за „—“ беше, че
  pipeline_job generation редовете нямаха резюме — вече се попълва при всеки job.
- **Разгъваем ред** в колоната „Резултат“ (chevron, aria-expanded/controls, 44px,
  Enter/Space) → зарежда safe детайли от `GET /api/admin/ai/runs/:id` (no-store, admin
  only, без ключове/prompts/reasoning/лични данни; redactObject).
- **Тестов режим** в диалога за стартиране (до 3 реални записа, test_run флаг).
- Тестове: `test/ai-summaries.test.mjs` (12).

## [2.31.1] — 2026-07-18

### Поправено
- **GitHub Actions „Tests"**: вече минават всички 144 теста (преди: 12 провалени +
  6 `.test.mjs` файла напълно пропускани от vitest). `vitest.config.js` вече включва
  и `.test.mjs` (те ползват `it` от vitest, когато е наличен — под vitest, иначе
  падат на ръчния brojач за директно пускане с `node`).
- **DashboardShell/FilterPanel/SavedTracked**: премахнат бъг с компоненти,
  дефинирани ВЪТРЕ в друг компонент (`Results`, `Group`, `Block`) — React ги
  третираше като нов тип при всеки render на родителя и размонтираше/монтираше
  наново цялата решетка карти/чекбоксове по средата на взаимодействие
  (губеше клик/фокус/скрол; в тестове — detached DOM references по средата на
  `userEvent.click`). Засегнатите вече са обикновени функции (`renderResults`,
  `renderGroup`, `renderBlock`), извиквани директно, не като JSX тагове.
- **test/dashboard.test.jsx**: DashboardShell вече чете активния таб от реалния
  маршрут (`usePathname`/`useRouter`), не от вътрешно състояние — тестовете вече
  мокват `next/navigation`/`next/link` и обвиват с `I18nProvider`/`CountryProvider`
  (както `app/layout.jsx`), вместо да симулират клик за навигация в единична
  инстанция.
- **test/project-utils.test.js**: обновени очаквания за `serializeFilters`/
  `deserializeFilters` — `tab` вече е маршрут, не query параметър; периодът по
  подразбиране е `7` (не `30`), плюс независимия `activityPeriod` (default `90`).

## [2.31.0] — 2026-07-18

### Ново
- **Вечерен AI pipeline** (migration 0018): `ai_jobs` (D1 queue + locks + idempotency),
  `ai_pipeline_runs`, `ai_schedules`, `ai_prompt_versions`; `ai_execution_runs.parent_run_id`.
- **NightlyAIOrchestrator** (`worker/ai/pipeline.js`): dependency graph
  procedure→{document,budget}→recommendation; purpose executors върху AIExecutionService;
  versioned prompts + structured schemas (`worker/ai/prompts.js`); skip_unchanged по
  idempotency ключ (purpose+entity+hash+model+prompt+schema); приоритизиране по срок.
- **API** (`worker/ai/pipeline-handlers.js`): admin pipelines/purposes/schedules/jobs +
  start/estimate/retry-failed/cancel-pending; internal daily-review-completed/jobs/process/
  nightly/start (HMAC). Cron Trigger `*/15 * * * *` + `scheduled()` fallback.
- **Admin UI** (AiModelsTab): „Стартирай сега“ per модел, „Стартирай всички активни“,
  „Стартирай вечерния pipeline“, scope modal с оценка, live статус + progress bar,
  автоматично изпълнение per purpose. future_chat никога не се стартира.
- **Privacy**: recommendation изпраща само неутрални структурирани полета (без имейл/
  име/Google ID). Тестове: `test/ai-pipeline.test.mjs` (14).

## [2.30.5] — 2026-07-18

### Данни
- **България → евро** (migration 0017): `countries.currency_code` BG BGN→EUR;
  `user_profiles.financial_currency_code` и `projects.budget_currency` BGN→EUR;
  countries.js BG currency EUR; REVENUE_RANGES fallback EUR. Историческите лв суми
  вече са в EUR (budget_amount_eur по 1.95583). Профилът показва „Годишен оборот (EUR)“.

## [2.30.4] — 2026-07-18

### Подобрено
- **LICENSE** файл (собствен, All Rights Reserved — Svetlin Krastanov / S2K Design).
- **Footer**: връзка „Лицензирано“ след версията →
  github.com/s2kdesign-com/europe-projects/blob/main/LICENSE. i18n footer.licensed.

## [2.30.3] — 2026-07-18

### Подобрено
- **/sources обзор**: +2 кутийки — „Брой процедури“ (totalProcedures) и „Общ бюджет“
  (publishedBudgetEur, компактен EUR) от platform-statistics.

## [2.30.2] — 2026-07-18

### Подобрено
- **Footer** центриран на 3 реда: „Made with Love 💗 by Svetlin Krastanov“
  (→ linktr.ee/Magik3a), после s2kdesign.com © + права, после версията.

## [2.30.1] — 2026-07-18

### Подобрено
- **Welcome модал**: всяка AI карта има „Научи повече“ (f1→/sources, f2→/about#how-we-use-ai,
  f3→/about#about-system, f4→/about#how-ai-works); до баджа — статистика (общо
  процедури/държави/източници от platform-statistics).
- **Синхрон на countries.source_count/active_source_count** от funding_sources
  (беше 41, реално 73 активни) → /sources и модалът показват еднакви числа.

## [2.30.0] — 2026-07-18

### Ново
- **Обзор на /sources**: нов `SourcesOverview` — описание, общ брой обхванати държави
  и общ брой активни източника (от /api/countries на живо) + мрежа с всичките 27
  държави (знаме + брой източници, клик сменя CountryContext). i18n country.sources*.

## [2.29.3] — 2026-07-18

### Подобрено
- **Страниране на AI логовете** (admin → AI модели): PAGE 25→10, така пейджърът се
  показва при >10 записа; „Предишна/Следваща“ и броячът вече минават през tl().

## [2.29.2] — 2026-07-18

### Данни
- **18 нови официални източника в 16 държави** (funding_sources: 75 общо, 73 активни):
  CZ (MPO OP TAK, ESF ČR), EE (EIS, KIK), LU (Luxinnovation), SI (Podjetniški sklad),
  AT (ESF), CY (RIF), FI (Business Finland), FR (Aides-territoires), HU (NKFIH),
  IE (NWRA, EMRA), LV (LIAA), NL (RVO), SE (Tillväxtverket) — enabled=1, проверени
  HTTP 200 server-rendered; PL (PARP) и ES (CDTI) — verified=1, enabled=0
  (JS-rendered, до намиране на структуриран достъп). Одит в source_audit_log.

## [2.29.1] — 2026-07-18

### Поправено
- **/about на мобилно**: grid клетките на .ab-map-grid получиха `min-width: 0` —
  таблицата (admin-table min-width 640px) разпъваше цялата страница вместо да
  скролва в .table-scroll. Добавен и собствен overflow-x + компактни мобилни
  редове за .euro-data-table (не разчита на admin.css контекста).

## [2.29.0] — 2026-07-18

### Ново
- **Структурирани бюджети** (migration 0016): `projects.budget_amount_eur` +
  `budget_currency`; backfill 105/169 (~€5.01 млрд) с консервативен parser —
  само изрични EUR суми или BGN по фиксирания 1.95583; плаващи валути → NULL.
- **SNAPSHOT_SQL смята бюджетите** (published_budget_eur, budget_procedure_count);
  днешният snapshot е регенериран — /about показва реални бюджети.
- **Scheduled Task**: на всеки 5 часа; история 365 дни за всички държави;
  извлича и структурираните бюджети по горните правила.
- **/about Data Table**: видима таблица по държави (10 + „Виж повече“), знамена,
  компактни EUR суми. i18n about.showMore/showLess.

## [2.28.4] — 2026-07-18

### Поправено
- **Динамичният sitemap (worker/sitemap.js) без дубликати** — seen Set dedupe на
  всички `<loc>`; пропуснати празни slugs (10 записа `/procedures/programs/`);
  4 дублирани URL-а премахнати. Приоритети уеднаквени (/about 0.7, /sources 0.6).
- **Изтрит мъртвият `public/sitemap.xml`** — Worker route-ът винаги го override-ваше;
  двата източника на истина се разминаваха. Sitemap-ът е САМО динамичният.
- **canonicalRedirect разширен** — http:// на каноничния домейн → 301 https;
  www.euro-funds.eu → 301 apex (действа само ако www сочи към Worker-а — иначе
  трябва DNS запис + route в Cloudflare).

## [2.28.3] — 2026-07-18

### Поправено
- **Country дропдаунът показва реалните статуси** — CountryProvider merge-ва live
  данни от `/api/countries` (enabled + ingestion_status==='active') върху статичния
  регистър; 21 активни държави вече се показват коректно.
- **Без хоризонтален скрол** в дропдауна — `overflow-x: hidden`, ellipsis на
  имена/статуси, flex-shrink на елементите.

## [2.28.2] — 2026-07-18

### Подобрено
- **Sitemap** — добавени /about, /sources, /how-ai-works; `lastmod` за всички 10 URL-а.
- **SEO metadata** — root title/description/keywords за 27-те държави от ЕС (не само
  България); процедури/календар описания multi-country; премахнат лъжлив hreflang
  (`/en`, `/de` не съществуват — езикът е клиентски).
- **OG изображения** — под-layout-ите override-ваха openGraph без images → добавено
  `/og-image.png` на всичките 9 публични подстраници.
- **robots.txt** — Disallow и за /saved и /api/.

## [2.28.1] — 2026-07-18

### Поправено
- **„Имате незапазени промени“ вече изчезва след запазване** — baseline-ът е state
  (не ref), така че dirty се преизчислява след успешен запис.
- Съобщенията за успех/грешка в профила („Профилът е запазен.“ и др.) минават през tl().

## [2.28.0] — 2026-07-18

### Ново
- **Региони за всичките 27 държави от ЕС** — 394 региона на първо административно
  ниво в `country_regions` (seed през connector) + ADMIN_LABELS за всяка държава
  (Жупания/Комитат/Лен/Кантон…).
- **Country-aware profile completion** — програмите не смъкват процента при
  държава без извлечени данни (`computeCompletion(clean, { hasProgrammes })`).
- **Sticky „незапазени промени“ бар** в профила (`.profile-savebar`, aria-live).

## [2.27.0] — 2026-07-18

### Ново
- **Country-aware профил**: регионите, програмите, валутата и административните
  етикети идват динамично според държавата за финансиране.
- Нова D1 таблица `country_regions` (BG области, RO окръзи, DE провинции,
  PL воеводства, GR региони) + API `GET /api/countries/profile-options`.
- Етикетът на региона е country-specific („Област“/„Окръг“/„Федерална
  провинция“/„Воеводство“…) чрез `countryAdminLabels()`.
- „Годишен оборот“ във валутата на държавата (BGN/RON/EUR/PLN…) — не hardcoded лв.
- Смяна на държавата → потвърждение + изчистване само на несъвместимите стойности;
  универсалните полета се запазват.
- Профилни колони `financial_currency_code`, `country_profile_version` (backfill BGN).
- Нови тестове: `test/profile-country.test.mjs` (9).

## [2.26.7] — 2026-07-18

### Поправено
- **/about на пълна ширина** като хедъра/footer-а: картата без 640px лимит
  (запълва лявата колона), summary колоната 320→360px, lead 760→900px.

## [2.26.6] — 2026-07-18

### Подобрено
- **/about диаграмата** показва общ брой процедури по държави (низходящо), с
  изписване „брой / публикуван бюджет“ (компактен EUR формат; „—“ при липса на
  структурирани бюджети). Заглавие: „Процедури по държави (брой / публикуван бюджет)“.

## [2.26.5] — 2026-07-18

### Подобрено (преводи)
- **Администрацията е изцяло преводима**: AI модели (карти, доставчици, активни
  модели, дневна процедура, логове, грешки/потвърждения), Потребители, Exceptions,
  Сигнали, формата за източници и всички етикети на „Система“ — през batch превода
  (ADMIN_LABELS ~170 низа + tl() в всички подкомпоненти).

## [2.26.4] — 2026-07-18

### Подобрено (AI модели)
- **Цените актуализирани по официалната OpenAI ценова страница** (Standard tier):
  5.6 Sol $2.50/$15, Terra $1.25/$7.50, Luna $0.50/$3; 5.5 $2.50/$15; 5.5/5.4 Pro
  $15/$90; 5.4 $1.25/$7.50, mini $0.375/$2.25, nano $0.10/$0.625 (за 1M).
- **Инфо панел при избран модел:** цена + „най-добро за“ препоръка.
- **Нови колони** в „Активни AI модели“: Цена (~1M) и **Използван** (заявки,
  токени, последна употреба от ai_execution_runs; usage в GET providers).

## [2.26.3] — 2026-07-18

### Добавено / Активирано
- **Системен AI анализ активен:** `gpt-5.6-terra` (валидиран чрез реалния списък
  на акаунта; терра = балансираното ниво, сменяемо). future_chat конфигурацията
  също валидирана (остава изключена). Одит запис добавен.
- **Изборът на модел** включва всички chat модели (5.6 Sol/Terra/Luna, 5.5,
  5.5 Pro, 5.4…) с **ориентировъчни цени** ($вход/$изход за 1M токена) от
  версионирана таблица (`app/lib/ai-pricing.js`, към 2026-07-18) + дисклеймър.
- **Footer:** активните AI модели са в **зелено** с жив индикатор (daily преглед
  при успешен run <48ч; системен AI при status=active).
- /about „Systematic AI analysis“ показва „OK“ (от публичната конфигурация).

## [2.26.2] — 2026-07-18

### Поправено / Данни
- **AI модели:** авто-зареждане на списъка с реално достъпните модели при отваряне
  на таба (кешът беше празен → празен dropdown); авто-валидация и активиране на
  системния AI анализ при наличен точен ID `gpt-5.6` (нивата Sol/Terra/Luna
  остават ръчен избор). Документи/бюджети/препоръки наследяват системния модел.
- **Гърция активирана** (21 реални процедури от espa.gr — задачата ги внесе, но
  беше пропуснала UPDATE на countries; поправено) и **Полша активна** (28 от
  funduszeeuropejskie.gov.pl). Snapshot за /about ре-генериран: BG 42 / GR 21 /
  PL 28. RO и HR: блокирани JS портали (документирано, търси се алтернатива).

## [2.26.1] — 2026-07-18

### Добавено / Променено
- **Географска карта на Европа** на /about (замества мозайката): локален
  оптимизиран SVG (по Wikimedia „Blank map of Europe“, CC BY-SA; 230KB/57KB gzip,
  зарежда се с fetch — не тежи в bundle-а), реални граници, синя скала, клик +
  клавиатурен избор (Enter/Space, aria-pressed), съседни не-ЕС държави като сив
  контекст; при неуспешно зареждане остава таблицата-алтернатива.
- **Пълно извличане за всички държави:** активирани 41-те проверени източника
  (enabled=1), 27-те държави → connector_ready. Scheduled Task prompt-ът е
  преработен: приоритет на държави с 0 процедури, минимум 10-15 при първично
  напълване, история 60 дни, авто-активиране след ≥3 валидни процедури, блокирани
  портали → audit запис + алтернативен официален достъп; без измислени данни.

## [2.26.0] — 2026-07-18

### Добавено (нова /about страница)
- **Три секции с anchors** (#about-system, #how-we-use-ai, #how-ai-works) + sticky
  локална навигация (IntersectionObserver, aria-current, hash history).
- **Hero** с реален статус ред (държави/източници/процедури/последно обновяване от
  snapshot) + CTA + Share/Copy.
- **Карта на покритието** (tile grid cartogram, локални SVG знамена, синя
  последователна скала + легенда, keyboard focus, панел вместо hover-only tooltip,
  видима таблица-алтернатива). Държави без данни → „Източниците се добавят“.
- **Обобщение**: totals + водещи по активни процедури и по публикуван бюджет
  (отделни класации); бюджет = САМО валидни структурирани EUR стойности
  (dedup, без измислени суми; NULL при липса + дисклеймър).
- **Migration 0014:** `country_daily_statistics` (unique snapshot_date+country,
  publish_status published/pending_review) — populate-нат днешен snapshot (27
  държави, 42/20 BG). Дневната процедура записва snapshot САМО при успешен run;
  anomaly проверки → pending_review (не заменя последния успешен).
- **Public API:** `GET /api/public/platform-statistics` (последен успешен snapshot,
  ETag, cache 300s + stale-while-revalidate; само публични полета).
- **AI public config** разширен: lastSuccessfulRunAt/countriesReviewed/actualModel
  (от реалния run log — desired ≠ actual).
- **SEO:** нови metadata + WebPage/BreadcrumbList/WebApplication JSON-LD.
- **Footer:** „За системата“ → /about#about-system, „Как работи AI“ →
  /about#how-ai-works, „Как използваме AI“ → /about#how-we-use-ai.
- **Тестове:** 12 нови (budget exclusion/dedup/null, Europe totals, anomaly
  правила, partial sync protection) — общо 60 минават.

## [2.25.2] — 2026-07-18

### Подобрено (преводи)
- **Брандът „Европроекти“ се превежда** (AppHeader, AccountHeader, SiteFooter —
  през `common.appName`); „Към таблото“ също (`common.backToDashboard`).
- **Администрация:** page-head, табове, вход/достъп екрани, „Система“ секциите и
  „Източници“ (филтри, бутони, таблични заглавия, пагинация) — batch превод.
- **/sources:** динамичните описания (покритие/орган от D1) се превеждат.
- AccountHeader ползва CountryLogoMark (знаме) като останалите хедъри.

## [2.25.1] — 2026-07-18

### Подобрено
- **Информационният прозорец:** нова секция „AI модели“ в дъното (от публичната
  безопасна конфигурация) + разширени полезни връзки (За системата, Официални
  източници, Как работи AI, Условия).

## [2.25.0] — 2026-07-18

### Добавено (AI управление)
- **Migration 0013:** `ai_providers`, `ai_provider_credentials` (AES-256-GCM,
  master key = Cloudflare secret `AI_CREDENTIALS_MASTER_KEY`, НЕ в D1/frontend),
  `ai_model_configurations` (уникална активна per purpose), `ai_execution_runs`,
  `ai_audit_log`. Seeds: daily_review = Claude Opus 4.8 (`claude-opus-4-8`,
  потвърден от Anthropic docs); GPT-5.6 = НЕАКТИВЕН до реална валидация на точния
  model ID (нива Sol/Terra/Luna).
- **Provider слой** (`worker/ai/`): единен интерфейс + Anthropic/OpenAI адаптери
  (testConnection/validateModel/listModels/generate), AIExecutionService с
  fallback само при временни грешки, redaction на тайни в логовете.
- **Admin API:** `/api/admin/ai/providers` (+key/test/models/refresh),
  `/api/admin/ai/configurations/:purpose`, `/api/admin/ai/runs`, `/api/admin/ai/summary`
  — само за админ, no-store, одит в `ai_audit_log`.
- **Публично:** `GET /api/ai/public-configuration` (само display данни).
- **Internal:** `POST /api/internal/ai-runs/report` (HMAC + timestamp + idempotency,
  secret `SCHEDULED_TASK_REPORTING_SECRET`).
- **Админ таб „AI модели“:** summary карти (дневен преглед с бадж „Управлява се от
  Claude Scheduled Tasks“ + desired/actual разделение, системен AI, бъдещ чат,
  заявки днес), provider карти (ключ: добави/замени/тест/премахни; само last 4),
  активни модели с валидация, „Дневна процедура“ и AI логове с филтри/страници.
- **Footer:** блок „AI модели“ от публичната конфигурация + „Как използваме AI“.
- **Scheduled Task:** добавена reporting стъпка (ai_execution_runs, idempotent).
- **Тестове:** 7 нови (crypto roundtrip/wrong key/IV, fingerprint, redaction,
  fallback правила). Публичният чат остава изключен (AI_CHAT_ENABLED=false).

## [2.24.1] — 2026-07-18

### Подобрено (админ)
- **Пълна ширина** на всички админ табове (със и без записи).
- **URL колоната** показва само домейна + стрелка за разгъване на пълните адреси.
- **Цветни health статуси** (зелено/жълто/червено) в „Източници“.
- **Пагинация** по 25 записа със страници и брояч.

## [2.24.0] — 2026-07-18

### Добавено (админ)
- **Нов таб „Източници“ в /admin:** пълен регистър на източниците с филтри по
  държава/статус (активни/проверени/проблемни) + търсене; verified/enabled
  toggle-и (enabled изисква verified), избор на source health, брояч на
  последователните грешки, последен успех.
- **Добавяне и редакция** на източници (име, орган, URL-и, тип, ниво, език,
  приоритет, покритие, JS изискване) през нови admin API endpoints
  (`GET/POST /api/admin/sources`, `PATCH /api/admin/sources/:id`).
- Промените по verified/enabled се записват в `source_audit_log`; броячите в
  `countries` се преизчисляват автоматично.

## [2.23.3] — 2026-07-18

### Данни / Подобрено
- **Нови проверени официални източници:** Anaptyxi.gov.gr (GR),
  strukturnifondovi.hr + fondovieu.gov.hr (HR), Balcão dos Fundos (PT),
  ITMS2014+ (SK), esinvesticijos.lt (LT), CFLA (LV) + calls URL-и за GR/PL/CZ/SK/SI
  (41 източника общо, всички с одит записи).
- **/sources:** дропдаунът е **избор на държава** (вместо език).
- **SEO:** `/sources` добавена в sitemap.xml + hreflang варианти; `/en/sources` и
  `/de/sources` работят (SHELL_PATHS); robots/noindex/canonical проверени за
  всички страници.

## [2.23.2] — 2026-07-18

### Подобрено
- **/sources** вече има стандартното топ меню като останалите страници + **избор
  на език** до заглавието; footer връзката „Източници на данни“ води към /sources.

## [2.23.1] — 2026-07-18

### Данни
- **Официални източници за всичките 27 държави:** записани са националните единни
  портали на 25-те оставащи държави в `funding_sources` (verified=1 по официалния
  списък на ЕК „National single portals“, enabled=0 до QA) + одит записи с
  доказателство. `/sources` показва портала за всяка държава. `countries` →
  `ingestion_status='researching'` + актуализирани броячи.

## [2.23.0] — 2026-07-18

### Добавено (multi-country Scheduled Task)
- **Claude Scheduled Task е преработена** от само-България в общ multi-country
  процес: държавите/източниците се зареждат **динамично от D1**, обработват се
  **последователно** с **persistent cursor** (round-robin, не винаги от BG),
  **locks** срещу паралелни run-ове и **timeout safety** с continuation.
- **Migration 0012:** `scheduled_country_sync_state` (cursor), `scheduled_sync_runs`
  (отчети), lock полета в `country_sync_state`.
- **`src/ingestion/core/scheduler.js`** — чиста cursor/lock/timeout логика +
  22 unit теста (вкл. интеграционен сценарий BG/RO/GR/PL/HR и round-robin fairness).
- Групи: production sync само за `connector_ready/active/degraded` с verified
  източници; останалите продължават rollout без production запис.
- BG regression: 42 процедури / 32 документа / 5 verified източника — непокътнати.

## [2.22.6] — 2026-07-18

### Подобрено
- **Езиковият селектор вече показва знаме за всеки език** (както селектора за
  държава). Добавени знамена за английски (GB), турски, украински и сръбски.

## [2.22.5] — 2026-07-18

### Поправено
- Отворените **падащи менюта за държава/език вече излизат извън кутията** в
  информационния прозорец (overflow:hidden се прилага само при сгъване).

## [2.22.4] — 2026-07-18

### Поправено
- След сгъването на кутията за държава/език вече **не остава разделителна линия
  отгоре** в информационния прозорец.

## [2.22.3] — 2026-07-18

### Подобрено
- След **„Потвърди държавата“** горната кутия за държава и език се **сгъва с
  анимация**, а съдържанието се качва плавно (уважава „reduced motion“).

## [2.22.2] — 2026-07-18

### Подобрено
- В информационния прозорец **изборът на език е преместен най-горе, до избора на
  държава** — две колони „Вашата държава“ и „Вашият език“ (на тесен екран — една
  под друга).

## [2.22.1] — 2026-07-18

### Добавено / Подобрено
- **Локални SVG знамена за всичките 27 държави** (без emoji) — селекторът показва
  знаме за всяка държава.
- **CountrySyncOrchestrator** (`src/ingestion/core`): country-aware, resumable
  оркестратор — обхожда източниците по `next_run_at`, dedup по content hash,
  метрики в `source_sync_runs`/`country_sync_state`, не затваря процедура при един
  пропуснат sync (изисква праг или официален closed).
- **Запазените процедури пазят държавата си** (migration 0011, backfill BG) —
  подготовка за филтъра „Текуща/Всички държави“.
- **Официалните източници за България** (eufunds.bg, ИСУН, esf.bg, Агенция по
  заетостта, ПКИП) са публикувани на `/sources`.
- Преведено празно състояние „Няма спешни действия“.

## [2.22.0] — 2026-07-18

### Добавено (multi-country UI)
- **Избор на държава** навсякъде: секция „Вашата държава“ в информационния прозорец
  (с приблизително предложение чрез Cloudflare, **без** съхраняване на IP), селектор
  във **footer-а** и в **профила** (отделно от езика).
- **Country-aware зареждане:** процедурите/обзорът/статистиките идват според избраната
  държава (`/api/projects?country=`); при смяна старите заявки се abort-ват + skeleton.
- **CountryLogoMark:** логото показва знамето на държавата (символът остава видим,
  без layout shift).
- **Нова страница „Официални източници“** (`/sources`) + `/api/sources?country=` —
  портали и управляващи органи по държава (само безопасни полета).
- Изборът се пази локално (guest) или в профила (при вход, синхронизиран).
- Реални данни засега само за **България**; останалите се активират поетапно.

## [2.21.0] — 2026-07-18

### Добавено (основа за многонационалност — подготовка)
- **База данни:** нови таблици `countries` (seed на 27-те държави членки),
  `funding_sources` + `source_audit_log`, `country_sync_state` + `source_sync_runs`;
  additive колони за държава/източник в `projects`/`documents`; всички досегашни
  процедури са backfill-нати като `BG`. Профилът получи `preferred_country`/
  `country_mode`/`country_detection_enabled`.
- **Frontend основа:** регистър на държавите, `CountryContext`/`useCountry`, логика за
  определяне на държавата (URL → профил → guest → Cloudflare → locale → BG), локални
  SVG знамена (стъпка 1) — отделно състояние за език и за държава.
- **API:** `?country=` филтър (по подразбиране BG) + `/api/geo` (приблизителна
  държава от Cloudflare, **без** съхраняване на IP) + `/api/countries` +
  `GET/PATCH /api/profile/country`.
- **Ingestion:** общ `CountryConnector` интерфейс + BG reference stub + RO scaffold;
  19 unit/dry-run проверки минават.
- **Румъния:** проверени официални източници; connector в процес (порталите са
  JS-rendered → предстои потвърждаване на формата). RO **не** е активна.
- Видимият UI за избор на държава/знамена/източници предстои в следващи версии.

## [2.20.2] — 2026-07-18

### Поправено
- **KPI бутоните** на началната страница отново отварят филтрираните процедури
  (филтрите се пренасят през URL при смяна на маршрута, за да не се губят).
- Кликът по седмица в „Активност на процедурите“ отваря коректно списъка.

### Добавено
- **Приветстващият прозорец** е преведен изцяло и има **избор на език** (25
  езика) до бутона за вход с Google.

## [2.20.1] — 2026-07-18

### Добавено
- **Обзор** е преведен докрай: секция „Активност на процедурите“ (показатели,
  тенденция, легенда, подсказки, заключение) и диаграмите „Финансиране по
  направления“ (заглавия, статуси, тип кандидат), плюс бързите действия.
- **Календар**: имената на месеците и дните от седмицата се локализират
  автоматично (Intl); „Днес/Месец/Година“ и „Предстоящи срокове“ — преводими.
- **Запазени**: заглавия, групи, празни състояния и бележки се превеждат.

## [2.20.0] — 2026-07-18

### Добавено
- **Профилната страница** е преведена изцяло: секции, полета, всички таксономии
  (тип организация, сектори, региони, тип кандидат, интереси), известия,
  поверителност и диалогът за изтриване на акаунт се показват на избрания език.
- Екранът за вход, промптът при първоначална настройка и падащите менюта също.

## [2.19.1] — 2026-07-18

### Добавено
- Обзорът е преведен докрай: статус ред („Обновено: …", „Автоматично обновяване
  всеки ден"), **AI резюмето** (автоматичен превод), бутоните за период (7/30/90 дни)
  и списъкът **„Наближаващи срокове"** (имена на процедурите + подсказки).

## [2.19.0] — 2026-07-18

### Добавено / Поправено
- **Дати и отброяване** („остават N дни") се локализират според езика (Intl).
- Преводими: **причини за внимание**, **бакети за срокове**, промпт за профил,
  бутон „Профил", празни състояния, имена на процедурите в **„Какво е ново"**.
- **Иконата за копиране** на началните карти е върната — **вдясно, до реда „Обновено"**.

## [2.18.1] — 2026-07-18

### Поправено
- Началните карти („Изискват внимание", „Най-подходящи") вече **не показват иконата
  за копиране** на отделен ред, а показват реда **„Обновено: <дата>"**.
- Етикетите и полетата на тези карти са напълно преводими.

## [2.18.0] — 2026-07-17

### Добавено (превод на съдържанието в картите)
- При чужд език **процедурите в картите се превеждат** — заглавие, бюджет, кандидати,
  срок-текст (batch превод за всички видими карти наведнъж, кеширано в клиента и D1).
- Ненатрапчив индикатор **„Преведено автоматично"**; оригиналът остава в детайлната страница.
- Етикетите на картите (Ново, Младежи, Срок, Бюджет, Кандидати, действия) — преводими.
- Кодовете и имената на програмите остават непроменени (собствени идентификатори).

## [2.17.0] — 2026-07-17

### Добавено / Поправено
- **Филтърният панел** („Процедури") е напълно преводим: заглавия и всички опции
  (статуси, целеви групи, срокове, наличност, „Изчисти всички").
- Преводима връзка за достъпност **„Към съдържанието"**.
- Отстранено предупреждение при хидратация (`suppressHydrationWarning` на `<html>`,
  тъй като езикът/посоката се задават преди хидратацията).

## [2.16.1] — 2026-07-17

### Поправено / Добавено
- Главното меню — **без подчертаване** на връзките.
- **Преводимо потребителско меню** (вход, профил, запазени, настройки, изход).
- Поправен адрес „Моите запазени" → `/saved` (вместо legacy `?tab=saved`).
- `sitemap.xml` — **xhtml:link** езикови алтернативи (bg/en/de/x-default) за основните страници.

## [2.16.0] — 2026-07-17

### Добавено / Поправено
- Още преводими низове: подзаглавие „Табло за финансиране", toast съобщения
  (копиране/сваляне), празно състояние + „Изчисти филтрите", банери за остарели/частични данни.
- **Зареждащите блокове** (скелетон) вече са в центрирания контейнер — същата
  ширина и брой колони като реалните карти (преди бяха на цялата ширина).

## [2.15.1] — 2026-07-17

### Поправено
- **Hydration грешка (#418)** при първоначално зареждане на не-български език —
  i18n вече стартира на български (както е статичната страница) и превключва
  веднага след хидратацията. Това пречеше и на навигацията в менюто.
- Главното меню използва **Next `<Link>`** — по-надеждна клиентска навигация.

## [2.15.0] — 2026-07-17

### Добавено (езикови URL-и — Worker)
- Path-prefix адреси **/en/** и **/de/** за основните страници (`/en/procedures`,
  `/de/calendar` и т.н.). Worker-ът сервира българската статика с пренаписан `<head>`.
- **Self-referencing canonical** за всяка езикова версия (не canonical-ва към bg).
- **hreflang** между `bg`, `en`, `de` + `x-default` (реципрочно на bg и езиковите страници).
- Заглавие и описание в `<head>` се превеждат server-side (кеширано); клиентът зарежда
  директно на съответния език (без премигване).

### Забележка
- Езиковите SSR detail/landing страници (/en/procedures/:slug) — следваща стъпка.

## [2.14.0] — 2026-07-17

### Добавено (landing страници + съдържание)
- **По програма:** `/procedures/programs` (индекс) и `/procedures/programs/<slug>`.
- **По кандидат:** `/procedures/candidates/business`, `/procedures/candidates/youth`.
- **По срок:** `/procedures/deadlines/next-7-days | next-30-days | next-90-days`.
- Всяка landing страница: собствено заглавие, описание, canonical, breadcrumbs,
  intro и `ItemList` JSON-LD (Worker SSR).
- Съдържателни страници **/about** и **/how-ai-works** (индексируеми, с текст + disclaimer).
- `sitemap.xml` включва всички нови адреси; добавена **Google/Bing verification**
  (чрез env `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION`).

## [2.13.0] — 2026-07-17

### Добавено
- **Динамичен `sitemap.xml`** от D1: статичните маршрути + всяка процедура
  (`/procedures/<slug>` с `lastmod`) + landing по статус. Без лични страници.
- **Landing страници по статус** (Worker SSR): `/procedures/status/open`,
  `/closing-soon`, `/upcoming`, `/closed` — със заглавие, описание, canonical,
  breadcrumbs и `ItemList` JSON-LD.

## [2.12.0] — 2026-07-17

### Добавено (procedure detail страници — Worker SSR)
- Всяка процедура има **собствена страница** `/procedures/<id>`, рендирана server-side
  от Worker-а (D1): заглавие, статус, програма, срок, бюджет, кандидати, документи,
  източник, breadcrumbs, AI бележка + disclaimer.
- Пълни SEO метаданни в raw HTML: title, description, canonical, `og:type=article`,
  Twitter card, **JSON-LD** `MonetaryGrant` + `BreadcrumbList`.
- Картите съдържат **реален `<a href>`** към страницата (нов таб/сподели работят);
  in-app клик отваря drawer.
- Липсваща процедура → **404**; стар slug → **301** към каноничния.

### Предстои
- Динамичен sitemap с procedure URL-ите (`lastmod`), landing pages, езикови /en //de/.

## [2.11.1] — 2026-07-17

### Поправено
- Параметрите на „Обзор" (`period`, `activityPeriod`) вече **не изтичат** към
  `/procedures`, `/calendar`, `/saved`. Всеки маршрут пази в адреса само своите
  параметри (route-scoped query). Добавена и slug основа за бъдещите procedure detail адреси.

## [2.11.0] — 2026-07-17

### Добавено (реални маршрути — Фаза 1)
- Нови SEO-friendly адреси: **/procedures**, **/calendar**, **/saved** (вместо `?tab=`).
  Отварят се директно, работят при презареждане, имат собствено заглавие/описание/canonical.
- Главното меню ползва **реални `<a href>` линкове**; навигацията остава SPA (без пълно презареждане).
- Worker: старите **`?tab=` / `?page=`** адреси → **301** към чистите маршрути,
  със запазване само на приложимите за целевия маршрут query параметри.
- `tab` вече не е query параметър; параметрите на един маршрут не се пренасят на друг.
- /procedures и /calendar добавени в `sitemap.xml`; /saved е `noindex`.

### Предстои (следващи фази)
- Server-side (Worker) метаданни/съдържание + procedure detail страници `/procedures/:slug`,
  landing pages, динамичен sitemap, JSON-LD/breadcrumbs, езикови URL-и (/en, /de).

## [2.10.0] — 2026-07-17

### Добавено
- **Целият „Обзор" е преводим:** статуси, KPI карти, филтри (Тип кандидат/Програма),
  заглавия на секциите, потокът „Какво е ново", действията по картите (Детайли,
  Документи, Запази, Сравни) и състоянията (зареждане/грешка/празно).

### Забележка
- Остават за извличане: детайлният панел на процедура и документите, сравнението,
  модалът „Добре дошли", формата за сигнали, календарът и правните страници.

## [2.9.2] — 2026-07-17

### Поправено
- **Приоритет на `?lang`:** езикът от no-flash скрипта (URL → ръчен → браузър) вече
  не се презаписва, след като рутингът премахне `?lang` от адреса. `?lang=xx`
  надделява над запазен ръчен избор за текущото посещение.

## [2.9.1] — 2026-07-17

### Поправено
- **Смяната на език вече превежда и интерфейса**, не само съдържанието — статичните
  каталози за не-български езици се генерират автоматично (batch превод) и се
  кешират локално (`app/lib/i18n/catalog.js`).
- Параметърът **`?lang`** в адреса вече има приоритет над запазен ръчен избор
  (`resolveInitial` чете URL езика).

## [2.9.0] — 2026-07-17

### Добавено
- **Преводим интерфейс** (ключове): навигация, целият footer, банер и настройки за
  бисквитки, известието за нова версия, поздрав и подзаглавие на „Обзор".
- **SEO:** `hreflang` (`bg` + `x-default`) и по-кратко meta описание (<160 символа).

### Забележка
- Извличането на статичните низове продължава — предстоят Обзор (карти, KPI),
  Процедури, модалите и филтрите.

## [2.8.1] — 2026-07-17

### Добавено
- Админ панел „Система": секция **„Многоезичност и превод"** (статус, доставчик,
  езици, локация, речник, кеширани преводи), секция **„База данни"** (потребители,
  запазвания, документи, changelog), **build ID** и **домейн**.
- Административен endpoint `GET /api/admin/system` (само за админи).

## [2.8.0] — 2026-07-17

### Добавено (превод на съдържание — Фаза 2–3)
- **Сървърна услуга за превод** (`worker/translation.js`) през Google Cloud
  Translation v3, с автентикация чрез service account (RS256 JWT в Worker-а,
  `worker/gauth.js`) — без ключове във фронтенда.
- **Кеш в базата** — таблица `translation_cache` (миграция `0006`), SHA-256 ключ
  по език + текст + версия на речника; повторни преводи не се извикват.
- **Batch endpoint** `POST /api/i18n/translate-batch` + `GET /api/i18n/languages`
  (кеширан 24 ч) с дедупликация, timeout, retry, rate limiting и валидация.
- **Речник (glossary)** за термините с версия (`GLOSSARY_VERSION`); не се превеждат
  кодове (BG05SFPR001-2.005), числа, URL, имейли.
- Клиентски batch превод с in-memory кеш; индикатор **„Преведено автоматично"**
  и запазен достъп до оригинала.
- Известието за нова версия е напълно преводимо (ключове).

Забележка: живият превод изисква зададени секрети (виж `TRANSLATION-SETUP.md`).
Без тях UI-ът ползва български fallback без счупване.

## [2.7.0] — 2026-07-17

### Добавено (многоезичност — Фаза 1)
- **Автоматично разпознаване** на езика: URL `?lang` → профил → guest → браузър,
  с fallback български и **без премигване** (no-flash inline скрипт задава `lang`/`dir`).
- **Избор на език** от footer-а (секция „Език") и от профила (секция „Език и регион"),
  с търсене, native имена, отметка, клавиатурна навигация и a11y.
- **Запазване**: локално за guest (`evroproekti_language`) и в профила
  (`PATCH /api/profile/language`, синхронизация между устройства).
- Режим **auto/manual** + „Използвай езика на устройството".
- **Intl форматиране** на дати, числа и валути по locale (без преобразуване на стойности).
- **react-i18next** инфраструктура; `bg.json` е source of truth; 25 поддържани езика.
- D1 миграция `0005_language.sql` (`language_mode`, `language_updated_at`).

Забележка: живият превод на UI/съдържание (Google Cloud Translation, кеш, glossary)
идва във Фаза 2–3 след настройка на секретите (виж `TRANSLATION-SETUP.md`). Дотогава
некирилските езици ползват български fallback.

## [2.6.0] — 2026-07-17

### Добавено
- **Собствено SEO заглавие и описание** за страница „Промени".
- Описателно основно заглавие (**H1**) в статичния HTML на началната страница.
- Картата на сайта (`sitemap.xml`) включва „Промени", „Условия", „Поверителност", „Бисквитки".

### Променено
- Каноничните адреси, Open Graph, `sitemap.xml` и `robots.txt` вече сочат
  новия домейн **euro-funds.eu** (по-рано сочеха стария `…workers.dev`).
- Личните страници **Профил**, **Администрация** и **Вход** са `noindex`
  (скрити от търсачките) + `Disallow` в `robots.txt`.

## [2.5.0] — 2026-07-17

### Добавено
- **Собствен домейн** `euro-funds.eu`. Старият адрес `…workers.dev` пренасочва
  автоматично (301) към новия, със запазване на пътя и параметрите.
- Обновени страници **Условия**, **Поверителност** и **Бисквитки** с реални
  фирмени данни (без запазени места/placeholder-и).

### Поправено
- Филтрите **„7 / 30 / 90 дни"** в „Какво е ново" вече реално стесняват потока.
  По-рано (30/60/90) връщаха един и същ списък, защото всички процедури са отпреди
  под 30 дни; освен това потокът беше ограничен на 8 реда.
- Потокът показва всички процедури в избрания период (със скрол при по-дълъг списък).

## [2.2.1] — 2026-07-13

### Добавено
- Бутон **„Документи (n)"** към картите в „Процедури" — до „Детайли". Отваря
  същия детайлен панел директно на таб „Документи" (без нов модал/логика).
  При 0 документа е disabled с tooltip „Няма налични документи".
- Детайлният панел приема начален таб (`initialTab`): „Детайли" → Обзор,
  „Документи" → Документи; при затваряне табът се нулира до „Обзор".

## [2.2.0] — 2026-07-13

### Добавено
- **Роли и администрация.** Роли: `потребител`, `премиум`, `администратор`.
  Първи администратор: s2kdesign.digital@gmail.com (bootstrap при вход).
- **Админ конзола** на `/admin` (менюто „Настройки" е видимо само за админи) с табове
  **Система**, **Потребители** (смяна на роля) и **Exceptions** (журнал на грешките).
- Клиентски репортер на грешки (`window.onerror` / `unhandledrejection`) → `/api/errors`.
- Миграция `0003_admin.sql` (колона `role`, таблица `error_log`).
- API: `GET /api/admin/users`, `PATCH /api/admin/users/:id`, `GET|DELETE /api/admin/errors`, `POST /api/errors`.

### Сигурност
- Админ ендпойнтите изискват роля `admin` (проверка от сесията); bootstrap админът не може да бъде понижен.

## [2.1.1] — 2026-07-13

### Променено
- Мобилен хедър: хоризонтално скролваща навигация, „Вход с Google" горе вдясно,
  премахнато „· България"; активният раздел се центрира при смяна.

### Добавено
- Смяна на раздели с плъзгане (swipe) на мобилно.

## [2.1.0] — 2026-07-12

### Добавено
- Дневник на промените (този файл).

### Променено
- Дневната задача в Claude вече **записва в базата данни** (Cloudflare D1).

### Премахнато
- Бутонът „Обнови сега" от началния екран.

## [2.0.0] — 2026-07-12

### Добавено
- **Вход с Google (SSO)**, сесии в D1, профил (`/profile`), вход (`/login`),
  акаунт-базирани запазвания + миграция, персонализирани препоръки, `AUTH.md`.

## [1.5.0] — 2026-07-12
- Годишен изглед на календара.

## [1.4.2] — 2026-07-12
- Логото вляво е линк към началото.

## [1.4.1] — 2026-07-12
- „Дашборд" → „Табло"; премахнат „фокус младежка заетост" от SEO/OG.

## [1.4.0] — 2026-07-12
- SEO пакет: meta, OG, Twitter Card, JSON-LD, robots/sitemap/manifest, favicon, OG картинка.

## [1.3.0] — 2026-07-12
- Фирмен надпис във футъра.

## [1.2.0] — 2026-07-12
- Богат начален екран „Обзор" + разширени KPI.

## [1.1.0] — 2026-07-12
- Пълен визуален редизайн и компонентна архитектура; лек API + индекси; достъпност и адаптивност.

## [1.0.0] — базова версия
- Начален Next.js дашборд (статичен export) + Cloudflare Worker + D1.
