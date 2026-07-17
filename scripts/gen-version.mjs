// Генерира уникален build-id за всеки deployment и записва:
//   • app/lib/build-info.js  → вгражда се в клиентския bundle (CURRENT_BUILD_ID)
//   • public/version.json    → сервира се (worker-ът добавя no-cache) за откриване
//
// Стартира се ПРЕДИ `next build` (виж package.json). Съдържанието идва от реалния
// код (APP_VERSION + последния запис в changelog) — без тайни и лични данни.
//
// Уникалният build-id = дата-час + кратък git sha (или random, ако няма git),
// така че всеки deployment се различава дори версията да не се е сменила.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (...x) => path.join(root, ...x);

function shortSha() {
  try { return execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return crypto.randomBytes(4).toString("hex"); }
}

function extract(re, text, fallback = "") {
  const m = re.exec(text);
  return m ? m[1] : fallback;
}

async function main() {
  const versionSrc = await readFile(p("app/lib/version.js"), "utf8");
  const version = extract(/APP_VERSION\s*=\s*"([^"]+)"/, versionSrc, "0.0.0");

  // Последният (най-горен) запис в changelog — заглавие/резюме за известието.
  let releaseTitle = "Нова версия";
  let releaseSummary = "";
  try {
    const clog = await readFile(p("app/lib/changelog-data.js"), "utf8");
    const after = clog.slice(clog.indexOf("CHANGELOG_ENTRIES"));
    releaseTitle = extract(/title:\s*"([^"]+)"/, after, releaseTitle);
    releaseSummary = extract(/summary:\s*"([^"]+)"/, after, releaseSummary);
  } catch { /* changelog по избор */ }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const buildId = `${stamp}-${shortSha()}`;
  const buildTimestamp = now.toISOString();
  // critical се задава изрично чрез env (по подразбиране false); НИКОГА автоматично.
  const critical = String(process.env.RELEASE_CRITICAL || "").toLowerCase() === "true";

  const buildInfo =
    `// АВТОГЕНЕРИРАН от scripts/gen-version.mjs — не редактирайте ръчно.\n` +
    `export const BUILD_ID = ${JSON.stringify(buildId)};\n` +
    `export const BUILD_TIMESTAMP = ${JSON.stringify(buildTimestamp)};\n`;
  await writeFile(p("app/lib/build-info.js"), buildInfo, "utf8");

  const versionJson = {
    version, buildId, buildTimestamp,
    releaseTitle, releaseSummary, critical,
  };
  await mkdir(p("public"), { recursive: true });
  await writeFile(p("public/version.json"), JSON.stringify(versionJson, null, 2) + "\n", "utf8");

  console.log(`✔ build-id ${buildId} (v${version}${critical ? ", critical" : ""})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
