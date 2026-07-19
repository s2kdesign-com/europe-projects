"use client";

// Продуктовото лого със знамето на избраната държава като фон. Преди потвърдена
// държава — сегашният син фон. След потвърждение — знамето като cover фон, като
// символът на Euro-Funding остава ясно видим (overlay за контраст). Знамето е
// декоративно (aria-hidden); достъпното име остава „Euro-Funding".

import Icon from "../Icon.jsx";
import { useCountry } from "./CountryProvider.jsx";

export default function CountryLogoMark({ size = 20 }) {
  const { country, isCountryConfirmed } = useCountry();
  const flagged = Boolean(isCountryConfirmed && country && country.flag);
  return (
    <span className="brand-mark country-logo-mark" data-country={country ? country.code : ""} data-flagged={flagged ? "1" : "0"}>
      {flagged && (
        <span className="country-flag-background" aria-hidden="true" style={{ backgroundImage: `url(${country.flag})` }} />
      )}
      <span className="country-logo-overlay" aria-hidden="true" />
      <Icon name="euro" size={size} />
    </span>
  );
}
