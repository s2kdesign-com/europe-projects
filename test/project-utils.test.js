import { describe, it, expect } from "vitest";
import {
  parseDeadline,
  daysLeft,
  countdownLabel,
  targetGroup,
  isNovel,
  matchesQuery,
  filterProjects,
  sortProjects,
  groupByProgram,
  serializeFilters,
  deserializeFilters,
  activeFilterCount,
  generateICS,
  escapeICS,
  projectsToCSV,
  computeStats,
  EMPTY_FILTERS,
} from "../app/lib/project-utils.js";

const NOW = new Date(2026, 6, 12, 10, 0, 0); // 2026-07-12 локално

const P = (o) => ({
  id: "id-" + Math.random().toString(36).slice(2),
  name: "Процедура",
  program: "ПРЧР",
  priority: "",
  category: "other",
  status: "open",
  deadline: "",
  deadline_date: null,
  budget: "",
  eligible: "",
  is_new: 0,
  last_updated: "2026-07-01",
  ...o,
});

describe("parseDeadline / daysLeft — граници и невалидни дати", () => {
  it("разбира валидна ISO дата", () => {
    expect(parseDeadline("2026-07-20")).toBeInstanceOf(Date);
  });
  it("отхвърля невалиден ден (2026-02-31)", () => {
    expect(parseDeadline("2026-02-31")).toBeNull();
  });
  it("отхвърля празно/боклук", () => {
    expect(parseDeadline("")).toBeNull();
    expect(parseDeadline("не е дата")).toBeNull();
    expect(parseDeadline(null)).toBeNull();
  });
  it("днес = 0, утре = 1, вчера = -1", () => {
    expect(daysLeft("2026-07-12", NOW)).toBe(0);
    expect(daysLeft("2026-07-13", NOW)).toBe(1);
    expect(daysLeft("2026-07-11", NOW)).toBe(-1);
  });
  it("липсваща дата -> null", () => {
    expect(daysLeft(null, NOW)).toBeNull();
  });
});

describe("countdownLabel", () => {
  it("форматира на български", () => {
    expect(countdownLabel(0)).toBe("днес");
    expect(countdownLabel(1)).toBe("остава 1 ден");
    expect(countdownLabel(5)).toBe("остават 5 дни");
    expect(countdownLabel(-3)).toBe("срокът изтече");
    expect(countdownLabel(null)).toBe("");
  });
});

describe("targetGroup / isNovel — разделяне на аудитория от новост", () => {
  it("youth се извлича от category", () => {
    expect(targetGroup(P({ category: "youth" }))).toBe("youth");
    expect(targetGroup(P({ category: "other" }))).toBe("general");
    expect(targetGroup(P({ category: "new" }))).toBe("general");
  });
  it("новостта е отделна (is_new или историческо category=new)", () => {
    expect(isNovel(P({ is_new: 1 }))).toBe(true);
    expect(isNovel(P({ category: "new" }))).toBe(true);
    expect(isNovel(P({ category: "youth", is_new: 0 }))).toBe(false);
  });
});

describe("matchesQuery — българско търсене", () => {
  const p = P({ name: "Младежка заетост+", program: "ПРЧР", eligible: "младежи до 29 г." });
  it("нечувствителност към регистър", () => {
    expect(matchesQuery(p, "МЛАДЕЖКА")).toBe(true);
    expect(matchesQuery(p, "младежка")).toBe(true);
  });
  it("търси в няколко полета", () => {
    expect(matchesQuery(p, "прчр")).toBe(true);
    expect(matchesQuery(p, "29")).toBe(true);
  });
  it("всички думи трябва да съвпаднат (AND)", () => {
    expect(matchesQuery(p, "младежка заетост")).toBe(true);
    expect(matchesQuery(p, "младежка космос")).toBe(false);
  });
  it("празна заявка връща всичко", () => {
    expect(matchesQuery(p, "")).toBe(true);
  });
});

describe("filterProjects — комбинирани филтри и изчистване", () => {
  const projects = [
    P({ id: "a", status: "open", program: "ПРЧР", category: "youth", deadline_date: "2026-07-15", doc_count: 2 }),
    P({ id: "b", status: "upcoming", program: "ПКИП", category: "other", deadline_date: "2026-12-01", doc_count: 0 }),
    P({ id: "c", status: "closed", program: "ПРЧР", category: "other", deadline_date: null }),
    P({ id: "d", status: "closing_soon", program: "ПКИП", category: "youth", deadline_date: "2026-07-13", doc_count: 1 }),
  ];
  it("филтър по статус", () => {
    const r = filterProjects(projects, { ...EMPTY_FILTERS, status: ["open", "closing_soon"] }, NOW);
    expect(r.map((x) => x.id).sort()).toEqual(["a", "d"]);
  });
  it("филтър по програма + целева група (комбинирани)", () => {
    const r = filterProjects(projects, { ...EMPTY_FILTERS, program: ["ПКИП"], target: ["youth"] }, NOW);
    expect(r.map((x) => x.id)).toEqual(["d"]);
  });
  it("прозорец по срок: до 7 дни", () => {
    const r = filterProjects(projects, { ...EMPTY_FILTERS, deadline: ["7"] }, NOW);
    expect(r.map((x) => x.id).sort()).toEqual(["a", "d"]);
  });
  it("прозорец „без обявен срок“", () => {
    const r = filterProjects(projects, { ...EMPTY_FILTERS, deadline: ["none"] }, NOW);
    expect(r.map((x) => x.id)).toEqual(["c"]);
  });
  it("само с документи", () => {
    const r = filterProjects(projects, { ...EMPTY_FILTERS, docs: true }, NOW);
    expect(r.map((x) => x.id).sort()).toEqual(["a", "d"]);
  });
  it("изчистване (празни филтри) връща всички", () => {
    expect(filterProjects(projects, EMPTY_FILTERS, NOW)).toHaveLength(4);
  });
  it("не мутира входа", () => {
    const copy = JSON.parse(JSON.stringify(projects));
    filterProjects(projects, { ...EMPTY_FILTERS, status: ["open"] }, NOW);
    expect(projects).toEqual(copy);
  });
});

describe("sortProjects — спешно, обновени, заглавие", () => {
  const projects = [
    P({ id: "far", name: "Б", status: "open", deadline_date: "2026-08-30", last_updated: "2026-07-05" }),
    P({ id: "soon", name: "В", status: "open", deadline_date: "2026-07-14", last_updated: "2026-07-01" }),
    P({ id: "none", name: "А", status: "upcoming", deadline_date: null, last_updated: "2026-07-10" }),
    P({ id: "past", name: "Г", status: "closed", deadline_date: "2026-07-01", last_updated: "2026-06-01" }),
  ];
  it("спешно: най-близкият валиден срок първо, липсващите последни", () => {
    const r = sortProjects(projects, "urgent", NOW).map((x) => x.id);
    expect(r[0]).toBe("soon");
    expect(r[1]).toBe("far");
    expect(r[r.length - 1]).toBe("none");
  });
  it("последно обновени", () => {
    const r = sortProjects(projects, "updated", NOW).map((x) => x.id);
    expect(r[0]).toBe("none"); // 2026-07-10
  });
  it("по заглавие (А–Я)", () => {
    const r = sortProjects(projects, "title", NOW).map((x) => x.name);
    expect(r).toEqual(["А", "Б", "В", "Г"]);
  });
});

describe("groupByProgram", () => {
  it("групира и сортира групите по спешност", () => {
    const projects = [
      P({ program: "ПКИП", status: "open", deadline_date: "2026-09-01" }),
      P({ program: "ПРЧР", status: "open", deadline_date: "2026-07-14" }),
    ];
    const g = groupByProgram(projects, "urgent", NOW);
    expect(g[0][0]).toBe("ПРЧР"); // по-спешната група първо
  });
});

describe("URL синхронизация", () => {
  it("serialize -> deserialize запазва състоянието", () => {
    const f = {
      ...EMPTY_FILTERS,
      q: "младеж",
      status: ["open", "closing_soon"],
      program: ["ПРЧР"],
      target: ["youth"],
      deadline: ["30"],
      docs: true,
      sort: "updated",
      view: "list",
      tab: "procedures",
      selected: "abc",
    };
    const round = deserializeFilters(serializeFilters(f));
    expect(round.q).toBe("младеж");
    expect(round.status).toEqual(["open", "closing_soon"]);
    expect(round.program).toEqual(["ПРЧР"]);
    expect(round.target).toEqual(["youth"]);
    expect(round.deadline).toEqual(["30"]);
    expect(round.docs).toBe(true);
    expect(round.sort).toBe("updated");
    expect(round.view).toBe("list");
    expect(round.tab).toBe("procedures");
    expect(round.selected).toBe("abc");
  });
  it("подразбиращите се стойности не се записват в URL (без периода, който винаги е там)", () => {
    // Периодът за „Какво е ново" се записва винаги (?period=30), останалите
    // подразбиращи се стойности се пропускат.
    expect(serializeFilters(EMPTY_FILTERS)).toBe("period=30");
  });
  it("периодът се сериализира/десериализира и се валидира", () => {
    expect(serializeFilters({ ...EMPTY_FILTERS, period: "60" })).toContain("period=60");
    expect(deserializeFilters("?period=90").period).toBe("90");
    // невалиден или липсващ период → 30
    expect(deserializeFilters("?period=5").period).toBe("30");
    expect(deserializeFilters("").period).toBe("30");
  });
  it("activeFilterCount брои филтрите (без sort/view/tab)", () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, q: "x", status: ["open"], docs: true })).toBe(3);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });
});

describe("generateICS — валиден .ics със стабилен UID и екраниране", () => {
  const p = P({
    id: "proc-1",
    name: "Стаж; млади, хора",
    program: "ПРЧР",
    deadline_date: "2026-07-20",
    link: "https://example.bg",
  });
  it("връща null без дата", () => {
    expect(generateICS(P({ deadline_date: null }), NOW)).toBeNull();
  });
  it("съдържа стабилен UID и all-day DTSTART", () => {
    const ics = generateICS(p, NOW);
    expect(ics).toContain("UID:proc-1@evroproekti.dashboard");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260720");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
  });
  it("екранира запетаи и точки-запетаи в SUMMARY", () => {
    const ics = generateICS(p, NOW);
    expect(ics).toContain("Стаж\\; млади\\, хора");
  });
  it("използва CRLF", () => {
    expect(generateICS(p, NOW)).toContain("\r\n");
  });
  it("escapeICS обработва наклонена черта и нов ред", () => {
    expect(escapeICS("a\\b\nc")).toBe("a\\\\b\\nc");
  });
});

describe("projectsToCSV", () => {
  it("има BOM и заглавен ред", () => {
    const csv = projectsToCSV([P({ name: "Тест" })], NOW);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Име,Програма");
  });
  it("екранира стойности със запетаи и кавички", () => {
    const csv = projectsToCSV([P({ name: 'Име, с "кавички"' })], NOW);
    expect(csv).toContain('"Име, с ""кавички"""');
  });
});

describe("computeStats — за KPI картите",