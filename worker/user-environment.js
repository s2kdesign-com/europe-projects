import { normalizeCountry } from "../app/lib/country/countries.js";
import { LOCALE_CODES } from "../app/lib/i18n/locales.js";
import { nowISO } from "./util.js";

// Observations never change the user's manual country/language preferences.
export function automaticPreferences(body, request) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "invalid_body" };
  const value = {};
  if (body.automaticCountry !== undefined) {
    const country = normalizeCountry(body.automaticCountry);
    if (!country || !["cloudflare", "browser_locale", "fallback"].includes(body.automaticCountrySource)) return { error: "invalid_automatic_country" };
    const edgeCountry = normalizeCountry(request.cf?.country);
    value.country = edgeCountry || country;
    value.countrySource = edgeCountry ? "cloudflare" : body.automaticCountrySource;
  }
  if (body.automaticLanguage !== undefined) {
    if (!LOCALE_CODES.includes(body.automaticLanguage) || !["browser_locale", "fallback"].includes(body.automaticLanguageSource)) return { error: "invalid_automatic_language" };
    value.language = body.automaticLanguage;
    value.languageSource = body.automaticLanguageSource;
  }
  return value;
}

export async function recordAutomaticPreferences(env, userId, value) {
  if (!value.country && !value.language) return;
  const now = nowISO(), cutoff = new Date(Date.parse(now) - 60_000).toISOString();
  await env.DB.prepare(`UPDATE users SET
    automatic_country=COALESCE(?1,automatic_country),
    automatic_country_source=COALESCE(?2,automatic_country_source),
    automatic_country_at=CASE WHEN ?1 IS NOT NULL THEN ?5 ELSE automatic_country_at END,
    automatic_language=COALESCE(?3,automatic_language),
    automatic_language_source=COALESCE(?4,automatic_language_source),
    automatic_language_at=CASE WHEN ?3 IS NOT NULL THEN ?5 ELSE automatic_language_at END
    WHERE id=?6 AND (
      (?1 IS NOT NULL AND (automatic_country IS NOT ?1 OR automatic_country_source IS NOT ?2 OR automatic_country_at IS NULL OR automatic_country_at<=?7)) OR
      (?3 IS NOT NULL AND (automatic_language IS NOT ?3 OR automatic_language_source IS NOT ?4 OR automatic_language_at IS NULL OR automatic_language_at<=?7)))`)
    .bind(value.country || null, value.countrySource || null, value.language || null, value.languageSource || null, now, userId, cutoff).run();
}
