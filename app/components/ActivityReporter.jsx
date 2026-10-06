"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "../hooks/useSession.js";
import { createActivityTracker } from "../services/user-activity.js";
import { reportClientError } from "../services/error-reporting.js";
import { useCountry } from "./country/CountryProvider.jsx";
import { useLanguage } from "./i18n/I18nProvider.jsx";

export default function ActivityReporter() {
  const { authenticated, user } = useSession();
  const { automaticCountry, automaticCountrySource } = useCountry();
  const { automaticLanguage, automaticLanguageSource } = useLanguage();
  const ready = !!automaticCountry && !!automaticLanguage;
  const context = useRef(null);
  context.current = { automaticCountry, automaticCountrySource, automaticLanguage, automaticLanguageSource };
  const pathname = usePathname();
  const tracker = useRef(null);
  useEffect(() => {
    if (!authenticated || !ready) return;
    let alive = true;
    const note = createActivityTracker({
      visible: () => alive && document.visibilityState === "visible",
      context: () => context.current,
      async send(value) {
        const response = await fetch("/api/activity", {
          method: "POST", credentials: "same-origin", keepalive: true,
          headers: { "X-Requested-With": "fetch", "content-type": "application/json" },
          body: JSON.stringify(value),
        });
        // An expired session is expected; it must not create an error storm.
        if (!response.ok && response.status !== 401) throw new Error(`Activity update failed (HTTP ${response.status})`);
      },
      onError: error => reportClientError({ method: "POST", path: "/api/activity", message: error.message, detail: error.stack || "" }),
    });
    tracker.current = note;
    const interaction = event => { if (event.isTrusted) void note(); };
    const visible = () => { if (document.visibilityState === "visible") void note(); };
    const events = ["pointerdown", "keydown", "wheel", "touchmove"];
    events.forEach(event => window.addEventListener(event, interaction, { passive: true }));
    document.addEventListener("visibilitychange", visible);
    void note();
    return () => {
      alive = false;
      tracker.current = null;
      events.forEach(event => window.removeEventListener(event, interaction));
      document.removeEventListener("visibilitychange", visible);
    };
  }, [authenticated, ready, user?.id]);
  useEffect(() => { if (tracker.current) void tracker.current(); }, [pathname, automaticCountry, automaticCountrySource, automaticLanguage, automaticLanguageSource]);
  return null;
}
