"use client";

import { useEffect } from "react";

// Изпраща клиентските грешки към /api/errors (за таб „Exceptions"). С лимит,
// за да не залива сървъра. Работи тихо — не пречи на приложението.
let sent = 0;
const MAX = 12;

export default function ErrorReporter() {
  useEffect(() => {
    const send = (payload) => {
      if (sent >= MAX) return;
      sent++;
      try {
        fetch("/api/errors", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "X-Requested-With": "fetch" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      } catch { /* ignore */ }
    };
    const onErr = (e) => send({
      path: location.pathname, method: "GET",
      message: (e.message || "error").slice(0, 400),
      detail: `${e.filename || ""}:${e.lineno || ""}:${e.colno || ""} ${(e.error && e.error.stack) || ""}`.slice(0, 1500),
    });
    const onRej = (e) => {
      const r = e.reason;
      send({ path: location.pathname, method: "GET", message: ((r && r.message) || String(r) || "unhandledrejection").slice(0, 400), detail: ((r && r.stack) || "").slice(0, 1500) });
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}
