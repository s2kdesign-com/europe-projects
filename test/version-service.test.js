import { describe, it, expect } from "vitest";
import { isNewer, shouldNotify } from "../app/services/versionService.js";

const CUR = "build-A";
const NEWER = { buildId: "build-B", version: "2.4.0", critical: false };
const CRIT = { buildId: "build-C", version: "2.4.1", critical: true };
const NOW = 1_000_000;
const MIN = 60 * 1000;

describe("isNewer", () => {
  it("еднакъв buildId → няма нова версия", () => {
    expect(isNewer({ buildId: CUR }, CUR)).toBe(false);
  });
  it("различен buildId → нова версия", () => {
    expect(isNewer(NEWER, CUR)).toBe(true);
  });
  it("липсващ/невалиден remote → false", () => {
    expect(isNewer(null, CUR)).toBe(false);
    expect(isNewer({}, CUR)).toBe(false);
    expect(isNewer({ buildId: "" }, CUR)).toBe(false);
  });
});

describe("shouldNotify (snooze / dismiss / critical)", () => {
  it("нов build без snooze → показва се", () => {
    expect(shouldNotify(NEWER, CUR, { now: NOW })).toBe(true);
  });
  it("активен snooze → скрито; изтекъл snooze → показва се", () => {
    const snoozeUntil = NOW + 15 * MIN;
    expect(shouldNotify(NEWER, CUR, { now: NOW + MIN, snoozeUntil })).toBe(false);
    expect(shouldNotify(NEWER, CUR, { now: NOW + 16 * MIN, snoozeUntil })).toBe(true);
  });
  it("3 затваряния → скрито за сесията", () => {
    expect(shouldNotify(NEWER, CUR, { now: NOW, dismisses: 3 })).toBe(false);
    expect(shouldNotify(NEWER, CUR, { now: NOW, dismisses: 2 })).toBe(true);
  });
  it("critical → игнорира snooze и лимита", () => {
    expect(shouldNotify(CRIT, CUR, { now: NOW, dismisses: 9, snoozeUntil: NOW + 60 * MIN })).toBe(true);
  });
  it("еднакъв build → никога не показва", () => {
    expect(shouldNotify({ buildId: CUR, critical: true }, CUR, { now: NOW })).toBe(false);
  });
});
