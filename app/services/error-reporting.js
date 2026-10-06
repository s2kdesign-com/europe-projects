import { BUILD_ID } from "../lib/build-info.js";

// No error allowlist, deduplication or lifetime cap. Failed reports remain in
// the queue and retry; reporting failures cannot recursively report themselves.
export function createErrorDelivery({ send, onFailure, schedule = setTimeout, cancel = clearTimeout }) {
  const queue = [];
  let running = false, timer = null, stopped = false;
  const flush = async () => {
    if (running || stopped || timer !== null) return;
    running = true;
    try {
      while (queue.length && !stopped) {
        await send(queue[0]);
        queue.shift();
      }
    } catch (error) {
      onFailure(error);
      if (!stopped) timer = schedule(() => { timer = null; void flush(); }, 5000);
    } finally { running = false; }
  };
  return {
    enqueue(payload) { queue.push(payload); void flush(); },
    retry() { if (timer !== null) cancel(timer); timer = null; void flush(); },
    stop() { stopped = true; if (timer !== null) cancel(timer); },
    pending: () => queue.length,
  };
}

let delivery;
export function reportClientError(payload) {
  if (typeof window === "undefined") return;
  if (!delivery) {
    delivery = createErrorDelivery({
      async send(body) {
        const serialized = JSON.stringify(body);
        const response = await fetch("/api/errors", {
          method: "POST", credentials: "same-origin", keepalive: new TextEncoder().encode(serialized).byteLength < 60_000,
          headers: { "content-type": "application/json", "X-Requested-With": "fetch" },
          body: serialized,
        });
        if (!response.ok) throw new Error(`Exception reporting failed (HTTP ${response.status})`);
      },
      onFailure: error => console.error("Exception report retained for retry:", error),
    });
    window.addEventListener("online", () => delivery.retry());
  }
  delivery.enqueue({ path: location.pathname, method: "GET", ...payload, detail: `${payload.detail || ""}\nBuild: ${BUILD_ID}` });
}

export function errorEventPayload(event) {
  const target = event.target;
  const resource = target && target !== window ? target.currentSrc || target.src || target.href : "";
  return {
    message: event.message || (resource ? `Failed to load resource: ${resource}` : "Unknown browser error"),
    detail: `${event.filename || resource || "Unknown script"}:${event.lineno || ""}:${event.colno || ""}\n${event.error?.stack || ""}\nPage: ${location.pathname}\nVisibility: ${document.visibilityState}`,
  };
}

export function errorOrigin(row) {
  if (row.source === "client" && /iabjs:\/\//i.test(row.detail || "")) return "native-browser";
  if (row.source === "client" && /(?:chrome|moz|safari)-extension:\/\//i.test(row.detail || "")) return "browser-extension";
  return row.source || "unknown";
}
