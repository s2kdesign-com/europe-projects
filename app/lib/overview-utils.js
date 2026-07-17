// Чисти помощни функции за началната страница „Обзор".
// Всичко тук се смята от РЕАЛНИ полета. Където данните не стигат (напр. сума на
// бюджета, сектор), НЕ измисляме стойност — връщаме null / „нужна проверка".

import { daysLeft, targetGroup, parseDeadline, intlLocale } from "./project-utils.js";
import { NEW_WINDOW_DAYS, URGENCY_BUCKETS } from "./constants.js";

// Локализирани имена на месеци (Intl). Кеш по локал за производителност.
const _monthCache = {};
function monthNames(style) {
  const loc = intlLocale();
  const ck = loc + ":" + style;
  if (_monthCache[ck]) return _monthCache[ck];
  const fmt = new Intl.DateTimeFormat(loc, { month: style });
  const arr = [];
  for (let m = 0; m < 12; m++) arr.push(fmt.format(new Date(2021, m, 1)));
  _monthCache[ck] = arr;
  return arr;
}

// ---- Новост / промяна (от first_seen / last_updated) ----
export function isNewSince(project, now = new Date(), days = NEW_WINDOW_DAYS) {
  const d = daysAgo(project.first_seen, now);
  return d != null && d <= days;
}
export function isChangedSince(project, now = new Date(), days = NEW_WINDOW_DAYS) {
  const d = daysAgo(project.last_updated, now);
  if (d == null || d > days) return false;
  // промяна = обновено след първото виждане
  return project.last_updated && project.first_seen && project.last_updated !== project.first_seen;
}

function daysAgo(dateStr, now) {
  const d = parseDeadline(dateStr);
  if (!d) return null;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((a - b) / 86400000);
}

// ---- Причини „изисква внимание" (само доказуеми сигнали) ----
export function attentionReasons(p, savedSet, savedMeta, now = new Date()) {
  const reasons = [];
  if (p.status === "closed") return reasons;
  const dl = daysLeft(p.deadline_date, now);
  const open = p.status === "open" || p.status === "closing_soon";

  if (open && dl != null && dl >= 0 && dl <= 3) reasons.push({ type: "expiring", tone: "red", key: "expiringDays", days: dl, label: `Изтича до ${dl} дни` });
  else if (open && dl != null && dl >= 0 && dl <= 7) reasons.push({ type: "expiring", tone: "red", key: "expiring7", label: "Изтича до 7 дни" });
  else if (open && dl != null && dl >= 0 && dl <= 14) reasons.push({ type: "expiring", tone: "amber", key: "expiring14", label: "Изтича до 14 дни" });

  if (isNewSince(p, now)) reasons.push({ type: "new", tone: "violet", key: "newThisWeek", label: "Нова тази седмица" });
  else if (isChangedSince(p, now)) reasons.push({ type: "changed", tone: "blue", key: "updatedThisWeek", label: "Обновена тази седмица" });

  const saved = savedSet && savedSet.has ? savedSet.has(p.id) : Array.isArray(savedSet) && savedSet.includes(p.id);
  if (saved && changedAfterSave(p, savedMeta)) reasons.push({ type: "savedChanged", tone: "amber", key: "savedChanged", label: "Промяна по следена" });

  if (open && (p.doc_count || 0) === 0) reasons.push({ type: "noDocs", tone: "neutral", key: "noDocs", label: "Няма публикувани условия" });

  return reasons;
}

// Промяна след запазване — реално, ако сме записали last_updated към момента на запазване.
export function changedAfterSave(p, savedMeta) {
  if (!savedMeta) return false;
  const at = savedMeta[p.id];
  return Boolean(at && p.last_updated && String(p.last_updated) > String(at));
}

function attentionScore(p, now) {
  const dl = daysLeft(p.deadline_date, now);
  let s = 0;
  if (dl != null && dl >= 0) s += Math.max(0, 40 - dl); // по-близък срок => по-висок скор
  if (isNewSince(p, now)) s += 12;
  if (isChangedSince(p, now)) s += 10;
  if (p.status === "closing_soon") s += 8;
  if (p.status === "open") s += 4;
  return s;
}

export function attentionProjects(projects, savedSet, savedMeta, now = new Date()) {
  return (projects || [])
    .map((p) => ({ p, reasons: attentionReasons(p, savedSet, savedMeta, now) }))
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => {
      const sa = attentionScore(a.p, now);
      const sb = attentionScore(b.p, now);
      if (sb !== sa) return sb - sa;
      const da = daysLeft(a.p.deadline_date, now);
      const db = daysLeft(b.p.deadline_date, now);
      const ra = da == null ? 1e9 : da < 0 ? 1e8 : da;
      const rb = db == null ? 1e9 : db < 0 ? 1e8 : db;
      if (ra !== rb) return ra - rb;
      return String(b.p.last_updated || "").localeCompare(String(a.p.last_updated || ""));
    });
}

// ---- Релевантност спрямо профил (прозрачна логика, само реални полета) ----
export function hasProfile(profile) {
  if (!profile) return false;
  return (profile.programs && profile.programs.length > 0) || Boolean(profile.target) || Boolean(profile.onlyOpen);
}

export function relevance(p, profile) {
  if (!hasProfile(profile)) return null;
  const open = p.status === "open" || p.status === "closing_soon";
  if (profile.onlyOpen && !open) return null;
  let score = 0;
  const reasons = [];
  if (profile.programs && profile.programs.includes(p.program)) {
    score += 50;
    reasons.push("Съответства на предпочитана програма");
  }
  if (profile.target && targetGroup(p) === profile.target) {
    score += 30;
    reasons.push(profile.target === "youth" ? "Насочена към младежка заетост" : "Подходяща за бизнес/общи кандидати");
  }
  if (open) {
    score += 20;
    reasons.push("Отворена за кандидатстване");
  }
  if (score === 0) return null;
  // Достатъчно ли са данните за оценка на съответствието?
  const sufficient = Boolean(p.eligible && p.eligible.trim());
  return { score: Math.min(100, score), reasons, sufficient };
}

export function recommendedProjects(projects, profile, now = new Date(), limit = 6) {
  if (!hasProfile(profile)) return [];
  return (projects || [])
    .map((p) => ({ p, r: relevance(p, profile) }))
    .filter((x) => x.r && x.r.score > 0)
    .sort((a, b) => {
      if (b.r.score !== a.r.score) return b.r.score - a.r.score;
      const da = daysLeft(a.p.deadline_date, now);
      const db = daysLeft(b.p.deadline_date, now);
      const ra = da == null ? 1e9 : da < 0 ? 1e8 : da;
      const rb = db == null ? 1e9 : db < 0 ? 1e8 : db;
      return ra - rb;
    })
    .slice(0, limit);
}

// ---- Поток „Какво е ново" (от first_seen / last_updated) ----
export function changeFeed(projects, now = new Date(), days = 30) {
  const items = [];
  for (const p of projects || []) {
    if (isNewSince(p, now, days)) {
      items.push({ id: p.id + ":new", project: p, type: "new", date: p.first_seen, label: "Нова процедура", tone: "violet", explanation: "Добавена за проследяване." });
    } else if (isChangedSince(p, now, days)) {
      items.push({ id: p.id + ":chg", project: p, type: "changed", date: p.last_updated, label: "Обновена", tone: "blue", explanation: "Обновени данни по процедурата (напр. статус или срок)." });
    }
  }
  return items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

// ---- Кофи по спешност ----
export function urgencyBuckets(projects, now = new Date()) {
  const out = URGENCY_BUCKETS.map((b) => ({ ...b, items: [] }));
  for (const p of projects || []) {
    const dl = daysLeft(p.deadline_date, now);
    if (dl == null) continue;
    if (dl < 0) {
      if (p.status !== "closed") out[0].items.push(p);
      continue;
    }
    for (let i = 1; i < out.length; i++) {
      if (dl <= out[i].max) {
        out[i].items.push(p);
        break;
      }
    }
  }
  for (const b of out) b.items.sort((a, c) => (daysLeft(a.deadline_date, now) - daysLeft(c.deadline_date, now)));
  return out.filter((b) => b.items.length > 0);
}

// Прогрес до крайния срок (реален, от first_seen -> deadline; резервно 90-дн. прозорец).
export function deadlineProgress(p, now = new Date()) {
  const end = parseDeadline(p.deadline_date);
  if (!end) return null;
  const start = parseDeadline(p.first_seen) || new Date(end.getTime() - 90 * 86400000);
  const total = end - start;
  if (total <= 0) return 100;
  const pct = ((now - start) / total) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// ---- Агрегации за диаграми (само реални измерения) ----
export function byProgram(projects) {
  return countBy(projects, (p) => p.program || "Други");
}
export function byStatus(projects) {
  const order = ["open", "closing_soon", "upcoming", "closed"];
  const m = countMap(projects, (p) => p.status);
  return order.filter((k) => m[k]).map((k) => ({ key: k, value: m[k] }));
}
export function byTargetGroup(projects) {
  const m = countMap(projects, (p) => targetGroup(p));
  return [
    { key: "youth", label: "Младежка заетост", value: m.youth || 0 },
    { key: "general", label: "Общи / бизнес", value: m.general || 0 },
  ].filter((x) => x.value > 0);
}
export function deadlinesByMonth(projects, now = new Date(), months = 6) {
  const MONTHS = monthNames("short");
  const buckets = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    buckets.push({ y: d.getFullYear(), m: d.getMonth(), label: MONTHS[d.getMonth()], value: 0 });
  }
  for (const p of projects || []) {
    const d = parseDeadline(p.deadline_date);
    if (!d) continue;
    const b = buckets.find((x) => x.y === d.getFullYear() && x.m === d.getMonth());
    if (b) b.value++;
  }
  return buckets;
}
export function newChangedOverWeeks(projects, now = new Date(), weeks = 6) {
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
    const start = new Date(end.getTime() - 6 * 86400000);
    let nw = 0;
    let ch = 0;
    for (const p of projects || []) {
      const fs = parseDeadline(p.first_seen);
      const lu = parseDeadline(p.last_updated);
      if (fs && fs >= start && fs <= end) nw++;
      else if (lu && lu >= start && lu <= end && p.last_updated !== p.first_seen) ch++;
    }
    out.push({ label: `${end.getDate()}.${end.getMonth() + 1}`, new: nw, changed: ch });
  }
  return out;
}

// ---- „Активност на процедурите" (седмични серии Нови/Актуализирани) ----
// Класификация от РЕАЛНИ полета:
//   • Нова          = first_seen попада в седмицата;
//   • Актуализирана = last_updated попада в седмицата И last_updated ≠ first_seen
//                     И е в различна седмица от first_seen (без двойно броене).
// Седмица = понеделник–неделя (BG locale). Смятат се 2×N седмици, за да имаме и
// непосредствено предходния период за сравнение (тенденция).

const pad2 = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function mondayOf(date) {
  const x = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (x.getDay() + 6) % 7; // понеделник=0 … неделя=6
  x.setDate(x.getDate() - dow);
  return x;
}

// Български етикети за седмичен диапазон (пълен / кратък / за tooltip).
export function formatWeekLabel(start, end) {
  const M = monthNames("long");
  const sd = start.getDate(), ed = end.getDate(), sm = start.getMonth(), em = end.getMonth();
  const sameMonth = sm === em;
  const full = sameMonth ? `${sd}–${ed} ${M[em]}` : `${sd} ${M[sm]}–${ed} ${M[em]}`;
  const short = sameMonth ? `${pad2(sd)}–${pad2(ed)}.${pad2(em + 1)}` : `${pad2(sd)}.${pad2(sm + 1)}–${pad2(ed)}.${pad2(em + 1)}`;
  const tooltip = sameMonth ? `${sd}–${ed} ${M[em]} ${end.getFullYear()}` : `${sd} ${M[sm]} – ${ed} ${M[em]} ${end.getFullYear()}`;
  return { full, short, tooltip };
}

export function weeklyActivity(projects, now = new Date(), periodDays = 90) {
  const N = Math.max(1, Math.ceil(periodDays / 7));
  const curMonday = mondayOf(now);
  const weeks = [];
  for (let i = 2 * N - 1; i >= 0; i--) {
    const start = new Date(curMonday); start.setDate(curMonday.getDate() - i * 7);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const endInclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    weeks.push({ start, end, endInclusive, new: 0, changed: 0 });
  }
  const weekIndex = (d) => weeks.findIndex((w) => d >= w.start && d <= w.endInclusive);

  for (const p of projects || []) {
    const fs = parseDeadline(p.first_seen);
    const lu = parseDeadline(p.last_updated);
    const fi = fs ? weekIndex(fs) : -1;
    if (fi >= 0) weeks[fi].new++;
    const changed = lu && p.last_updated && p.first_seen && p.last_updated !== p.first_seen;
    if (changed) {
      const li = weekIndex(lu);
      if (li >= 0 && li !== fi) weeks[li].changed++; // различна седмица → не двойно броене
    }
  }

  const cur = weeks.slice(N).map((w) => {
    const l = formatWeekLabel(w.start, w.end);
    return { start: isoDate(w.start), end: isoDate(w.end), label: l.full, labelShort: l.short, tooltip: l.tooltip, new: w.new, changed: w.changed, total: w.new + w.changed };
  });
  const prev = weeks.slice(0, N);

  const newTotal = cur.reduce((a, w) => a + w.new, 0);
  const changedTotal = cur.reduce((a, w) => a + w.changed, 0);
  const total = newTotal + changedTotal;
  const prevTotal = prev.reduce((a, w) => a + w.new + w.changed, 0);

  let trend;
  if (total === 0 && prevTotal === 0) trend = { kind: "none" };
  else if (prevTotal === 0) trend = { kind: "nobase" };
  else { const pct = Math.round(((total - prevTotal) / prevTotal) * 100); trend = { kind: pct > 0 ? "up" : pct < 0 ? "down" : "flat", pct }; }

  let mostActive = null;
  for (const w of cur) if (w.total > 0 && (!mostActive || w.total > mostActive.total)) mostActive = w;

  return { weeks: cur, summary: { newTotal, changedTotal, total, prevTotal, trend, weeksCount: N }, mostActive, hasData: total > 0 };
}

// Автоматично текстово заключение (генерирано от данните, без hardcode).
export function activityInsight(a) {
  if (!a || !a.hasData) return "Все още няма достатъчно данни за надеждна тенденция.";
  const parts = [];
  if (a.mostActive) parts.push(`Най-активната седмица е ${a.mostActive.label} с ${a.mostActive.total} нови или актуализирани процедури.`);
  const t = a.summary.trend;
  if (t.kind === "up") parts.push(`Активността е с ${t.pct}% по-висока спрямо предходния период.`);
  else if (t.kind === "down") parts.push(`Активността е с ${Math.abs(t.pct)}% по-ниска спрямо предходния период.`);
  else if (t.kind === "nobase" || t.kind === "none") parts.push("Все още няма достатъчно данни за надеждна тенденция.");
  return parts.join(" ");
}

function countMap(arr, keyFn) {
  const m = {};
  for (const x of arr || []) {
    const k = keyFn(x);
    if (k == null) continue;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}
function countBy(arr, keyFn) {
  const m = countMap(arr, keyFn);
  return Object.entries(m)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// ---- Разширени KPI (само реални стойности) ----
export function overviewStats(projects, savedCount, now = new Date()) {
  let open = 0, exp7 = 0, exp30 = 0, newWeek = 0, changedWeek = 0, withDocs = 0, noDocs = 0;
  for (const p of projects || []) {
    const isOpen = p.status === "open" || p.status === "closing_soon";
    if (isOpen) open++;
    const dl = daysLeft(p.deadline_date, now);
    if (isOpen && dl != null && dl >= 0 && dl <= 7) exp7++;
    if (isOpen && dl != null && dl >= 0 && dl <= 30) exp30++;
    if (isNewSince(p, now)) newWeek++;
    else if (isChangedSince(p, now)) changedWeek++;
    if ((p.doc_count || 0) > 0) withDocs++;
    else if (isOpen) noDocs++;
  }
  return { open, exp7, exp30, newWeek, changedWeek, withDocs, noDocs, saved: savedCount, total: (projects || []).length };
}
