// BG — reference connector (stub).
//
// ВАЖНО: реалният BG ingestion в момента се изпълнява ИЗВЪН това репо (Claude
// Scheduled Task пише директно в D1 `projects`). Този stub служи за две неща:
//   1) еталон за интерфейса, който новите държави следват;
//   2) точка за пренасяне на BG ingestion към общия CountrySyncOrchestrator,
//      когато решим да го консолидираме.
//
// Затова fetch* методите тук са маркирани като делегирани към външния pipeline.

import { CountryConnector } from "../../core/CountryConnector.js";

const BG_STATUS_MAP = {
  "отворена": "open", "изтича скоро": "closing_soon", "предстояща": "upcoming", "приключена": "closed",
};

export class BgConnector extends CountryConnector {
  constructor(sources = []) { super({ countryCode: "BG", sources }); }

  async discoverSources() { return this.sources; }

  // BG данните идват от външния Scheduled Task pipeline (eufunds.bg/ИСУН/esf.bg/az).
  async fetchProgrammes() { return { delegated: true, to: "external-scheduled-task" }; }
  async fetchCalls() { return { delegated: true, to: "external-scheduled-task" }; }
  async fetchProcedureDetails() { return { delegated: true, to: "external-scheduled-task" }; }
  async fetchDocuments() { return { delegated: true, to: "external-scheduled-task" }; }

  mapStatus(raw) { return CountryConnector.normalizeStatus(raw, { map: BG_STATUS_MAP }); }
  getOfficialUrl(raw) { return (raw && (raw.link || raw.official_url)) || null; }

  normalizeProcedure(raw) {
    const official_url = this.getOfficialUrl(raw) || "";
    const p = {
      country_code: "BG",
      source_id: raw.source_id || "bg-external",
      source_procedure_id: raw.source_procedure_id || raw.id || CountryConnector.fingerprint([raw.name, raw.program]),
      source_programme_id: raw.source_programme_id || null,
      name: raw.name,
      program: raw.program || null,
      status: this.mapStatus(raw.status),
      deadline: raw.deadline || null,
      deadline_date: CountryConnector.toIsoDate(raw.deadline_date || raw.deadline),
      budget: raw.budget || null,
      eligible: raw.eligible || null,
      official_url,
      managing_authority: raw.managing_authority || null,
      original_language: "bg",
      regions: this.mapRegions(raw),
    };
    p.content_hash = this.calculateContentHash(p);
    return p;
  }
}

export default BgConnector;
