"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import { LS_PROFILE, LS_LAST_VISIT, PROFILE_DEFAULT } from "../lib/constants.js";

export const LS_SAVED_META = "evroproekti:savedMeta:v1";

// Профил на потребителя (localStorage).
export function useProfile() {
  const [profile, setProfile] = useLocalStorage(LS_PROFILE, PROFILE_DEFAULT);
  const merged = { ...PROFILE_DEFAULT, ...(profile || {}) };
  return [merged, setProfile];
}

// Връща времето на ПРЕДИШНОТО посещение (за „какво се промени от последното
// посещение") и записва текущото.
export function useLastVisit() {
  const [prev, setPrev] = useState(null);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    try {
      const raw = window.localStorage.getItem(LS_LAST_VISIT);
      if (raw) setPrev(raw);
      window.localStorage.setItem(LS_LAST_VISIT, new Date().toISOString());
    } catch {
      /* ignore */
    }
  }, []);
  return prev;
}
