"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "./AppHeader.jsx";
import FilterPanel from "./FilterPanel.jsx";
import ViewControls from "./ViewControls.jsx";
import ProjectCard from "./ProjectCard.jsx";
import ProjectListRow from "./ProjectListRow.jsx";
import ProjectDrawer from "./ProjectDrawer.jsx";
import CompareDrawer from "./CompareDrawer.jsx";
import DeadlineCalendar from "./DeadlineCalendar.jsx";
import Icon from "./Icon.jsx";
import { LoadingState, EmptyState, ErrorState, StaleBanner } from "./States.jsx";
import OverviewHeader from "./OverviewHeader.jsx";
import OverviewKPIs from "./OverviewKPIs.jsx";
import AttentionSection from "./AttentionSection.jsx";
import RecommendedSection from "./RecommendedSection.jsx";
import UpcomingDeadlines from "./UpcomingDeadlines.jsx";
import ChangeFeed from "./ChangeFeed.jsx";
import SavedTracked from "./SavedTracked.jsx";
import FundingCharts from "./FundingCharts.jsx";
import ProcedureActivity from "./ProcedureActivity.jsx";
import QuickActions from "./QuickActions.jsx";

import { useProjectFilters } from "../hooks/useProjectFilters.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { useSession } from "../hooks/useSession.js";
import { useSavedSync } from "../hooks/useSavedSync.js";
import {
  filterProjects, sortProjects, groupByProgram, generateICS, projectsToCSV, buildShareUrl, targetGroup, formatDate, daysLeft,
} from "../lib/project-utils.js";
import { overviewStats, attentionProjects, changeFeed, urgencyBuckets, weeklyActivity } from "../lib/overview-utils.js";
import { recommend, canRecommend } from "../lib/recommend.js";
import { downloadTextFile, copyText, slugFilename } from "../lib/browser.js";
import { LS_VIEW, MAX_COMPARE, DEFAULT_VIEW, DEFAULT_PERIOD, DEFAULT_ACTIVITY_PERIOD, ACTIVITY_PERIOD_DAYS, TABS } from "../lib/constants.js";

const PERIOD_DAYS = { "30": 30, "60": 60, "90": 90 };

async function defaultFetchList(signal) {
  const r = await fetch("/api/projects", { signal });
  if (!r.ok) throw new Error("http_" + r.status);
  return r.json();
}
async function defaultLoadDetail(id, signal) {
  const r = await fetch("/api/project?id=" + encodeURIComponent(id), { signal });
  if (!r.ok) throw new Error("http_" + r.status);
  return r.json();
}

export default function DashboardShell({ initialData = null, fetchList = defaultFetchList, loadDetail = defaultLoadDetail, now = new Date(), session: sessionOverride = null }) {
  const [state, setState] = useState(initialData ? { phase: "ready" } : { phase: "loading" });
  const [data, setData] = useState(initialData || { projects: [], snapshot: null, ok: true });
  const [retry, setRetry] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [overviewFilter, setOverviewFilter] = useState({ program: "", target: "" });
  const [acctProfile, setAcctProfile] = useState(null);
  const [drawerTab, setDrawerTab] = useState("overview");
  const toastTimer = useRef(null);

  const fx = useProjectFilters();
  const { filters } = fx;
  const period = filters.period || DEFAULT_PERIOD; // управлява само секцията „Какво е ново"
  const [storedView, setStoredView] = useLocalStorage(LS_VIEW, DEFAULT_VIEW);

  const realSession = useSession();
  const session = sessionOverride || realSession;

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const saved = useSavedSync(session, flash);

  const openProcedure = useCallback((id, tab = "overview") => { setDrawerTab(tab); fx.openProject(id); }, [fx]);
  const closeProcedure = useCallback(() => { fx.closeProject(); setDrawerTab("overview"); }, [fx]);

  useEffect(() => {
    if (initialData) return;
    const controller = new AbortController();
    let alive = true;
    if (retry === 0) setState({ phase: "loading" });
    fetchList(controller.signal)
      .then((d) => {
        if (!alive) return;
        setData({ projects: d.projects || [], snapshot: d.snapshot || null, ok: d.ok !== false });
        setState({ phase: "ready" });
        setRefreshing(false);
      })
      .catch((e) => { if (alive && e.name !== "AbortError") { setState((s) => (s.phase === "ready" ? s : { phase: "error" })); setRefreshing(false); } });
    return () => { alive = false; controller.abort(); };
  }, [retry, fetchList, initialData]);

  useEffect(() => {
    if (!session.authenticated) { setAcctProfile(null); return; }
    let a = true;
    fetch("/api/profile", { credentials: "same-origin" }).then((r) => r.json()).then((d) => { if (a) setAcctProfile(d.profile || null); }).catch(() => {});
    return () => { a = false; };
  }, [session.authenticated]);

  const viewInitRef = useRef(false);
  useEffect(() => {
    if (viewInitRef.current) return;
    viewInitRef.current = true;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("view") && storedView && storedView !== filters.view) fx.setView(storedView);
  }, [storedView, filters.view, fx]);
  useEffect(() => { if (filters.view) setStoredView(filters.view); }, [filters.view, setStoredView]);

  useEffect(() => {
    const el = document.getElementById("main");
    if (!el) return;
    let x0 = null, y0 = null, t0 = 0;
    const blocked = (t) => t && t.closest && t.closest("input,textarea,select,.segmented,.um-menu,.overlay,.cal-year,.chart-grid,.compare-scroll,.barchart,.colchart,.timeline");
    const start = (e) => { if (blocked(e.target)) { x0 = null; return; } const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); };
    const end = (e) => {
      if (x0 == null) return;
      const t = e.changedTouches[0]; const dx = t.clientX - x0, dy = t.clientY - y0, dt = Date.now() - t0; x0 = null;
      if (dt > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const order = TABS.map((x) => x.key); const i = order.indexOf(filters.tab);
      if (dx < 0 && i < order.length - 1) fx.setTab(order[i + 1]);
      else if (dx > 0 && i > 0) fx.setTab(order[i - 1]);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchend", end); };
  }, [filters.tab, fx]);

  const projects = data.projects;

  const programs = useMemo(() => [...new Set(projects.map((p) => p.program).filter(Boolean))].sort((a, b) => a.localeCompare(b, "bg")), [projects]);
  const counts = useMemo(() => {
    const status = {}, target = {}, program = {};
    for (const p of projects) {
      status[p.status] = (status[p.status] || 0) + 1;
      target[targetGroup(p)] = (target[targetGroup(p)] || 0) + 1;
      if (p.program) program[p.program] = (program[p.program] || 0) + 1;
    }
    return { status, target, program };
  }, [projects]);

  const filtered = useMemo(() => sortProjects(filterProjects(projects, filters, now), filters.sort, now), [projects, filters, now]);
  const savedIds = saved.savedIds;
  const savedProjects = useMemo(() => projects.filter((p) => savedIds.includes(p.id)), [projects, savedIds]);
  const compareProjects = useMemo(() => (filters.compare || []).map((id) => projects.find((p) => p.id === id)).filter(Boolean), [projects, filters.compare]);
  const selectedProject = useMemo(() => projects.find((p) => p.id === filters.selected) || null, [projects, filters.selected]);

  const ovProjects = useMemo(
    () => projects.filter((p) => (!overviewFilter.program || p.program === overviewFilter.program) && (!overviewFilter.target || targetGroup(p) === overviewFilter.target)),
    [projects, overviewFilter]
  );
  const periodDays = PERIOD_DAYS[period] || 30;
  const ovStats = useMemo(() => overviewStats(ovProjects, saved.savedCount, now), [ovProjects, saved.savedCount, now]);
  const attention = useMemo(() => attentionProjects(ovProjects, savedIds, saved.savedMeta, now), [ovProjects, savedIds, saved.savedMeta, now]);
  const feed = useMemo(() => changeFeed(ovProjects, now, periodDays), [ovProjects, now, periodDays]);
  // „Наближаващи срокове" НЕ зависят от периода — той управлява само „Какво е ново".
  const buckets = useMemo(() => urgencyBuckets(ovProjects, now), [ovProjects, now]);

  const activityPeriod = filters.activityPeriod || DEFAULT_ACTIVITY_PERIOD; // независим от „Какво е ново"
  const activityDays = ACTIVITY_PERIOD_DAYS[activityPeriod] || 90;
  const activity = useMemo(() => weeklyActivity(ovProjects, now, activityDays), [ovProjects, now, activityDays]);

  const profileComplete = canRecommend(acctProfile);
  const recommendations = useMemo(() => recommend(ovProjects, acctProfile, now), [ovProjects, acctProfile, now]);

  const stale = useMemo(() => { const rd = data.snapshot?.run_date; const dl = rd ? daysLeft(rd, now) : null; return dl != null && dl < -2; }, [data.snapshot, now]);

  const isSavedFn = saved.isSaved;
  const inCompareFn = useCallback((id) => (filters.compare || []).includes(id), [filters.compare]);
  const toggleSave = saved.toggleSave;

  const copyLink = useCallback(async (p) => { const ok = await copyText(buildShareUrl(window.location.origin, window.location.pathname, { selected: p.id })); flash(ok ? "Връзката е копирана" : "Копирането не бе успешно"); }, [flash]);
  const copyView = useCallback(async () => { const ok = await copyText(buildShareUrl(window.location.origin, window.location.pathname, filters)); flash(ok ? "Връзката към изгледа е копирана" : "Копирането не бе успешно"); }, [filters, flash]);
  const downloadICS = useCallback((p) => { const ics = generateICS(p, now); if (!ics) return flash("Няма крайна дата за календар"); downloadTextFile(slugFilename(p.name, "ics"), ics, "text/calendar;charset=utf-8"); flash("Свален календарен файл (.ics)"); }, [now, flash]);
  const exportCSV = useCallback((list, name = "evroproekti.csv") => { downloadTextFile(name, projectsToCSV(list, now), "text/csv;charset=utf-8"); flash(`Свалени ${list.length} процедури (CSV)`); }, [now, flash]);

  const goProcedures = useCallback((patch) => { fx.setTab("procedures"); if (patch) fx.patch(patch); }, [fx]);
  const onKpiSelect = useCallback((key) => {
    if (key === "saved") return fx.setTab("saved");
    if (key === "open") return goProcedures({ status: ["open", "closing_soon"], deadline: [], target: [] });
    if (key === "exp7") return goProcedures({ status: ["open", "closing_soon"], deadline: ["7"] });
    if (key === "exp30") return goProcedures({ status: ["open", "closing_soon"], deadline: ["30"] });
    if (key === "docs") return goProcedures({ docs: true });
    if (key === "recommended") return (window.location.href = "/profile");
    if (key === "new" || key === "changed") return goProcedures({ sort: "updated", status: [] });
    return goProcedures({});
  }, [fx, goProcedures]);

  useEffect(() => setSheetOpen(false), [filters.tab]);

  const renderCard = (p) => (
    <ProjectCard key={p.id} p={p} now={now} isSaved={isSavedFn(p.id)} inCompare={inCompareFn(p.id)} onOpen={openProcedure} onToggleSave={toggleSave} onToggleCompare={fx.toggleCompare} onCopyLink={copyLink} onCalendar={downloadICS} />
  );
  const renderRow = (p) => (
    <ProjectListRow key={p.id} p={p} now={now} isSaved={isSavedFn(p.id)} inCompare={inCompareFn(p.id)} onOpen={openProcedure} onToggleSave={toggleSave} onToggleCompare={fx.toggleCompare} />
  );

  function Results({ items }) {
    if (items.length === 0) return <EmptyState message="Няма процедури, отговарящи на избраните филтри." action={<button className="btn btn-primary" onClick={fx.clearAll}>Изчисти филтрите</button>} />;
    if (filters.view === "list") return <div className="list">{items.map(renderRow)}</div>;
    if (filters.view === "program")
      return (<>{groupByProgram(items, filters.sort, now).map(([program, arr]) => (
        <section className="program-group" key={program}><div className="program-head"><h3>{program}</h3><span className="count-dot">{arr.length}</span></div><div className="cards">{arr.map(renderCard)}</div></section>
      ))}</>);
    return <div className="cards">{items.map(renderCard)}</div>;
  }

  let content;
  if (state.phase === "loading") content = <LoadingState />;
  else if (state.phase === "error") content = <div className="page container"><ErrorState onRetry={() => setRetry((n) => n + 1)} /></div>;
  else {
    content = (
      <div className="container page">
        {stale && <StaleBanner text={`Данните са от ${formatDate(data.snapshot?.run_date)} и може да не са актуални.`} />}
        {!data.ok && <StaleBanner text="Показани са ограничени данни — връзката с базата е частична." />}

        {filters.tab === "overview" && (
          <>
            <OverviewHeader now={now} snapshot={data.snapshot} sinceVisit={null} programs={programs} overviewFilter={overviewFilter} onOverviewFilter={(patch) => setOverviewFilter((f) => ({ ...f, ...patch }))} />
            <OverviewKPIs stats={ovStats} recommendedCount={recommendations.length} hasProfile={session.authenticated && profileComplete} active={null} onSelect={onKpiSelect} />
            <AttentionSection items={attention} now={now} isSaved={isSavedFn} inCompare={inCompareFn} onOpen={openProcedure} onToggleSave={toggleSave} onToggleCompare={fx.toggleCompare} onCopyLink={copyLink} onCalendar={downloadICS} onSeeAll={() => goProcedures({ sort: "urgent" })} />
            <RecommendedSection authenticated={session.authenticated} profileComplete={profileComplete} completion={acctProfile ? acctProfile.profile_completion_percentage : session.profileCompletion} items={recommendations} onLogin={() => session.login("/")} onOpenProfile={() => (window.location.href = "/profile?onboarding=1")} isSaved={isSavedFn} inCompare={inCompareFn} onOpen={openProcedure} onToggleSave={toggleSave} onToggleCompare={fx.toggleCompare} onCopyLink={copyLink} onCalendar={downloadICS} />
            <UpcomingDeadlines buckets={buckets} now={now} isSaved={isSavedFn} savedMeta={saved.savedMeta} onOpen={openProcedure} onToggleSave={toggleSave} onCalendar={downloadICS} onOpenCalendar={() => fx.setTab("calendar")} />
            <ChangeFeed items={feed} onOpen={openProcedure} period={period} onPeriod={fx.setPeriod} />
            <SavedTracked savedProjects={savedProjects} now={now} savedMeta={saved.savedMeta} notes={saved.notes} onNote={saved.setNote} onOpen={openProcedure} onRemove={(id) => toggleSave(id)} />
            <ProcedureActivity
              activity={activity}
              period={activityPeriod}
              onPeriod={fx.setActivityPeriod}
              onSelectWeek={(changeType, from, to) => fx.filterByWeek(changeType, from, to)}
              onSeeAll={() => goProcedures({})}
            />
            <FundingCharts projects={ovProjects} now={now} />
            <QuickActions
              onSearch={() => goProcedures({})}
              onProfile={() => (window.location.href = session.authenticated ? "/profile" : "/login?returnTo=/profile")}
              onSaved={() => fx.setTab("saved")}
              onCalendar={() => fx.setTab("calendar")}
              onExport={() => exportCSV(buckets.flatMap((b) => b.items), "srokove.csv")}
              onReminder={() => { const next = buckets.flatMap((b) => b.items).find((p) => (daysLeft(p.deadline_date, now) ?? -1) >= 0); next ? downloadICS(next) : flash("Няма предстоящи срокове"); }}
              onCompare={() => goProcedures({})}
            />
          </>
        )}

        {filters.tab === "procedures" && (
          <div className="workspace">
            <aside className={"rail" + (sheetOpen ? " as-sheet" : " hidden-sheet")} onMouseDown={(e) => sheetOpen && e.target === e.currentTarget && setSheetOpen(false)}>
              <FilterPanel filters={filters} programs={programs} counts={counts} onToggle={(k, v) => (v === undefined ? fx.toggleInArray("docs") : fx.toggleInArray(k, v))} onClear={fx.clearAll} onCloseSheet={() => setSheetOpen(false)} isSheet={sheetOpen} />
            </aside>
            <div>
              <ViewControls filters={filters} resultCount={filtered.length} totalCount={projects.length} onQuery={fx.setQuery} onSort={fx.setSort} onView={fx.setView} onOpenSheet={() => setSheetOpen(true)} onRemoveChip={(c) => (c.kind === "q" ? fx.setQuery("") : c.kind === "docs" ? fx.toggleInArray("docs") : c.kind === "changeWeek" ? fx.clearChangeWeek() : fx.toggleInArray(c.kind, c.val))} onClearAll={fx.clearAll} onExportCSV={() => exportCSV(filtered)} onPrint={() => window.print()} onCopyView={copyView} />
              <Results items={filtered} />
            </div>
          </div>
        )}

        {filters.tab === "calendar" && (
          <>
            <div className="page-head"><h1>Календар на сроковете</h1><p>Крайни срокове по дни и предстоящи процедури.</p></div>
            <DeadlineCalendar projects={projects} now={now} onOpen={openProcedure} />
          </>
        )}

        {filters.tab === "saved" && (
          <>
            <div className="page-head"><h1>Запазени процедури</h1><p>{session.authenticated ? "Синхронизирани с профила ви." : "Пазят се локално в браузъра. Влезте, за да ги синхронизирате."}</p></div>
            {!session.authenticated && (
              <div className="ov-since" style={{ marginBottom: 16 }}>
                <Icon name="info" size={18} />
                <p>Запазванията са само в този браузър. <a href="/login?returnTo=/">Влезте с Google</a>, за да ги пазите в акаунта си и на други устройства.</p>
              </div>
            )}
            <SavedTracked savedProjects={savedProjects} now={now} savedMeta={saved.savedMeta} notes={saved.notes} onNote={saved.setNote} onOpen={openProcedure} onRemove={(id) => toggleSave(id)} />
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <a href="#main" className="skip-link">Към съдържанието</a>
      <AppHeader tab={filters.tab} onTab={fx.setTab} savedCount={saved.savedCount} session={session} />
      <main id="main">{content}</main>

      {selectedProject && (
        <ProjectDrawer base={selectedProject} initialTab={drawerTab} loadDetail={loadDetail} onClose={closeProcedure} isSaved={isSavedFn(selectedProject.id)} onToggleSave={toggleSave} onCopyLink={copyLink} onCalendar={downloadICS} />
      )}

      {compareProjects.length > 0 && !showCompare && (
        <div className="compare-tray" role="region" aria-label="Сравнение">
          <Icon na