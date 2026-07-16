// Регенерира офлайн preview-а (preview.html + preview.bundle.js) от реалния код.
//
// Изисква esbuild:  npm i -D esbuild
// Стартиране:       node build-preview.mjs
//
// Прави две неща:
//   1) Свързва всички CSS файлове (в реда от app/layout.jsx) в един <style>.
//   2) Бъндълва preview.entry.jsx (DashboardShell + фикстури) в preview.bundle.js.

import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const p = (...x) => path.join(root, ...x);

// Същият ред като в app/layout.jsx
const CSS_FILES = [
  "app/globals.css", "app/overview.css", "app/calendar.css", "app/auth.css",
  "app/admin.css", "app/header.css", "app/footer.css", "app/site.css",
];

async function main() {
  // 1) CSS
  let css = "";
  for (const f of CSS_FILES) {
    css += `\n/* ==== ${f} ==== */\n` + (await readFile(p(f), "utf8"));
  }

  // 2) JS бъндъл
  await build({
    entryPoints: [p("preview.entry.jsx")],
    outfile: p("preview.bundle.js"),
    bundle: true,
    minify: true,
    format: "iife",
    jsx: "automatic",
    loader: { ".js": "jsx", ".json": "json" },
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "info",
  });

  // 3) HTML
  const html =
    `<!doctype html><html lang="bg"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Европроекти — Табло (preview)</title><style>${css}</style></head>` +
    `<body><div id="root"></div><script src="./preview.bundle.js"></script></body></html>`;
  await writeFile(p("preview.html"), html, "utf8");

  console.log("✔ preview.html и preview.bundle.js са обновени.");
}

main().catch((e) => { console.error(e); process.exit(1); });
