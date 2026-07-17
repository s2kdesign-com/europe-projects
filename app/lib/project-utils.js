// Чисти помощни функции (без React) — лесни за тестване и споделени между
// клиента, worker-а и unit тестовете. Нищо тук не пипа DOM или мрежата.

import {
  STATUS,
  STATUS_LIST,
  DEADLINE_WINDOWS,
  DEFAULT_SORT,
  DEFAULT_VIEW,
  DEFAULT_TAB,
  DEFAULT_PERIOD,
  PERIOD_KEYS,
  DEFAULT_ACTIVITY_PERIOD,
  ACTIVITY_PERIOD_KEYS,
} from "./constants.js";

// ---------------------------------------------------------------------------
// Дати и срокове
// ---------------------------------------------------------------------------

/** Разбор на ISO дата (YYYY-MM-DD). Връща Date в края на деня или null. */
export function parseDeadline(deadlineDate) {
  if (!deadlineDate || typeof deadlineDate !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadlineDate.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59, 999);
  if (Number.isNaN(date.getTime())) return null;
  // Пази срещу невалидни дати като 2026-02-31 (JS би „преляла" в март).
  if (date.getMonth() !== Number(mo) - 1) return null;
  return date;
}

/** Брой цели дни до крайния срок спрямо `now`. null при липсваща/невалидна дата. */
export function daysLeft(deadlineDate, now = new Date()) {
  const d = parseDeadline(deadlineDate);
  if (!d) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((end - start) / 86400000);
}

/** Човешки етикет за отброяване. */
export function countdownLabel(days) {
  if (days == null) return "";
  if (days < 0) return "срокът изтече";
  if (days === 0) return "днес";
  if (days === 1) return "остава 1 ден";
  return `остават ${days} дни`;
}

/** Форматиране на дата на български. Пази оригинала при невалидни стойности. */
export function formatDate(dateStr) {
  const d = parseDeadline(dateStr);
  if (!d) return dateStr || "";
  return d.toLocaleDateString("bg-BG", { day: "2-digit", month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Производни характеристики (без да променяме суровите данни)
// ---------------------------------------------------------------------------

/** Целева група/аудитория — извлича се от category, БЕЗ да смесва новостта. */
export function targetGroup(project) {
  return project && project.category === "youth" ? "youth" : "general";
}

/** Новост/промяна — отделно от аудиторията. Ползва is_new и историческото category. */
export function isNovel(project) {
  if (!project) return false;
  return Boolean(project.is_new) || project.category === "new";
}

export function statusMeta(status) {
  return STATUS[status] || STATUS.upcoming;
}

/** Има ли процедурата документи (за компактния изглед доверяваме на doc_count). */
export function hasDocuments(project) {
  if (!project) return false;
  if (typeof project.doc_count === "number") return project.doc_count > 0;
  if (typeof project.has_documents === "boolean") return project.has_documents;
  return Array.isArray(project.documents) && project.documents.length > 0;
}

// ---------------------------------------------------------------------------
// Търсене
// ---------------------------------------------------------------------------

/** Нормализация за търсене: без диакритики, малки букви, изчистени интервали. */
export function normalizeText(s) {
  return (s || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesQuery(project, query) {
  const q = normalizeText(query);
  if (!q) return true;
  const hay = normalizeText(
    [project.name, project.program, project.priority, project.eligible, project.notes, project.budget]
      .filter(Boolean)
      .join(" ")
  );
  // Всяка дума от заявката трябва да присъства (AND).
  return q.split(/\s+/).every((word) => hay.includes(word));
}

// ---------------------------------------------------------------------------
// Филтриране
// ---------------------------------------------------------------------------

export const EMPTY_FILTERS = Object.freeze({
  q: "",
  status: [],
  program: [],
  target: [],
  deadline: [],
  docs: false,
  sort: DEFAULT_SORT,
  view: DEFAULT_VIEW,
  tab: DEFAULT_TAB,
  period: DEFAULT_PERIOD,
  activityPeriod: DEFAULT_ACTIVITY_PERIOD,
  // Филтър по седмица от диаграмата „Активност на процедурите" (клик по колона).
  changeType: "", // "new" | "changed" | ""
  weekFrom: "", // ISO YYYY-MM-DD (включително)
  weekTo: "", // ISO YYYY-MM-DD (включително)
  selected: null,
  compare: [],
});

/** Нормализира стойност на период до валиден ключ (30/60/90), иначе 30. */
export function normalizePeriod(v) {
  return PERIOD_KEYS.includes(v) ? v : DEFAULT_PERIOD;
}

/** Нормализира периода на „Активност" до валиден ключ (30/60/90), иначе 90. */
export function normalizeActivityPeriod(v) {
  return ACTIVITY_PERIOD_KEYS.includes(v) ? v : DEFAULT_ACTIVITY_PERIOD;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function inIsoRange(dateStr, from, to) {
  if (!dateStr || !ISO_DATE.test(String(dateStr).slice(0, 10))) return false;
  const d = String(dateStr).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function matchesDeadlineWindows(project, windows, now) {
  if (!windows || windows.length === 0) return true;
  const dl = daysLeft(project.deadline_date, now);
  return windows.some((key) => {
    const w = DEADLINE_WINDOWS.find((x) => x.key === key);
    if (!w) return false;
    if (w.days == null) return dl == null; // „без обявен срок"
    return dl != null && dl >= 0 && dl <= w.days;
  });
}

// Филтър по седмица + тип промяна (от клик върху „Активност на процедурите").
// „new" → first_seen в диапазона; „changed" → last_updated в диапазона и различно
// от first_seen. Празен changeType → без филтър.
function matchesChangeWeek(p, f) {
  if (!f.changeType) return true;
  if (f.changeType === "new") return inIsoRange(p.first_seen, f.weekFrom, f.weekTo);
  if (f.changeType === "changed") {
    return p.last_updated && p.first_seen && p.last_updated !== p.first_seen && inIsoRange(p.last_updated, f.weekFrom, f.weekTo);
  }
  return true;
}

/** Прилага всички филтри. Не мутира входа. */
export function filterProjects(projects, filters = EMPTY_FILTERS, now = new Date()) {
  const f = { ...EMPTY_FILTERS, ...filters };
  return (projects || []).filter((p) => {
    if (f.status.length && !f.status.includes(p.status)) return false;
    if (f.program.length && !f.program.includes(p.program)) return false;
    if (f.target.length && !f.target.includes(targetGroup(p))) return false;
    if (f.docs && !hasDocuments(p)) return false;
    if (!matchesDeadlineWindows(p, f.deadline, now)) return false;
    if (!matchesQuery(p, f.q)) return false;
    if (!matchesChangeWeek(p, f)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Сортиране
// ---------------------------------------------------------------------------

const collator = new Intl.Collator("bg", { sensitivity: "base", numeric: true });

/**
 * „Спешен срок": валиден бъдещ срок първо (най-близкият най-отгоре),
 * после изтекли, накрая липсващи срокове.
 */
export function compareUrgent(a, b, now = new Date()) {
  const da = daysLeft(a.deadline_date, now);
  const db = daysLeft(b.deadline_date, now);
  const rank = (d) => (d == null ? 2 : d >= 0 ? 0 : 1);
  const ra = rank(da);
  const rb = rank(db);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return da - db; // най-близкият бъдещ срок първо
  if (ra === 1) return db - da; // наскоро изтеклите първо
  return collator.compare(a.name || "", b.name || "");
}

export function sortProjects(projects, sort = DEFAULT_SORT, now = new Date()) {
  const arr = [...(projects || [])];
  if (sort === "updated") {
    arr.sort(
      (a, b) =>
        String(b.last_updated || "").localeCompare(String(a.last_updated || "")) ||
        collator.compare(a.name || "", b.name || "")
    );
  } else if (sort === "title") {
    arr.sort((a, b) => collator.compare(a.name || "", b.name || ""));
  } else {
    arr.sort((a, b) => compareUrgent(a, b, now));
  }
  return arr;
}

/** Групиране по програма, като всяка група е сортирана по избрания критерий. */
export function groupByProgram(projects, sort = DEFAULT_SORT, now = new Date()) {
  const map = new Map();
  for (const p of projects) {
    const key = p.program || "Други";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  const groups = [...map.entries()].map(([program, items]) => [program, sortProjects(items, sort, now)]);
  // Групите се подреждат по най-спешния елемент в тях.
  groups.sort((a, b) => {
    const na = firstUrgentDays(a[1], now);
    const nb = firstUrgentDays(b[1], now);
    return na - nb;
  });
  return groups;
}

function firstUrgentDays(items, now) {
  let best = Infinity;
  for (const p of items) {
    const d = daysLeft(p.deadline_date, now);
    if (d != null && d >= 0) best = Math.min(best, d);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Синхронизация с URL (URLSearchParams)
// ---------------------------------------------------------------------------

const CSV_KEYS = ["status", "program", "target", "deadline", "compare"];

/** Състояние на филтрите -> URLSearchParams (записваме само не-подразбиращите се). */
export function serializeFilters(filters) {
  const f = { ...EMPTY_FILTERS, ...filters };
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  for (const key of CSV_KEYS) {
    if (Array.isArray(f[key]) && f[key].length) p.set(key, f[key].join(","));
  }
  if (f.docs) p.set("docs", "1");
  if (f.sort && f.sort !== EMPTY_FILTERS.sort) p.set("sort", f.sort);
  if (f.view && f.view !== EMPTY_FILTERS.view) p.set("view", f.view);
  if (f.tab && f.tab !== EMPTY_FILTERS.tab) p.set("tab", f.tab);
  // Периодът за „Какво е ново" се записва винаги, за да е споделяемо/възстановимо
  // (напр. ?tab=overview&period=30).
  p.set("period", normalizePeriod(f.period));
  p.set("activityPeriod", normalizeActivityPeriod(f.activityPeriod));
  // Филтър по седмица от диаграмата — само когато е активен.
  if (f.changeType === "new" || f.changeType === "changed") {
    p.set("changeType", f.changeType);
    if (f.weekFrom) p.set("weekFrom", f.weekFrom);
    if (f.weekTo) p.set("weekTo", f.weekTo);
  }
  if (f.selected) p.set("id", f.selected);
  return p.toString();
}

/** URLSearchParams (string или обект) -> състояние на филтрите. */
export function deserializeFilters(search) {
  const p = typeof search === "string" ? new URLSearchParams(search) : search || new URLSearchParams();
  const splitCsv = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
  return {
    ...EMPTY_FILTERS,
    q: p.get("q") || "",
    status: splitCsv(p.get("status")),
    program: splitCsv(p.get("program")),
    target: splitCsv(p.get("target")),
    deadline: splitCsv(p.get("deadline")),
    compare: splitCsv(p.get("compare")).slice(0, 3),
    docs: p.get("docs") === "1",
    sort: p.get("sort") || EMPTY_FILTERS.sort,
    view: p.get("view") || EMPTY_FILTERS.view,
    tab: p.get("tab") || EMPTY_FILTERS.tab,
    period: normalizePeriod(p.get("period")),
    activityPeriod: normalizeActivityPeriod(p.get("activityPeriod")),
    changeType: p.get("changeType") === "new" || p.get("changeType") === "changed" ? p.get("changeType") : "",
    weekFrom: ISO_DATE.test(p.get("weekFrom") || "") ? p.get("weekFrom") : "",
    weekTo: ISO_DATE.test(p.get("weekTo") || "") ? p.get("weekTo") : "",
    selected: p.get("id") || null,
  };
}

/** Брой активни филтри (за чипове и „Изчисти всички"). */
export function activeFilterCount(filters) {
  const f = { ...EMPTY_FILTERS, ...filters };
  let n = 0;
  if (f.q) n++;
  for (const key of ["status", "program", "target", "deadline"]) n += f[key].length;
  if (f.docs) n++;
  if (f.changeType === "new" || f.changeType === "changed") n++;
  return n;
}

export function buildShareUrl(origin, pathname, filters) {
  const qs = serializeFilters(filters);
  return `${origin}${pathname}${qs ? "?" + qs : ""}`;
}

// ---------------------------------------------------------------------------
// ICS (календарни файлове с крайни срокове)
// ---------------------------------------------------------------------------

/** Екранира текст според RFC 5545. */
export function escapeICS(text) {
  return String(text == null ? "" : text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Сгъва редове до 75 октета според RFC 5545. */
export function foldICSLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  let out = "";
  let cur = "";
  for (const ch of line) {
    const next = cur + ch;
    // 74, за да остане място за водещия интервал на продължението.
    if (enc.encode(next).length > 74) {
      out += (out ? "\r\n " : "") + cur;
      cur = ch;
    } else {
      cur = next;
    }
  }
  out += (out ? "\r\n " : "") + cur;
  return out;
}

function icsDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function icsStamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(
    d.getUTCHours()
  )}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** Генерира валиден .ics за крайния срок на процедура. null ако няма дата. */
export function generateICS(project, now = new Date()) {
  const d = parseDeadline(project.deadline_date);
  if (!d) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 86400000); // all-day, exclusive end
  const uid = `${project.id}@evroproekti.dashboard`;
  const descParts = [
    project.program ? `Програма: ${project.program}` : "",
    project.budget ? `Бюджет: ${project.budget}` : "",
    project.eligible ? `Допустими: ${project.eligible}` : "",
    project.link || "",
  ].filter(Boolean);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Европроекти//Дашборд//BG",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART;VALUE=DATE:${icsDate(start)}`,
    `DTEND;VALUE=DATE:${icsDate(end)}`,
    foldICSLine(`SUMMARY:Краен срок: ${escapeICS(project.name)}`),
    foldICSLine(`DESCRIPTION:${escapeICS(descParts.join("\n"))}`),
    project.link ? foldICSLine(`URL:${escapeICS(project.link)}`) : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// CSV експорт
// ---------------------------------------------------------------------------

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV с BOM за коректни български букви в Excel. */
export function projectsToCSV(projects, now = new Date()) {
  const headers = [
    "Име",
    "Програма",
    "Приоритет",
    "Статус",
    "Срок (текст)",
    "Крайна дата",
    "Дни до срок",
    "Бюджет",
    "Допустими кандидати",
    "Целева група",
    "Ново/променено",
    "Линк",
  ];
  const rows = (projects || []).map((p) => {
    const dl = daysLeft(p.deadline_date, now);
    return [
      p.name,
      p.program,
      p.priority,
      statusMeta(p.status).label,
      p.deadline,
      p.deadline_date,
      dl == null ? "" : dl,
      p.budget,
      p.eligible,
      targetGroup(p) === "youth" ? "Младежка заетост" : "Общи / бизнес",
      isNovel(p) ? "да" : "не",
      p.link,
    ].map(csvCell).join(",");
  });
  return "﻿" + [headers.join(","), ...rows].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Статистики за KPI картите
// ---------------------------------------------------------------------------

export function computeStats(projects, savedCount = 0, now = new Date(), closingSoonDays = 30) {
  let open = 0;
  let closingWindow = 0;
  let novel = 0;
  for (const p of projects || []) {
    const isOpen = p.status === "open" || p.status === "closing_soon";
    if (isOpen) open++;
    if (isOpen) {
      const dl = daysLeft(p.deadline_date, now);
      if (dl != null && dl >= 0 && dl <= closingSoonDays) closingWindow++;
    }
    if (isNovel(p)) novel++;
  }
  return { open, closingWindow, novel, saved: savedCount, total: (projects || []).length };
}
