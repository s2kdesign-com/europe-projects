"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_FILTERS,
  deserializeFilters,
  serializeFilters,
} from "../lib/project-utils.js";

// Управлява състоянието на филтрите и го синхронизира с URL (URLSearchParams),
// така че търсене, филтри, сортиране и изглед оцеляват при reload и назад/напред,
// и връзката може да се сподели.
export function useProjectFilters() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const skipNextSync = useRef(false);

  // Първоначално четене от URL (само на клиента).
  useEffect(() => {
    setFilters(deserializeFilters(window.location.search));
    const onPop = () => {
      skipNextSync.current = true; // това е браузърна навигация, не наш push
      setFilters(deserializeFilters(window.location.search));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Запис на състоянието в URL при промяна.
  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    const qs = serializeFilters(filters);
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    const current = window.location.search ? window.location.pathname + window.location.search : window.location.pathname;
    if (url !== current) {
      // pushState хвърля на file:// (origin "null"); при преглед просто го пропускаме.
      try {
        window.history.pushState(null, "", url);
      } catch {
        /* локален file:// преглед — пропускаме синхронизацията с URL */
      }
    }
  }, [filters]);

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
  const openProject = useCallback((id) => patch({ selected: id }), [patch]);
  const closeProject = useCallback(() => patch({ selected: null }), [patch]);

  const toggleCompare = useCallback((id) => {
    setFilters((f) => {
      const arr = f