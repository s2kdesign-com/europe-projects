import { logError } from "./db.js";

// Only read operations belong here. Never retry arbitrary writes or SQL errors.
// Keep each transient exception in the journal even when a retry succeeds.
export async function readWithRetry(env, read, path, { wait = ms => new Promise(resolve => setTimeout(resolve, ms)), record = error => logError(env, error) } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await read(); }
    catch (error) {
      const message = String(error?.message || error);
      if (!/D1_ERROR:.*(?:storage operation exceeded timeout|storage caused object to be reset|reset because its code was updated|Network connection lost)/i.test(message)) throw error;
      await record({ source: "server", method: "GET", path, message, detail: `${error?.stack || message}\nRead attempt: ${attempt}/3. ${attempt < 3 ? "Retrying transient database failure." : "Retries exhausted."}` });
      if (attempt === 3) throw error;
      // Jitter is scheduling only, never a security identifier.
      await wait(50 * 2 ** (attempt - 1) + Math.floor(Math.random() * 50));
    }
  }
}
