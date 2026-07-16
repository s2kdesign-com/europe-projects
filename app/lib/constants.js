// Централни константи и метаданни за дашборда.

export const STATUS = {
  open: { key: "open", label: "Отворена", short: "Отворена", tone: "green", order: 0 },
  closing_soon: { key: "closing_soon", label: "Изтича скоро", short: "Изтича скоро", tone: "amber", order: 1 },
  upcoming: { key: "upcoming", label: "Предстояща", short: "Предстояща", tone: "blue", order: 2 },
  closed: { key: "closed", label: "Приключена", short: "Приключена", tone: "neutral", order: 3 },
};
export const STATUS_LIST = Object.values(STATUS);

export const TARGET_GROUP = {
  youth: { key: "youth", label: "Младежка заетост" },
  general: { key: "general", label: "Общи / бизнес" },
};
export const TARGET_GROUP_LIST = Object.values(TARGET_GROUP);

export const DEADLINE_WINDOWS = [
  { key: "7", label: "До 7 дни", days: 7 },
  { key: "30", label: "До 30 дни", days: 30 },
  { key: "90", label: "До 90 дни", days: 90 },
  { key: "none", label: "Без обявен срок", days: null },
];

export const SORT_OPTIONS = [
  { key: "urgent", label: "Спешен срок" },
  { key: "updated", label: "Последно обновени" },
  { key: "title", label: "Заглавие (А–Я)" },
];
export const DEFAULT_SORT = "urgent";

export const VIEWS = [
  { key: "cards", label: "Карти" },
  { key: "list", label: "Списък" },
  { key: "program", label: "По програма" },
];
export const DEFAULT_VIEW = "cards";

export const TABS = [
  { key: "overview", label: "Обзор" },
  { key: "procedures", label: "Процедури" },
  { key: "calendar", label: "Календар" },
  { key: "saved", label: "Запазени" },
];
export const DEFAULT_TAB = "overview";

export const CLOSING_SOON_DAYS = 30;
export const URGENT_DAYS = 14;
export const NEW_WINDOW_DAYS = 7; // „ново/променено тази седмица"
export const MAX_COMPARE = 3;

// Периоди за секцията „Какво е ново" (промени през последните N дни).
export const PERIODS = [
  { key: "30", label: "30 дни", days: 30 },
  { key: "60", label: "60 дни", days: 60 },
  { key: "90", label: "90 дни", days: 90 },
];
export const DEFAULT_PERIOD = "30";
export const PERIOD_KEYS = PERIODS.map((p) => p.key);

// Кофи по спешност за наближаващите срокове.
export const URGENCY_BUCKETS = [
  { key: "overdue", label: "Изтекли", max: -1 },
  { key: "3", label: "До 3 дни", max: 3 },
  { key: "7", label: "До 7 дни", max: 7 },
  { key: "14", label: "До 14 дни", max: 14 },
  { key: "30", label: "До 30 дни", max: 30 },
];

// localStorage ключове.
export const LS_SAVED = "evroproekti:saved:v1";
export const LS_VIEW = "evroproekti:view:v1";
export const LS_PROFILE = "evroproekti:profile:v1";
export const LS_LAST_VISIT = "evroproekti:lastVisit:v1";

// Профил (за препоръки/филтриране). Ползваме само полета, които реално
// съществуват в данните — програма и целева група. Без бюджет/сектор, защото
// тези данни са свободен текст и не са структурирани.
export const PROFILE_DEFAULT = {
  programs: [], // предпочитани програми
  target: "", // "youth" | "general" | ""
  onlyOpen: 