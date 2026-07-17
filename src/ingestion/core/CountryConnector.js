// Единен интерфейс за всички country connectors + споделени помощни функции.
// Никой connector НЕ преповтаря общата логика — тя живее тук (и в бъдещите
// core модули за http/parse/persist). BG е reference implementation.
//
// Всеки connector връща НОРМАЛИЗИРАН запис (виж normalizeProcedure), готов за
// upsert в D1 `projects` с country_code + source attribution.

/**
 * @typedef {Object} NormalizedProcedure
 * @property {string} country_code          ISO 3166-1 alpha-2 (напр. "RO")
 * @property {string} source_id             id от funding_sources
 * @property {string} source_procedure_id   стабилен id от източника (или fingerprint)
 * @property {string} [source_programme_id]
 * @property {string} name
 * @property {string} [program]
 * @property {string} [status]              нормализиран: open|closing_soon|upcoming|closed
 * @property {string} [deadline]            свободен текст
 * @property {string} [deadline_date]       ISO YYYY-MM-DD
 * @property {string} [budget]
 * @property {string} [eligible]
 * @property {string} official_url
 * @property {string} [managing_authority]
 * @property {string} original_language
 * @property {string[]} [regions]
 * @property {string} [source_published_at]
 * @property {string} [source_updated_at]
 * @property {string} content_hash
 */

export class CountryConnector {
  /** @param {{countryCode:string, sources:Array}} cfg */
  constructor(cfg) {
    if (new.target === CountryConnector) throw new Error("CountryConnector is abstract");
    this.countryCode = cfg.countryCode;
    this.sources = cfg.sources || [];
  }

  // --- Интерфейс, който всеки connector имплементира ---
  async discoverSources() { throw new Error("not_implemented: discoverSources"); }
  async fetchProgrammes() { throw new Error("not_implemented: fetchProgrammes"); }
  async fetchCalls() { throw new Error("not_implemented: fetchCalls"); }
  async fetchProcedureDetails(_ref) { throw new Error("not_implemented: fetchProcedureDetails"); }
  async fetchDocuments(_ref) { throw new Error("not_implemented: fetchDocuments"); }
  normalizeProcedure(_raw) { throw new Error("not_implemented: normalizeProcedure"); }
  mapStatus(_raw) { throw new Error("not_implemented: mapStatus"); }
  mapCandidateTypes(_raw) { return []; }
  mapRegions(_raw) { return []; }
  getOfficialUrl(_raw) { throw new Error("not_implemented: getOfficialUrl"); }
  validateProcedure(p) { return CountryConnector.validate(p); }
  calculateContentHash(p) { return CountryConnector.contentHash(p); }

  // --- Споделени детерминистични помощни функции ---

  // Стабилен fingerprint, когато няма source_procedure_id (НЕ само по заглавие).
  static fingerprint(parts) {
    const s = (Array.isArray(parts) ? parts : [parts]).filter(Boolean).map(String).join("|");
    return CountryConnector.hash(s);
  }

  // Проста, детерминистична 52-битова хеш функция (FNV-1a вариант) → hex.
  static hash(str) {
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    }
    return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  }

  // Хеш върху съдържателните полета (за откриване на реална промяна).
  static contentHash(p) {
    const keys = ["name", "program", "status", "deadline_date", "budget", "eligible", "official_url", "managing_authority"];
    return CountryConnector.hash(keys.map((k) => (p && p[k] != null ? String(p[k]) : "")).join("¦"));
  }

  // ISO дата от разни формати (dd.mm.yyyy, dd/mm/yyyy, yyyy-mm-dd). null при неуспех.
  static toIsoDate(input) {
    if (!input) return null;
    const s = String(input).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(s);
    if (m) { const d = m[1].padStart(2, "0"), mo = m[2].padStart(2, "0"); return `${m[3]}-${mo}-${d}`; }
    return null;
  }

  // Нормализация на статус към нашия речник.
  static normalizeStatus(raw, { map = {} } = {}) {
    const v = String(raw || "").toLowerCase().trim();
    if (map[v]) return map[v];
    if (/(open|deschis|active|активн|otvor)/.test(v)) return "open";
    if (/(clos.*soon|expir|изтича|se inchide)/.test(v)) return "closing_soon";
    if (/(upcoming|planned|предстоящ|viitor)/.test(v)) return "upcoming";
    if (/(closed|inchis|приключ|finaliz)/.test(v)) return "closed";
    return "upcoming";
  }

  // Минимална валидация преди upsert (QA gate). Връща {ok, flags[]}.
  static validate(p) {
    const flags = [];
    if (!p || !p.name || !String(p.name).trim()) flags.push("missing_name");
    if (!p || !p.country_code) flags.push("missing_country_code");
    if (!p || !p.official_url) flags.push("missing_official_url");
    if (!p || !p.source_id) flags.push("missing_source_id");
    if (!p || !p.source_procedure_id) flags.push("missing_source_procedure_id");
    if (p && p.deadline_date && !/^\d{4}-\d{2}-\d{2}$/.test(p.deadline_date)) flags.push("bad_deadline_date");
    return { ok: flags.length === 0, flags };
  }
}
