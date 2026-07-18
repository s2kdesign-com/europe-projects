// Единен източник за версия и ключове (localStorage) — без дублиране в компонентите.
export const APP_VERSION = "2.26.2";
export const APP_VERSION_LABEL = "Версия " + APP_VERSION;

// Versioned ключове — при съществена промяна вдигни числото, за да се покаже пак.
export const SYSTEM_INTRO_KEY = "evroproekti_system_intro_v1";
export const CONSENT_KEY = "evroproekti_cookie_consent_v1";
export const CHANGELOG_SEEN_KEY = "evroproekti_changelog_seen_v1";
export const CONSENT_VERSION = 1;
export const INTRO_DELAY_MS = 5000;

// Известяване за нова версия (виж useAppUpdate / AppUpdateNotification).
export const UPDATE_POLL_MS = 5 * 60 * 1000;          // проверка на всеки 5 минути
export const UPDATE_SNOOZE_MS = 15 * 60 * 1000;       // „По-късно" → пак след 15 мин
export const UPDATE_MAX_DISMISS = 3;                  // след 3 затваряния — до следващо зареждане
export const UPDATE_SNOOZE_PREFIX = "evroproekti_update_snooze_"; // + buildId (sessionStorage)
export const UPDATE_DISMISS_COUNT_KEY = "evroproekti_update_dismisscount"; // sessionStorage (per buildId)

// Реалните фирмени данни живеят в app/lib/company.js. LEGAL се запазва за
// съвместимост и препраща към централната конфигурация (без placeholder-и).
import { COMPANY } from "./company.js";
export const LEGAL = {
  COMPANY_LEGAL_NAME: COMPANY.legalName,
  COMPANY_ADDRESS: COMPANY.address,
  PRIVACY_CONTACT_EMAIL: COMPANY.email,
  DATA_RETENTION_PERIOD: COMPANY.logRetention,
};

export const DATA_SOURCES_TEXT = "eufunds.bg, esf.bg, az.government.bg и ПКИП";
