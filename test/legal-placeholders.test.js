import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => readFileSync(path.join(root, f), "utf8");

// Публични файлове, които не бива да съдържат технически placeholder-и.
const PUBLIC_FILES = [
  "app/terms/page.jsx",
  "app/privacy/page.jsx",
  "app/cookies/page.jsx",
  "app/lib/version.js",
  "app/lib/company.js",
  "app/components/SiteFooter.jsx",
  "app/components/SystemWelcomeModal.jsx",
];

// Формат [SOMETHING] — главни букви/цифри/долни черти в квадратни скоби.
const PLACEHOLDER = /\[[A-Z][A-Z0-9_]{2,}\]/;

describe("правна конфигурация без placeholder-и", () => {
  for (const f of PUBLIC_FILES) {
    it(`${f} няма [PLACEHOLDER]`, () => {
      const m = read(f).match(PLACEHOLDER);
      expect(m ? `намерен placeholder: ${m[0]}` : null).toBeNull();
    });
  }

  it("централната конфигурация съдържа реалните фирмени данни", () => {
    const c = read("app/lib/company.js");
    expect(c).toContain("S2K Design ЕООД");
    expect(c).toContain("office@s2kdesign.com");
    expect(c).toContain("https://s2kdesign.com/");
  });

  it("няма developer бележка на публичните правни страници", () => {
    for (const f of ["app/terms/page.jsx", "app/privacy/page.jsx"]) {
      expect(read(f)).not.toContain("Попълнете реалните фирмени данни");
    }
  });

  it("mailto и външен линк към S2K Design са налични в Условията", () => {
    const t = read("app/terms/page.jsx");
    expect(t).toContain("mailto:");
    expect(t).toContain('rel="noopener noreferrer"');
  });
});
