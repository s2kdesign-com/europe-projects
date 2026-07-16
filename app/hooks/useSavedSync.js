"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSavedProjects, useLocalStorage } from "./useLocalStorage.js";
import { LS_SAVED_META } from "./useProfile.js";
import { LS_SAVED } from "../lib/constants.js";

const LS_NOTES = "evroproekti:notes:v1";
const LS_MIGRATED = "evroproekti:savedMigrated:v1";

// Обединява запазените процедури: при вход — от сървъра (акаунт), без вход —
// локално в браузъра. При първи вход прехвърля локалните запазвания в акаунта,
// без да ги губи при неуспех.
export function useSavedSync(session, flash) {
  const local = useSavedProjects(LS_SAVED);
  const [localMeta, setLocalMeta] = useLocalStorage(LS_SAVED_META, {});
  const [localNotes, setLocalNotes] = useLocalStorage(LS_NOTES, {});
  const [serverRows, setServerRows] = useState(null); // null = не е зареждано
  const migratingRef = useRef(false);

  const authed = session.authenticated;

  const fetchServer = useCallback(async () => {
    const r = await fetch("/api/saved-procedures", { credentials: "same-origin" }).then((x) => x.json()).catch(() => null);
    return r && r.ok ? r.saved || [] : null;
  }, []);

  useEffect(() => {
    if (!authed) { setServerRows(null); return; }
    let alive = true;
    (async () => {
      let rows = await fetchServer();
      if (!alive || rows == null) return;
      const migrated = safeGet(LS_MIGRATED) === "1";
      if (!migrated && !migratingRef.current && local.saved.length > 0) {
        migratingRef.current = true;
        try {
          const res = await fetch("/api/saved-procedures/import-local", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json", "X-Requested-With": "fetch" },
            body: JSON.stringify({ ids: local.saved }),
          });
          if (res.ok) {
            const d = await res.json();
            safeSet(LS_MIGRATED, "1");
            const r2 = await fetchServer();
            if (r2) rows = r2;
            if (d.added > 0 && flash) flash("Локално запазените процедури бяха добавени към профила ви.");
          }
        } catch {
          /* мрежова грешка — пазим локалните, не ги трием */
        } finally {
          migratingRef.current = false;
        }
      }
      if (alive) setServerRows(rows);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const savedIds = useMemo(
    () => (authed && serverRows ? serverRows.map((r) => r.procedure_id) : local.saved),
    [authed, serverRows, local.saved]
  );
  const savedMeta = useMemo(
    () => (authed && serverRows ? Object.fromEntries(serverRows.map((r) => [r.procedure_id, r.last_updated_at_save])) : localMeta),
    [authed, serverRows, localMeta]
  );
  const notes = useMemo(
    () => (authed && serverRows ? Object.fromEntries(serverRows.map((r) => [r.procedure_id, r.personal_note])) : localNotes),
    [authed, serverRows, localNotes]
  );

  const isSaved = useCallback((id) => savedIds.includes(id), [savedIds]);

  const toggleSave = useCallback(
    async (pOrId) => {
      const id = typeof pOrId === "string" ? pOrId : pOrId.id;
      if (!authed) {
        const wasSaved = local.saved.includes(id);
        local.toggleSaved(id);
        if (!wasSaved && typeof pOrId !== "string") setLocalMeta((m) => ({ ...m, [id]: pOrId.last_updated || "" }));
        return;
      }
      const has = (serverRows || []).some((r) => r.procedure_id === id);
      const prev = serverRows || [];
      setServerRows(
        has
          ? prev.filter((r) => r.procedure_id !== id)
          : [...prev, { procedure_id: id, last_updated_at_save: typeof pOrId === "string" ? "" : pOrId.last_updated || "", personal_status: "za_pregled" }]
      );
      try {
        const res = has
          ? await fetch("/api/saved-procedures/" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin", headers: { "X-Requested-With": "fetch" } })
          : await fetch("/api/saved-procedures", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify({ procedure_id: id }) });
        if (!res.ok) throw new Error("save_failed");
        const fresh = await fetchServer();
        if (fresh) setServerRows(fresh);
      } catch {
        setServerRows(prev);
        if (flash) flash("Действието не бе записано. Опитайте отново.");
      }
    },
    [authed, serverRows, local, setLocalMeta, fetchServer, flash]
  );

  const setNote = useCallback(
    async (id, text) => {
      if (!authed) { setLocalNotes((m) => ({ ...m, [id]: text })); return; }
      setServerRows((rows) => (rows || []).map((r) => (r.procedure_id === id ? { ...r, personal_note: text } : r)));
      try {
        await fetch("/api/saved-procedures/" + encodeURIComponent(id), { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify({ personal_note: text }) });
      } catch { /* ignore */ }
    },
    [authed, setLocalNotes]
  );

  return { savedIds, isSaved, toggleSave, savedMeta, notes, setNote, savedCount: savedIds.length };
}

function safeGet(k) { try { return window.localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } }
