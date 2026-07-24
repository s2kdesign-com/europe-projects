// Тестове за конфигурацията на секциите в детайла на процедурата (без табове).
// node test/procedure-sections.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PROCEDURE_SECTIONS, sectionIdForTab, sortDocuments } from "../app/lib/procedure-sections.js";

// ВАЖНО: НЕ ползвай `new URL(...)` тук — под vitest (environment: "jsdom") глобалният
// `URL` е jsdom-полифил, който не поддържа file: схема → "The URL must be of scheme
// file". fileURLToPath(import.meta.url) работи, защото приема string директно.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAWER = readFileSync(path.join(__dirname, "../app/components/ProjectDrawer.jsx"), "utf8").replace(/\0/g, "");

let n = 0;
// Под vitest (globals: true) `it` е глобален → регистрира се като истински тест.
// Без vitest (директно с `node`) пада на ръчния брояч по-долу.
const t = typeof it === "function" ? it : (name, fn) => { fn(); n++; console.log("ok -", name); };

t("Секциите са в правилния логичен ред", () => {
  assert.deepEqual(PROCEDURE_SECTIONS.map((s) => s.key),
    ["overview", "eligible", "funding", "deadlines", "documents", "sources"]);
});

t("Всяка секция има стабилен anchor id", () => {
  assert.deepEqual(PROCEDURE_SECTIONS.map((s) => s.id), [
    "procedure-overview", "procedure-applicants", "procedure-financing",
    "procedure-deadlines", "procedure-documents", "procedure-sources",
  ]);
});

t("Няма дублирани id/key; всяка има икона и етикет", () => {
  assert.equal(new Set(PROCEDURE_SECTIONS.map((s) => s.id)).size, PROCEDURE_SECTIONS.length);
  assert.equal(new Set(PROCEDURE_SECTIONS.map((s) => s.key)).size, PROCEDURE_SECTIONS.length);
  for (const s of PROCEDURE_SECTIONS) { assert.ok(s.icon); assert.ok(s.label); }
});

t("sectionIdForTab: стар initialTab/?tab= → id на секция", () => {
  assert.equal(sectionIdForTab("documents"), "procedure-documents");
  assert.equal(sectionIdForTab("eligible"), "procedure-applicants");
  assert.equal(sectionIdForTab("funding"), "procedure-financing");
  assert.equal(sectionIdForTab("overview"), "procedure-overview");
});

t("sectionIdForTab: непознат таб → null", () => {
  assert.equal(sectionIdForTab("nope"), null);
  assert.equal(sectionIdForTab(undefined), null);
});

// --- Quick navigation е премахната изцяло ---
t("Няма quick-navigation („Към секция“) — нито UI, нито state/CSS клас", () => {
  assert.ok(!DRAWER.includes("Към секция"), "остатъчен етикет „Към секция“");
  assert.ok(!DRAWER.includes("drawer-quicknav"), "остатъчен CSS клас drawer-quicknav");
  assert.ok(!DRAWER.includes("goTo("), "остатъчен scroll handler за quick nav");
  const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8").replace(/\0/g, "");
  assert.ok(!css.includes(".drawer-quicknav"), "остатъчни quick-nav стилове");
});

t("Section id-тата се пазят (hash URL / backward compat)", () => {
  for (const s of PROCEDURE_SECTIONS) assert.ok(DRAWER.includes(`id="${s.id}"`), "липсва секция " + s.id);
});

// --- Документи: 0 / 1 / 2+ ---
t("Един документ → разгънат без accordion бутон (heading + DocumentBody)", () => {
  assert.ok(DRAWER.includes("docs.length === 1 ? docs[0] : null"), "липсва single-document клон");
  assert.ok(DRAWER.includes("doc-single-title"), "единичният документ няма heading");
  // accordion бутонът се рендира само в клона за 2+ документа
  const multi = DRAWER.split("{docs.length > 1 && shownDocs.map(")[1] || "";
  assert.ok(multi.includes('aria-expanded={open}'), "списъкът няма aria-expanded");
  assert.ok(multi.includes('aria-controls='), "списъкът няма aria-controls");
});

t("Нула документа → ясно empty състояние (не голо 0)", () => {
  assert.ok(DRAWER.includes("Няма публикувани документи към тази процедура."));
  assert.ok(DRAWER.includes("count={docs.length || null}"), "броячът трябва да е скрит при 0");
});

t("Повече документи → първият е разгънат по подразбиране", () => {
  assert.ok(DRAWER.includes("if (docs.length > 1) setOpenDocs(new Set([docs[0].id]))"));
});

t("Document error state не крие действията", () => {
  assert.ok(DRAWER.includes("Документът е наличен, но подробният анализ временно не може да бъде зареден."));
  assert.ok(DRAWER.includes("Отвори документа"));
});

t("Документите не се дублират в „Официални източници“ при 1 документ", () => {
  assert.ok(DRAWER.includes("docs.length > 1)"), "extraSources трябва да изключва единичния документ");
  assert.ok(DRAWER.includes("d.source_url !== p.link"), "не филтрира дубликат с официалната страница");
});

// --- Подредба на документите ---
t("sortDocuments: основните условия първи, после по дата, приложенията накрая", () => {
  const docs = [
    { id: "a", title: "Приложение 1 – бюджетна таблица", created_at: "2026-07-20" },
    { id: "b", title: "Условия за кандидатстване", created_at: "2026-07-01" },
    { id: "c", title: "Информационен лист", created_at: "2026-07-19" },
    { id: "d", title: "Информационен лист (стар)", created_at: "2026-07-02" },
  ];
  assert.deepEqual(sortDocuments(docs).map((d) => d.id), ["b", "c", "d", "a"]);
});

t("sortDocuments: не мутира входа и понася празен списък", () => {
  const input = [{ id: "x", title: "Annex" }, { id: "y", title: "Call announcement" }];
  const copy = [...input];
  sortDocuments(input);
  assert.deepEqual(input, copy);
  assert.deepEqual(sortDocuments([]), []);
  assert.deepEqual(sortDocuments(undefined), []);
});

console.log(`\n${n} passed (procedure-sections)`);
