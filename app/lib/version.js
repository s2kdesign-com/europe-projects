// Единен източник за версия и ключове (localStorage) — без дублиране в компонентите.
export const APP_VERSION = "2.3.0";
export const APP_VERSION_LABEL = "Версия " + APP_VERSION;

// Versioned ключове — при съществена промяна вдигни числото, за да се покаже пак.
export const SYSTEM_INTRO_KEY = "evroproekti_system_intro_v1";
export const CONSENT_KEY = "evroproekti_cookie_consent_v1";
export const CHANGELOG_SEEN_KEY = "evroproekti_changelog_seen_v1";
export const CONSENT_VERSION = 1;
export const INTRO_DELAY_MS = 5000;

// Config placeholders за юридическите текстове — попълни реалните данни тук.
export const LEGAL = {
  COMPANY_LEGAL_NAME: "[COMPANY_LEGAL_NAME]",
  COMPANY_ADDRESS: "[COMPANY_ADDRESS]",
  PRIVACY_CONTACT_EMAIL: "[PRIVACY_CONTACT_EMAIL]",
  DATA_RETENTION_PERIOD: "[DATA_RETENTION_PERIOD]",
};

export const DATA_SOURCES_TEXT = "eufunds.bg, esf.bg, az.government.bg и ПКИП";
