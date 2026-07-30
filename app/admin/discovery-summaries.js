// Превод на резултатите от валидациите.
//
// Валидаторът връща `summaryKey` + `summaryParams`, а НЕ готов текст — така
// едно и също съобщение може да се покаже на всеки от поддържаните езици.
// Тук са българските шаблони (source of truth); `tl()` ги превежда runtime като
// останалия администраторски интерфейс.

export const SUMMARY_TEMPLATES = {
  // API
  "api.health.ok": "Услугата отговаря нормално: версия {version}, {procedures} процедури в {countries} държави.",
  "api.health.unreachable": "Здравният endpoint не отговори.",
  "api.health.invalidJson": "Здравният endpoint не върна валиден JSON.",
  "api.health.contentType": "Здравният endpoint върна неочакван тип съдържание.",
  "api.openapi.ok": "Описанието е валидно: {operations} операции, {schemas} схеми.",
  "api.openapi.problems": "Описанието е достъпно, но има {problems} несъответствия.",
  "api.openapi.unreachable": "OpenAPI описанието не е достъпно.",
  "api.openapi.invalidJson": "OpenAPI описанието не е валиден JSON.",
  "api.openapi.routerMatch": "Описани {documented} операции; липсват {missing}, излишни {orphaned}.",
  "api.catalog.ok": "Каталогът е валиден: {entries} записа, {anchors} анкера.",
  "api.catalog.missingRels": "В каталога липсват връзки: {missing}.",
  "api.catalog.unreachable": "API каталогът не е достъпен.",
  "api.catalog.contentType": "Очакван тип {expected}, получен {actual}.",
  "api.catalog.invalidJson": "Каталогът не е валиден JSON.",
  "api.catalog.noLinkset": "Каталогът няма масив linkset.",
  "api.catalog.headOk": "HEAD връща правилните заглавки без тяло.",
  "api.catalog.headStatus": "HEAD заявката върна неочакван статус.",
  "api.catalog.headContentType": "HEAD връща различен тип съдържание от GET.",
  "api.catalog.targetsOk": "Всички {checked} връзки от каталога отговарят.",
  "api.catalog.brokenTargets": "{broken} от {checked} връзки в каталога не отговарят.",
  "api.docs.ok": "Документацията е достъпна като HTML и markdown.",
  "api.docs.unreachable": "Документацията не е достъпна.",
  "api.cors.ok": "CORS е разрешен за машинно четимите ресурси ({withCors} от {total}).",
  "api.cors.partial": "CORS липсва при {total} проверени ресурса минус {withCors}.",
  "api.endpoint.ok": "{path} отговори за {ms} ms.",
  "api.endpoint.problems": "{path} отговори с несъответствия.",
  "api.endpoint.noProbe": "Този маршрут няма безопасна проба.",
  "api.private.protected": "Всички {checked} вътрешни маршрута искат вход.",
  "api.private.exposed": "{exposed} вътрешни маршрута отговарят без вход.",

  // OAuth
  "oauth.metadata": "Издател {issuer}; {problems} несъответствия.",
  "oauth.openid": "OpenID конфигурация от {issuer}; {problems} несъответствия.",
  "oauth.protectedResource": "Метаданни на ресурса; {problems} несъответствия.",
  "oauth.jwks": "Публикувани {keys} публични ключа.",
  "agentAuth.block": "Блокът agent_auth описва {methods} начина за регистрация; {problems} несъответствия.",
  "agentAuth.absent": "В метаданните липсва блокът agent_auth.",
  "authMd.ok": "auth.md е публикуван: {bytes} байта, {problems} несъответствия.",
  "authMd.absent": "auth.md не е публикуван на адрес /auth.md.",
  "oauth.unreachable": "Документът с метаданни не е достъпен.",
  "oauth.invalidJson": "Документът с метаданни не е валиден JSON.",

  // Агенти
  "agents.link.ok": "Открити {relations} релации в Link заглавката.",
  "agents.link.missing": "Липсват релации: {missing}.",
  "agents.link.none": "Няма Link заглавки в отговора.",
  "agents.link.targetsOk": "Всички {checked} цели отговарят с очаквания тип.",
  "agents.link.broken": "{broken} от {checked} цели не отговарят.",
  "agents.link.typeMismatch": "{mismatched} цели връщат различен тип от обявения.",
  "agents.markdown.ok": "{path} връща markdown ({tokens} токена).",
  "agents.markdown.problems": "{path} има проблеми с markdown договарянето.",
  "agents.htmlDefault.ok": "Браузърските заявки получават HTML при всички {checked} страници.",
  "agents.htmlDefault.broken": "{broken} страници връщат грешен тип за браузър.",
  "agents.llms.ok": "llms.txt е наличен с {links} връзки.",
  "agentIndex.ok": "Агентският индекс изброява {services} услуги; {problems} несъответствия.",
  "agentIndex.absent": "Агентският индекс не е публикуван на /.well-known/agent-index.json.",
  "agentIndex.invalidJson": "Агентският индекс не е валиден JSON.",
  "dnsAid.ok": "DNS-AID: {records} SVCB записа, {problems} несъответствия.",
  "dnsAid.absent": "Няма SVCB запис на _index._agents за този домейн.",
  "dnsAid.resolverUnreachable": "DNS резолверът не отговори — проверката не е направена.",
  "dnsAid.notPublic": "Домейнът не е публичен — DNS проверката не важи.",
  "skills.ok": "Публикувани {skills} skill-а за агенти; {problems} несъответствия.",
  "skills.absent": "Индексът на skill-овете не е публикуван.",
  "skills.invalidJson": "Индексът на skill-овете не е валиден JSON.",
  "skills.noArray": "Индексът няма масив skills.",
  "agents.llms.absent": "llms.txt не е публикуван.",
  "agents.llms.unreachable": "llms.txt не отговори.",

  // Sitemap
  "sitemap.ok": "Sitemap е валиден с {total} адреса.",
  "sitemap.problems": "Sitemap съдържа {total} адреса и {problems} проблема.",
  "sitemap.unreachable": "Sitemap не е достъпен.",
  "sitemap.xsl.ok": "XSL изгледът е наличен.",
  "sitemap.xsl.missing": "XSL изгледът липсва.",
  "sitemap.coverage.ok": "Всички {total} процедури от базата са в sitemap.",
  "sitemap.coverage.missing": "{missing} от {total} процедури липсват в sitemap.",

  // robots
  "robots.ok": "robots.txt е валиден: {groups} групи, {sitemaps} sitemap препратки.",
  "robots.problems": "robots.txt има несъответствия.",
  "robots.unreachable": "robots.txt не е достъпен.",
  "robots.policyOk": "Политиката е коректна за {crawlers} обхождащи агента.",
  "robots.blocksPublic": "{blocking} агента са блокирани за публично съдържание.",
  "robots.exposesPrivate": "Частни маршрути не са забранени за всички агенти.",
  "robots.contentSignal": "Декларирани Content Signals в {groups} групи.",
  "robots.noContentSignal": "Няма декларирани Content Signals.",

  // Метаданни и SEO
  "metadata.ok": "{path} има пълни метаданни.",
  "metadata.problems": "{path} има {problems} проблема с метаданните.",
  "metadata.unreachable": "Страницата не е достъпна.",
  "metadata.uniqueTitles": "Всички {checked} заглавия са уникални.",
  "metadata.duplicateTitles": "{duplicates} повтарящи се заглавия сред {checked} страници.",
  "metadata.noSamples": "Няма процедури за проверка.",
  "structured.ok": "{path}: {blocks} валидни JSON-LD блока.",
  "structured.problems": "{path}: {problems} блока с проблеми.",
  "structured.none": "{path} няма структурирани данни.",
  "social.ok": "{path} има пълни социални метаданни.",
  "social.problems": "{path}: липсват {problems} социални полета.",
  "social.image": "Изображението за споделяне е {bytes} байта.",
  "social.noImage": "Няма og:image.",
  "hreflang.ok": "{path}: {count} езикови алтернативи.",
  "hreflang.problems": "{path}: проблеми с езиковите алтернативи.",
  "hreflang.none": "Няма hreflang връзки.",
  "hreflang.targetsOk": "Всички {checked} езикови цели отговарят реципрочно.",
  "hreflang.broken": "{broken} от {checked} езикови цели не отговарят.",
  "hreflang.noReciprocal": "Част от езиковите цели не сочат обратно.",
  "hreflang.localeOk": "Всички {locales} езикови страници връщат правилен език.",
  "hreflang.localeMissing": "Липсват езикови страници.",
  "hreflang.langMismatch": "{mismatched} езикови страници имат несъответстващ html lang.",
  "canonical.ok": "Каноничните адреси на {checked} страници сочат към продукцията.",
  "canonical.wrongHost": "{bad} страници имат каноничен адрес към друг хост.",
  "performance.measured": "Измерени {pages} страници; {slow} бавни отговора.",

  // Процедури
  "procedures.ok": "{total} процедури без структурни проблеми.",
  "procedures.problems": "{total} процедури, {problems} вида проблеми.",
  "procedures.complete": "Процедурата излага всички машинно четими полета.",
  "procedures.missingFields": "Липсват {missing} полета за агенти.",
  "procedures.noMarkdown": "Процедурата няма markdown представяне.",
  "procedures.noDatabase": "Няма достъп до базата.",
  "procedures.noSamples": "Няма процедури с обявен изходен език.",
  "procedures.langOk": "Всички {checked} проверени страници обявяват езика на източника.",
  "procedures.langMismatch": "{wrong} от {checked} страници обявяват грешен език.",

  // Служебни
  "check.unknown": "Непозната проверка.",
  "check.exception": "Проверката прекъсна: {message}",
  "check.stopped": "Проверката е спряна от администратор.",
  "api.private.checked": "Проверени вътрешни маршрути.",
};

/**
 * Превежда резултат в четим текст. `tl` е функцията за превод на админ панела —
 * така текстът следва езика на интерфейса, а не е закован на български.
 */
export function summaryText(res, tl) {
  if (!res) return "—";
  const template = SUMMARY_TEMPLATES[res.summaryKey];
  if (!template) return res.summaryKey || "—";
  const translated = tl(template);
  const params = res.summaryParams || {};
  // Търсенето е и без оглед на регистъра — преводачът може да върне {Total}.
  const lower = new Map(Object.entries(params).map(([k, v]) => [k.toLowerCase(), v]));
  return String(translated).replace(/\{(\w+)\}/g, (m, k) => {
    const v = params[k] != null ? params[k] : lower.get(k.toLowerCase());
    return v == null ? "—" : String(v);
  });
}

/** Всички шаблони — подават се на batch превода, за да са готови предварително. */
export const SUMMARY_LABELS = Object.values(SUMMARY_TEMPLATES);
