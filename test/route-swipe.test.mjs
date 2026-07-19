// Тестове за swipe route логиката (pathname = source of truth). node test/route-swipe.test.mjs
import assert from "node:assert/strict";
import { MAIN_ROUTES, getMainRouteIndex, tabFromPath } from "../app/lib/routes.js";

let n = 0;
const t = typeof it === "function" ? it : (name, fn) => { fn(); n++; console.log("ok -", name); };

t("основните маршрути са 4 в правилен ред", () => {
  assert.deepEqual(MAIN_ROUTES, ["/", "/procedures", "/calendar", "/saved"]);
});

t("index на основните маршрути", () => {
  assert.equal(getMainRouteIndex("/"), 0);
  assert.equal(getMainRouteIndex("/procedures"), 1);
  assert.equal(getMainRouteIndex("/calendar"), 2);
  assert.equal(getMainRouteIndex("/saved"), 3);
});

t("вътрешните страници връщат null (не 0/overview)", () => {
  for (const p of ["/sources", "/about", "/profile", "/settings", "/changelog", "/privacy", "/terms", "/cookies", "/admin", "/procedures/some-slug"]) {
    assert.equal(getMainRouteIndex(p), null, p + " трябва да е null");
  }
});

t("locale префикс се пренебрегва", () => {
  assert.equal(getMainRouteIndex("/en/procedures"), 1);
  assert.equal(getMainRouteIndex("/en/sources"), null);
  assert.equal(getMainRouteIndex("/de/"), 0);
});

t("trailing slash не чупи индекса", () => {
  assert.equal(getMainRouteIndex("/procedures/"), 1);
});

// Симулация на swipe решението (логиката от RouteSwipe).
function swipeTarget(pathname, dir /* -1 наляво(next), +1 надясно(prev) */) {
  const idx = getMainRouteIndex(pathname);
  if (idx == null) return "/"; // от вътрешна страница → Overview
  if (dir < 0 && idx < MAIN_ROUTES.length - 1) return MAIN_ROUTES[idx + 1];
  if (dir > 0 && idx > 0) return MAIN_ROUTES[idx - 1];
  return null; // няма накъде
}

t("swipe от вътрешна страница → Overview (в двете посоки)", () => {
  assert.equal(swipeTarget("/sources", -1), "/");
  assert.equal(swipeTarget("/sources", +1), "/");
  assert.equal(swipeTarget("/about", -1), "/");
});

t("нормална последователност напред (наляво)", () => {
  assert.equal(swipeTarget("/", -1), "/procedures");
  assert.equal(swipeTarget("/procedures", -1), "/calendar");
  assert.equal(swipeTarget("/calendar", -1), "/saved");
  assert.equal(swipeTarget("/saved", -1), null); // няма следваща
});

t("нормална последователност назад (надясно)", () => {
  assert.equal(swipeTarget("/saved", +1), "/calendar");
  assert.equal(swipeTarget("/calendar", +1), "/procedures");
  assert.equal(swipeTarget("/procedures", +1), "/");
  assert.equal(swipeTarget("/", +1), null); // няма предишна
});

t("tabFromPath: вътрешна страница → null (без фалшив active tab)", () => {
  assert.equal(tabFromPath("/sources"), null);
  assert.equal(tabFromPath("/about"), null);
  assert.equal(tabFromPath("/"), "overview");
  assert.equal(tabFromPath("/procedures"), "procedures");
});

console.log(`\n${n} passed (route-swipe)`);
