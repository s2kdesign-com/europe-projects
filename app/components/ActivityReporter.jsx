"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "../hooks/useSession.js";
import { createActivityTracker } from "../services/user-activity.js";
import { reportClientError } from "../services/error-reporting.js";

export default function ActivityReporter() {
  const { authenticated } = useSession();
  const pathname = usePathname();
  const tracker = useRef(null);
  useEffect(() => {
    if (!authenticated) return;
    const note = createActivityTracker({
      visible: () => document.visibilityState === "visible",
      async send() {
        const response = await fetch("/api/activity", {
          method: "POST", credentials: "same-origin", keepalive: true,
          headers: { "X-Requested-With": "fetch" },
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
      tracker.current = null;
      events.forEach(event => window.removeEventListener(event, interaction));
      document.removeEventListener("visibilitychange", visible);
    };
  }, [authenticated]);
  useEffect(() => { if (tracker.current) void tracker.current(); }, [pathname]);
  return null;
}
