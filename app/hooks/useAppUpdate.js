"use client";

// Централен hook за откриване на нов deployment. Единствен инстанс (в AppChrome).
// Проверява /version.json при: първоначално зареждане, на всеки 5 мин, връщане към
// таба (visibilitychange/focus) и при връщане online. Защитен срещу паралелни
// заявки, unmount, StrictMode дубли и повторно известяване за същия build.

import { useCallback, useEffect, useRef, useState } from "react";
import { BUILD_ID } from "../lib/build-info.js";
import {
  UPDATE_POLL_MS, UPDATE_SNOOZE_MS, UPDATE_MAX_DISMISS,
  UPDATE_SNOOZE_PREFIX, UPDATE_DISMISS_COUNT_KEY,
} from "../lib/version.js";
import { fetchRemoteVersion, shouldNotify, trackUpdate } from "../services/versionService.js";

const RELOAD_FLAG = "evroproekti_update_reloading";

function ss() { try { return window.sessionStorage; } catch { return null; } }
function getNum(k) { const s = ss(); const n = Number(s && s.getItem(k)); return Number.isFinite(n) ? n : 0; }
function setNum(k, n) { const s = ss(); if (s) try { s.setItem(k, String(n)); } catch { /* ignore */ } }
function getStr(k) { const s = ss(); return s ? s.getItem(k) : null; }
function setStr(k, v) { const s = ss(); if (s) try { s.setItem(k, v); } catch { /* ignore */ } }
function del(k) { const s = ss(); if (s) try { s.removeItem(k); } catch { /* ignore */ } }

const dismissKeyFor = (buildId) => UPDATE_DISMISS_COUNT_KEY + ":" + buildId;
const snoozeKeyFor = (buildId) => UPDATE_SNOOZE_PREFIX + buildId;

// Development симулация без реален deployment: ?simulateUpdate=1 (&critical=1).
function simulated() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("simulateUpdate") === "1") {
      return {
        version: "9.9.9",
        buildId: "SIMULATED-" + BUILD_ID,
        buildTimestamp: new Date().toISOString(),
        releaseTitle: "Тестова версия",
        releaseSummary: "Симулирано известие за нова версия (само за разработка).",
        critical: q.get("critical") === "1",
      };
    }
  } catch { /* ignore */ }
  return null;
}

export function useAppUpdate() {
  const [update, setUpdate] = useState(null); // remote info когато е реално по-нов build
  const inFlight = useRef(false);
  const alive = useRef(true);
  const sourceRef = useRef("polling");

  // Решава дали да покаже известие според snooze/dismiss/critical правилата.
  const evaluate = useCallback((remote, source) => {
    const ok = shouldNotify(remote, BUILD_ID, {
      dismisses: getNum(dismissKeyFor(remote.buildId)),
      snoozeUntil: getNum(snoozeKeyFor(remote.buildId)),
      maxDismiss: UPDATE_MAX_DISMISS,
    });
    if (!ok) return;
    const critical = !!remote.critical;
    sourceRef.current = source || "polling";
    setUpdate((cur) => {
      if (cur && cur.buildId === remote.buildId) return cur; // не пре-нотифицирай същия build
      trackUpdate("app_update_detected", { current_version: BUILD_ID, available_version: remote.buildId, critical, detection_source: sourceRef.current });
      return remote;
    });
  }, []);

  const check = useCallback(async (source) => {
    const sim = simulated();
    if (sim) { evaluate(sim, source); return; }
    if (inFlight.current) return; // без паралелни заявки
    inFlight.current = true;
    try {
      const remote = await fetchRemoteVersion();
      if (alive.current) evaluate(remote, source);
    } catch {
      /* мрежова грешка → тихо; без известие; пробваме при следващата проверка */
    } finally {
      inFlight.current = false;
    }
  }, [evaluate]);

  useEffect(() => {
    alive.current = true;
    // Изчистваме reload-флага (успешно заредихме — buildId вече съвпада, ако беше update).
    if (getStr(RELOAD_FLAG)) del(RELOAD_FLAG);

    const t0 = window.setTimeout(() => check("initial"), 3000); // след зареждането
    const interval = window.setInterval(() => check("polling"), UPDATE_POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") check("visibility"); };
    const onFocus = () => check("visibility");
    const onOnline = () => check("online");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      alive.current = false;
      window.clearTimeout(t0);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [check]);

  // „По-късно" / X → скрий, увеличи брояча, отложи (15 мин), освен ако е critical.
  const snooze = useCallback(() => {
    setUpdate((cur) => {
      if (!cur) return null;
      const n = getNum(dismissKeyFor(cur.buildId)) + 1;
      setNum(dismissKeyFor(cur.buildId), n);
      if (!cur.critical) setNum(snoozeKeyFor(cur.buildId), Date.now() + UPDATE_SNOOZE_MS);
      trackUpdate("app_update_later_clicked", { current_version: BUILD_ID, available_version: cur.buildId, critical: !!cur.critical });
      return null;
    });
  }, []);

  // „Обнови сега" → пълно презареждане (няма Service Worker). Loop-guard флаг.
  const refresh = useCallback(() => {
    setUpdate((cur) => {
      trackUpdate("app_update_refresh_clicked", { current_version: BUILD_ID, available_version: cur ? cur.buildId : "", critical: !!(cur && cur.critical) });
      setStr(RELOAD_FLAG, cur ? cur.buildId : "1");
      return cur;
    });
    // reload след текущия tick, за да се запишат sessionStorage/аналитиката
    window.setTimeout(() => { try { window.location.reload(); } catch { /* ignore */ } }, 0);
  }, []);

  return { update, detectionSource: sourceRef.current, currentBuildId: BUILD_ID, refresh, snooze };
}
