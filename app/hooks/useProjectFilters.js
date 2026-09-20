"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_FILTERS,
  deserializeFilters,
  serializeFilters,
} from "../lib/project-utils.js";
import { tabFromPath, ROUTE_QUERY_KEYS } from "../lib/routes.js";
import { initialProcedureNavigation } from '../lib/procedure-bootstrap.js';

// Параметри, валидни на всеки маршрут (отворена процедура, сравнение).
const COMMON_QUERY_KEYS = ["id", "compare"];

// Оставя в URL само query параметрите, приложими за текущия маршрут (чист URL —
// напр. period/activityPeriod не изтичат на /procedures).
export function routeScopedQuery(filters, pathname) {
  const tab = tabFromPath(pathname);
  const allowed = new Set([...(ROUTE_QUERY_KEYS[tab] || []), ...COMMON_QUERY_KEYS]);
  const sp = new URLSearchParams(serializeFilters(filters));
  for (const k of [...sp.keys()]) if (!allowed.has(k)) sp.delete(k);
  return sp.toString();
}

// Управлява състоянието на филтрите и го синхронизира с URL (URLSearchParams),
// така че търсене, филтри, сортиране и изглед оцеляват при reload и назад/напред,
// и връзката може да се сподели.
export function useProjectFilters() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const skipNextSync = useRef(false);
  const navigation = useRef(null);
  const firstSync = useRef(true);
  const [initialized, setInitialized] = useState(false);

  // Първоначално четене от URL (само на клиента).
  useEffect(() => {
    navigation.current = initialProcedureNavigation();
    setFilters({ ...deserializeFilters(window.location.search), ...(navigation.current ? { selected: navigation.current.id } : {}) });
    setInitialized(true);
    const onPop = () => {
      skipNextSync.current = true; // това е браузърна навигация, не наш push
      navigation.current = initialProcedureNavigation();
      setFilters({ ...deserializeFilters(window.location.search), ...(navigation.current ? { selected: navigation.current.id } : {}) });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Запис на състоянието в URL при промяна.
  useEffect(() => {
    if (!initialized) return;
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    const nav = navigation.current;
    const pathname = nav?.path || window.location.pathname;
    const params = new URLSearchParams(routeScopedQuery(filters, pathname));
    if (nav?.id === filters.selected) params.delete('id');
    const lang = new URLSearchParams(window.location.search).get('lang');
    if (lang) params.set('lang', lang);
    const qs = params.toString();
    const url = (qs ? `${pathname}?${qs}` : pathname) + window.location.hash;
    const current = window.location.search ? window.location.pathname + window.location.search : window.location.pathname;
    if (url !== current + window.location.hash || firstSync.current) {
      // pushState хвърля на file:// (origin "null"); при преглед просто го пропускаме.
      try {
        const state = { ...window.history.state, euroProcedure: nav?.id ? nav : null };
        window.history[firstSync.current ? 'replaceState' : 'pushState'](state, "", url);
      } catch {
        /* локален file:// преглед — пропускаме синхронизацията с URL */
      }
    }
    firstSync.current = false;
  }, [filters, initialized]);

  const patch = useCallback((p) => setFilters((f) => ({ ...f, ...p })), []);

  const toggleInArray = useCallback((key, val) => {
    setFilters((f) => {
      const arr = f[key] || [];
      return { ...f, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });
  }, []);

  const clearAll = useCallback(
    () =>
      setFilters((f) => ({
        ...EMPTY_FILTERS,
        sort: f.sort,
        view: f.view,
        tab: f.tab,
        period: f.period, // overview-only — не се нулира с филтрите
        activityPeriod: f.activityPeriod, // overview-only
      })),
    []
  );

  const setQuery = useCallback((q) => patch({ q }), [patch]);
  const setSort = useCallback((sort) => patch({ sort }), [patch]);
  const setView = useCallback((view) => patch({ view }), [patch]);
  const setPeriod = useCallback((period) => patch({ period }), [patch]);
  const setActivityPeriod = useCallback((activityPeriod) => patch({ activityPeriod }), [patch]);
  const setTab = useCallback((tab) => patch({ tab, selected: null }), [patch]);
  // Клик по колона в „Активност" → таб „Процедури", филтриран по седмица и тип.
  const filterByWeek = useCallback((changeType, weekFrom, weekTo) => patch({ tab: "procedures", selected: null, changeType, weekFrom, weekTo, sort: "updated" }), [patch]);
  const clearChangeWeek = useCallback(() => patch({ changeType: "", weekFrom: "", weekTo: "" }), [patch]);
  const openProject = useCallback((id, path) => {
    if (path) navigation.current = { id, path, returnUrl: navigation.current?.returnUrl || window.location.pathname + window.location.search };
    patch({ selected: id });
  }, [patch]);
  const closeProject = useCallback(() => {
    if (navigation.current?.returnUrl) {
      const url = new URL(navigation.current.returnUrl, window.location.origin);
      navigation.current = { path: url.pathname };
      setFilters({ ...deserializeFilters(url.search), selected: null });
      return;
    }
    patch({ selected: null });
  }, [patch]);

  const toggleCompare = useCallback((id) => {
    setFilters((f) => {
      const arr = f.compare || [];
      if (arr.includes(id)) return { ...f, compare: arr.filter((x) => x !== id) };
      if (arr.length >= 3) return f; // лимит 3 — игнорираме над него
      return { ...f, compare: [...arr, id] };
    });
  }, []);

  const clearCompare = useCallback(() => patch({ compare: [] }), [patch]);

  return useMemo(
    () => ({
      filters,
      setFilters,
      patch,
      toggleInArray,
      clearAll,
      setQuery,
      setSort,
      setView,
      setPeriod,
      setActivityPeriod,
      filterByWeek,
      clearChangeWeek,
      setTab,
      openProject,
      closeProject,
      toggleCompare,
      clearCompare,
    }),
    [filters, patch, toggleInArray, clearAll, setQuery, setSort, setView, setPeriod, setActivityPeriod, filterByWeek, clearChangeWeek, setTab, openProject, closeProject, toggleCompare, clearCompare]
  );
}
