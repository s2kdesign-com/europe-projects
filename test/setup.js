import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Чист DOM след всеки тест.
afterEach(() => cleanup());

// jsdom няма matchMedia — добавяме прост стъб.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

// URL.createObjectURL за тестовете за сваляне (ICS/CSV).
if (!URL.createObjectURL) URL.createObjectURL = () => "blob:mock";
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
