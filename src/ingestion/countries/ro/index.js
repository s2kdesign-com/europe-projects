// RO — Romania connector (scaffold).
//
// Статус: connector_in_progress. Официалните източници са ПРОВЕРЕНИ (виж
// docs/sources/ro.md и D1 funding_sources), но техническият формат още НЕ е
// финализиран: oportunitati-ue.gov.ro връща празно на суров fetch (client-side
// rendered), а MySMIS отхвърля ботове. Затова fetchCalls още не е имплементиран —
// не измисляме данни и НЕ активираме RO.
//
// Следваща стъпка: потвърди вътрешен JSON/search endpoint зад oportunitati-ue.gov.ro
// (network inspection) или официален open-data канал; ако няма — server-rendered
// алтернатива или browser automation (последна възможност, спазвайки robots/условия).

import { CountryConnector } from "../../core/CountryConnector.js";

const RO_STATUS_MAP = {
  "deschis": "open", "deschisa": "open", "activ": "open",
  "se închide": "closing_soon", "in curand": "upcoming", "viitor": "upcoming",
  "închis": "closed", "inchis": "closed", "finalizat": "closed",
};

export class RoConnector extends CountryConnector {
  constructor(sources = []) { super({ countryCode: "RO", sources }); }

  async discoverSources() {
    // Връща seed-натите официални източници (от D1 funding_sources за RO).
    return this.sources.length ? this.sources : [
      { id: "ro-oportunitati", base_url: "https://oportunitati-ue.gov.ro/", primary_source: 1, requires_javascript: 1 },
      { id: "ro-mfe", base_url: "https://mfe.gov.ro/" },
      { id: "ro-mysmis", base_url: "https://mysmis2021.gov.ro/", requires_javascript: 1 },
    ];
  }

  async fetchProgrammes() {
    // TODO(RO): програмите се публикуват на mfe.gov.ro (напр. /peo-21-27/). Изисква
    // потвърждаване на structured достъп.
    return { pending: true, reason: "format_unconfirmed", source: "ro-mfe" };
  }

  async fetchCalls() {
    // TODO(RO): активните покани са на oportunitati-ue.gov.ro (client-side rendered).
    // Не връщаме данни, докато няма потвърден endpoint/парсер + dry run + QA.
    return { pending: true, reason: "requires_javascript_or_api", source: "ro-oportunitati" };
  }

  async fetchProcedureDetails() { return { pending: true, reason: "format_unconfirmed" }; }
  async fetchDocuments() { return { pending: true, reason: "format_unconfirmed" }; }

  mapStatus(raw) { return CountryConnector.normalizeStatus(raw, { map: RO_STATUS_MAP }); }
  getOfficialUrl(raw) { return (raw && (raw.official_url || raw.url)) || null; }

  // Формата на нормализирания запис е готова; попълва се щом fetchCalls заработи.
  normalizeProcedure(raw) {
    const official_url = this.getOfficialUrl(raw) || "";
    const p = {
      country_code: "RO",
      source_id: raw.source_id || "ro-oportunitati",
      source_procedure_id: raw.source_procedure_id || raw.id || CountryConnector.fingerprint([raw.name, raw.program, official_url]),
      source_programme_id: raw.source_programme_id || null,
      name: raw.name,
      program: raw.program || null,
      status: this.mapStatus(raw.status),
      deadline: raw.deadline || null,
      deadline_date: CountryConnector.toIsoDate(raw.deadline_date || raw.deadline),
      budget: raw.budget || null,
      eligible: raw.eligible || null,
      official_url,
      managing_authority: raw.managing_authority || "Ministerul Investițiilor și Proiectelor Europene (MIPE)",
      original_language: "ro",
      regions: this.mapRegions(raw),
    };
    p.content_hash = this.calculateContentHash(p);
    return p;
  }
}

export default RoConnector;
