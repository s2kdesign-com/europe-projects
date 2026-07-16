"use client";

import { useCallback, useEffect, useState } from "react";

// SSR-безопасен localStorage hook (static export пре-рендира без window).
export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);

  // Четем след mount, за да няма разминаване сървър/клиент (hydration).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw));
    } catch {
      /* игнорираме недостъпен/повреден storage */
    }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / private mode — тихо пропускаме */
    }
  }, [key, value, ready]);

  // Синхронизация между отворени табове.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === key && e.newValue != null) {
        try {
          setValue(JSON.parse(e.newValue));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return [value, setValue, ready];
}

// Удобна обвивка за списък със запазени id-та.
export function useSavedProjects(key) {
  const [saved, setSaved] = useLocalStorage(key, []);

  const isSaved = useCallback((id) => saved.includes(id), [saved]);

  const toggleSaved = useCallback(
    (id) =>
      setSaved((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
    [setSaved]
  );

  return { saved, isSaved, toggleSaved, setSaved };
}
