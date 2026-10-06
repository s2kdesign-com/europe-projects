"use client";

import { useEffect } from "react";
import { errorEventPayload, reportClientError } from "../services/error-reporting.js";

export default function ErrorReporter() {
  useEffect(() => {
    const onErr = (e) => reportClientError(errorEventPayload(e));
    const onRej = (e) => {
      const r = e.reason;
      reportClientError({ message: r?.message || String(r) || "unhandledrejection", detail: `${r?.stack || ""}\nPage: ${location.pathname}\nVisibility: ${document.visibilityState}` });
    };
    window.addEventListener("error", onErr, true);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr, true); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}
