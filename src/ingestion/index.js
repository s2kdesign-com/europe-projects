// Регистър на connector-ите по държава. Оркестраторът (бъдещ
// CountrySyncOrchestrator) избира connector по country_code от D1 countries/
// country_sync_state и извиква единния интерфейс.

import { BgConnector } from "./countries/bg/index.js";
import { RoConnector } from "./countries/ro/index.js";

const REGISTRY = {
  BG: BgConnector,
  RO: RoConnector,
  // Останалите държави се добавят по rollout приоритета (виж docs/multi-country-progress.md).
};

export function getConnector(countryCode, sources = []) {
  const Cls = REGISTRY[String(countryCode || "").toUpperCase()];
  return Cls ? new Cls(sources) : null;
}

export function hasConnector(countryCode) {
  return Boolean(REGISTRY[String(countryCode || "").toUpperCase()]);
}

export { CountryConnector } from "./core/CountryConnector.js";
