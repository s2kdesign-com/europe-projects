// Чиста логика за индексиране на резултатите от одита — без JSX, за да може
// да се тества директно с node (виж test/discovery.test.mjs).

/**
 * Индексира резултатите по код за бърз достъп от обобщаващите карти.
 *
 * Кодовете имат две форми: прости („seo.sitemap") и с ресурс
 * („seo.metadata:/procedures"). Картите питат или за конкретен код, или за
 * шаблон със звезда („seo.metadata:*"), който покрива всички ресурси.
 */
export function indexChecks(checks) {
  const byCode = new Map();
  const byPrefix = new Map();
  for (const c of checks || []) {
    byCode.set(c.code, c);
    const prefix = c.code.split(":")[0];
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(c);
  }
  // Ключът в byPrefix е частта ПРЕДИ двоеточието („seo.metadata"), затова
  // шаблонът „seo.metadata:*" трябва да загуби и звездата, И двоеточието.
  // Без това всяка карта с шаблон оставаше вечно на „Няма валидация“.
  const expand = (pattern) => (pattern.endsWith("*")
    ? byPrefix.get(pattern.slice(0, -1).replace(/:$/, "")) || []
    : [byCode.get(pattern)].filter(Boolean));
  const collect = (codes) => codes.flatMap(expand);
  // ISO 8601 се сортира коректно като текст.
  const newest = (list) => list
    .map((x) => x && x.completedAt).filter(Boolean)
    .sort().slice(-1)[0] || null;

  return {
    get: (code) => byCode.get(code) || null,
    all: (prefix) => byPrefix.get(prefix) || [],
    status: (code) => (byCode.get(code) || {}).status || "unknown",
    /** Кога Е БИЛА проверена точно тази карта — не кога е бил последният одит. */
    checkedAt: (...codes) => newest(collect(codes)),
    /** Най-лошият статус измежду няколко проверки — за обобщаващите карти. */
    rollup: (codes) => {
      const list = collect(codes);
      if (!list.length) return "unknown";
      if (list.some((x) => x.status === "failed")) return "failed";
      if (list.some((x) => x.status === "warning")) return "warning";
      if (list.every((x) => x.status === "not_applicable")) return "not_applicable";
      return "passed";
    },
  };
}
