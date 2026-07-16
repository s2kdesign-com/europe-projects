"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AccountHeader from "../components/AccountHeader.jsx";
import Icon from "../components/Icon.jsx";
import { useSession } from "../hooks/useSession.js";
import { categoryMeta } from "../lib/changelog-data.js";
import { APP_VERSION, APP_VERSION_LABEL, CHANGELOG_SEEN_KEY } from "../lib/version.js";

const FILTERS = [
  { key: "all", label: "Всички" },
  { key: "feature", label: "Нови функции" },
  { key: "improvement", label: "Подобрения" },
  { key: "fix", label: "Поправки" },
  { key: "data", label: "Данни" },
];
const ROUTE_HREF = { overview: "/?tab=overview", procedures: "/?tab=procedures", calendar: "/?tab=calendar", saved: "/?tab=saved", changelog: "/changelog" };
const ROUTE_LABEL = { overview: "Обзор", procedures: "Процедури", calendar: "Календар", saved: "Запазени", changelog: "Промени" };

export default function ChangelogPage() {
  const session = useSession();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [status, setStatus] = useState("loading");
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [showTop, setShowTop] = useState(false);

  const abortRef = useRef(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);
  const seenIds = useRef(new Set());

  useEffect(() => { try { window.localStorage.setItem(CHANGELOG_SEEN_KEY, APP_VERSION); } catch { /* ignore */ } }, []);

  const fetchPage = useCallback(async (reset, curCategory, curQ, curCursor) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus(reset ? "loading" : "loading-more");
    try {
      const p = new URLSearchParams({ limit: "15" });
      if (curCursor && !reset) p.set("cursor", curCursor);
      if (curCategory && curCategory !== "all") p.set("category", curCategory);
      if (curQ) p.set("q", curQ);
      const r = await fetch("/api/changelog?" + p.toString(), { signal: ctrl.signal });
      if (!r.ok) throw new Error("http");
      const d = await r.json();
      const incoming = (d.items || []).filter((it) => { if (seenIds.current.has(it.id)) return false; seenIds.current.add(it.id); return true; });
      setItems((prev) => (reset ? d.items || [] : [...prev, ...incoming]));
      setCursor(d.nextCursor || null);
      setHasMore(!!d.hasMore);
      setStatus(reset && (d.items || []).length === 0 ? "empty" : "idle");
    } catch (e) {
      if (e.name !== "AbortError") setStatus("error");
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      seenIds.current = new Set();
      setItems([]); setCursor(null); setHasMore(true);
      window.scrollTo({ top: 0 });
      fetchPage(true, category, q, null);
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [category, q, fetchPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingRef.current) fetchPage(false, category, q, cursor);
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, cursor, category, q, fetchPage]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <AccountHeader session={session} />
      <main id="main" className="container page changelog">
        <div className="cl-head">
          <h1>Какво ново в Европроекти</h1>
          <p>Всички подобрения, нови функции, корекции и промени в данните на системата.</p>
          <div className="cl-meta">
            <span className="badge blue">{APP_VERSION_LABEL}</span>
            <span className="cl-status"><span className="live-dot" /> Системата се развива активно</span>
          </div>
        </div>

        <div className="cl-controls">
          <div className="searchbox" style={{ maxWidth: 320 }}>
            <Icon name="search" size={18} />
            <label htmlFor="cl-q" className="sr-only">Търсене в промените</label>
            <input id="cl-q" className="search" type="search" placeholder="Търсене…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="chips">
            {FILTERS.map((f) => (
              <button key={f.key} className={"chip" + (category === f.key ? " chip-on" : "")} aria-pressed={category === f.key} onClick={() => setCategory(f.key)}>{f.label}</button>
            ))}
          </div>
        </div>

        {status === "loading" && <div className="cl-timeline">{[0, 1, 2].map((i) => <div className="skeleton-card" key={i} style={{ marginBottom: 12 }}><div className="sk sk-pill" /><div className="sk sk-line sk-title" style={{ marginTop: 12 }} /><div className="sk sk-line" style={{ width: "90%" }} /></div>)}</div>}

        {status === "empty" && <div className="state ov-empty"><Icon name="search" size={28} /><h3>Няма резултати</h3><p>Опитайте с друг филтър или дума за търсене.</p></div>}

        {status === "error" && items.length === 0 && (
          <div className="state error" role="alert"><Icon name="alert" size={28} /><h3>Грешка при зареждане</h3><button className="btn btn-primary" onClick={() => fetchPage(true, category, q, null)}><Icon name="refresh" size={16} /> Опитай пак</button></div>
        )}

        {items.length > 0 && (
          <ol className="cl-timeline" aria-label="История на промените">
            {items.map((e) => {
              const cm = categoryMeta(e.category);
              return (
                <li className="cl-entry" key={e.id}>
                  <span className={"cl-dot " + cm.tone} aria-hidden="true"><Icon name={cm.icon} size={14} /></span>
                  <div className="cl-card">
                    <div className="cl-card-top">
                      <span className="cl-version">v{e.version}</span>
                      <span className={"badge " + cm.tone}>{cm.label}</span>
                      {e.published_at && <time className="cl-date" dateTime={e.published_at}>{e.published_at}</time>}
                    </div>
                    <h3 className="cl-title">{e.title}</h3>
                    {e.summary && <p className="cl-summary">{e.summary}</p>}
                    {Array.isArray(e.content) && e.content.length > 0 && (
                      <ul className="cl-list">{e.content.map((c, i) => <li key={i}>{c}</li>)}</ul>
                    )}
                    {e.affected_route && ROUTE_HREF[e.affected_route] && (
                      <a className="cl-route" href={ROUTE_HREF[e.affected_route]}><Icon name="arrowRight" size={14} /> Виж „{ROUTE_LABEL[e.affected_route]}“</a>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div ref={sentinelRef} aria-hidden="true" />
        {status === "loading-more" && <p className="cl-more"><span className="live-dot" /> Зареждане…</p>}
        {status === "error" && items.length > 0 && <p className="cl-more"><button className="btn" onClick={() => fetchPage(false, category, q, cursor)}><Icon name="refresh" size={14} /> Опитай пак</button></p>}
        {!hasMore && items.length > 0 && <p className="cl-end">Достигнахте началото на историята.</p>}

        {showTop && (
          <button className="cl-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Обратно нагоре">
            <Icon name="chevronDown" size={18} style={{ transform: "rotate(180deg)" }} />
          </button>
        )}
      </main>
    </>
  );
}
