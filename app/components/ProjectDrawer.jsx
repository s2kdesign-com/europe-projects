"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import Markdown from "./Markdown.jsx";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { useUiTranslate } from "../lib/i18n/ui-translate.js";
import { PROCEDURE_SECTIONS, sectionIdForTab } from "../lib/procedure-sections.js";
import { daysLeft, countdownLabel, formatDate, isNovel, targetGroup } from "../lib/project-utils.js";

const DOCS_PAGE = 5; // първоначално показани документи (после „Покажи още").

// Статични етикети (превод при en/de; при bg → оригинал).
const LABELS = [
  ...PROCEDURE_SECTIONS.map((s) => s.label),
  "Ново", "Младежи", "Затвори", "Към секция",
  "Данните не се заредиха", "Пълните детайли за тази процедура не можаха да бъдат изтеглени.",
  "Статус", "Приоритет", "Бележки", "Проследяване", "Първо видяно", "Обновено",
  "Не са открити достатъчно структурирани данни. Проверете официалната документация.",
  "Няма открит структуриран общ бюджет.", "Краен срок", "Няма обявен срок", "Както е обявено",
  "Зареждане на документите…", "Няма публикувани документи.", "Документ", "Източник", "Покажи още документи",
  "Официална страница на процедурата", "Няма официална връзка в проследяваните данни.",
  "Информацията е структурирана с помощта на AI. При кандидатстване винаги проверявайте официалната страница и документацията.",
  "Запазена", "Запази", "Копирай връзка", "Календар (.ics)", "Официална страница", "отворена",
];

function Section({ id, icon, title, count, children }) {
  return (
    <section id={id} className="drawer-section" aria-labelledby={id + "-title"}>
      <div className="drawer-section-head">
        <Icon name={icon} size={18} />
        <h3 id={id + "-title"}>{title}</h3>
        {count != null && <span className="drawer-section-count">{count}</span>}
      </div>
      {children}
    </section>
  );
}

export default function ProjectDrawer({ base, initialTab = "overview", loadDetail, onClose, isSaved, onToggleSave, onCopyLink, onCalendar }) {
  const tl = useUiTranslate(LABELS);
  const [detail, setDetail] = useState(null); // { project, documents }
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openDoc, setOpenDoc] = useState(null);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const trapRef = useFocusTrap(true, onClose);
  const scrollRef = useRef(null);
  const didInitScroll = useRef(false);

  // Превод на ДАННИТЕ (име/програма/бюджет/кандидати/срок/бележки) + документите.
  const dataStrings = useMemo(() => {
    const pp = detail?.project || base;
    const out = [];
    for (const v of [pp.name, pp.program, pp.priority, pp.notes, pp.eligible, pp.budget, pp.deadline]) if (v) out.push(String(v));
    for (const d of (detail?.documents || [])) for (const v of [d.title, d.doc_type, d.content]) if (v) out.push(String(v));
    return out;
  }, [detail, base]);
  const td = useUiTranslate(dataStrings);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setShowAllDocs(false);
    didInitScroll.current = false;
    loadDetail(base.id, controller.signal)
      .then((d) => { if (alive) { setDetail(d); setLoading(false); } })
      .catch((e) => { if (alive && e.name !== "AbortError") { setError(true); setLoading(false); } });
    return () => { alive = false; controller.abort(); };
  }, [base.id, loadDetail]);

  // При отваряне: ако е поискана конкретна секция (стар initialTab / „Документи" бутон) —
  // скрол до нея (backward compat). Иначе оставаме отгоре. Изпълнява се веднъж.
  useEffect(() => {
    if (didInitScroll.current) return;
    const id = sectionIdForTab(initialTab);
    if (!id || initialTab === "overview") { didInitScroll.current = true; if (scrollRef.current) scrollRef.current.scrollTop = 0; return; }
    const el = scrollRef.current?.querySelector("#" + id);
    if (el) { el.scrollIntoView({ block: "start" }); didInitScroll.current = true; }
  }, [detail, initialTab]);

  const goTo = (id) => {
    const el = scrollRef.current?.querySelector("#" + id);
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const p = detail?.project || base;
  const docs = detail?.documents || [];
  const dl = daysLeft(p.deadline_date);
  const shownDocs = showAllDocs ? docs : docs.slice(0, DOCS_PAGE);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" ref={trapRef}>
        {/* Sticky header */}
        <div className="drawer-head">
          <div className="drawer-head-main">
            <div className="drawer-badges">
              <StatusBadge status={p.status} />
              {isNovel(p) && <span className="badge new"><Icon name="sparkle" size={14} /> {tl("Ново")}</span>}
              {targetGroup(p) === "youth" && <span className="badge youth"><Icon name="users" size={14} /> {tl("Младежи")}</span>}
            </div>
            <h2 id="drawer-title">{td(p.name)}</h2>
            {p.program && <div className="card-prog">{td(p.program)}</div>}
            <label className="drawer-quicknav">
              <span className="sr-only">{tl("Към секция")}</span>
              <select
                className="select"
                value=""
                onChange={(e) => { if (e.target.value) goTo(e.target.value); }}
                aria-label={tl("Към секция")}
              >
                <option value="">{tl("Към секция")}…</option>
                {PROCEDURE_SECTIONS.map((s) => <option key={s.id} value={s.id}>{tl(s.label)}</option>)}
              </select>
            </label>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label={tl("Затвори")}><Icon name="close" size={20} /></button>
        </div>

        {/* Vertical scroll — всички секции една след друга */}
        <div className="drawer-scroll" ref={scrollRef}>
          {error && (
            <div className="state error">
              <Icon name="alert" size={28} />
              <h3>{tl("Данните не се заредиха")}</h3>
              <p>{tl("Пълните детайли за тази процедура не можаха да бъдат изтеглени.")}</p>
            </div>
          )}

          <Section id="procedure-overview" icon="info" title={tl("Обзор")}>
            <dl className="def"><dt>{tl("Статус")}</dt><dd>{statusLabelWithCountdown(p, dl, tl)}</dd></dl>
            {p.priority && <dl className="def"><dt>{tl("Приоритет")}</dt><dd>{td(p.priority)}</dd></dl>}
            {p.notes && <dl className="def"><dt>{tl("Бележки")}</dt><dd><Markdown text={td(p.notes)} /></dd></dl>}
            <dl className="def"><dt>{tl("Проследяване")}</dt><dd>
              {p.first_seen && <>{tl("Първо видяно")}: {formatDate(p.first_seen)}<br /></>}
              {p.last_updated && <>{tl("Обновено")}: {formatDate(p.last_updated)}</>}
            </dd></dl>
          </Section>

          <Section id="procedure-applicants" icon="users" title={tl("Допустими кандидати")}>
            {p.eligible ? <p className="drawer-prose">{td(p.eligible)}</p>
              : <p className="drawer-empty">{tl("Не са открити достатъчно структурирани данни. Проверете официалната документация.")}</p>}
          </Section>

          <Section id="procedure-financing" icon="euro" title={tl("Финансиране")}>
            {p.budget ? <p className="drawer-prose">{td(p.budget)}</p>
              : <p className="drawer-empty">{tl("Няма открит структуриран общ бюджет.")}</p>}
          </Section>

          <Section id="procedure-deadlines" icon="clock" title={tl("Срокове")}>
            <dl className="def"><dt>{tl("Краен срок")}</dt><dd>
              {p.deadline_date ? <time dateTime={p.deadline_date}>{formatDate(p.deadline_date)}</time>
                : (p.deadline ? td(p.deadline) : tl("Няма обявен срок"))}
              {dl != null && (p.status === "open" || p.status === "closing_soon") && <> — <strong>{countdownLabel(dl)}</strong></>}
            </dd></dl>
            {p.deadline && p.deadline_date && <dl className="def"><dt>{tl("Както е обявено")}</dt><dd>{td(p.deadline)}</dd></dl>}
          </Section>

          <Section id="procedure-documents" icon="document" title={tl("Документи")} count={docs.length || null}>
            {loading && <p className="drawer-prose">{tl("Зареждане на документите…")}</p>}
            {!loading && docs.length === 0 && <p className="drawer-empty">{tl("Няма публикувани документи.")}</p>}
            {shownDocs.map((d) => {
              const open = openDoc === d.id;
              return (
                <div className="doc-item" key={d.id}>
                  <button className="doc-toggle" aria-expanded={open} onClick={() => setOpenDoc(open ? null : d.id)}>
                    <Icon name="document" size={16} />
                    {td(d.title) || td(d.doc_type) || tl("Документ")}
                    {d.doc_type && <span className="doc-type-tag">{td(d.doc_type)}</span>}
                    <Icon name="chevronRight" size={16} className="caret" />
                  </button>
                  {open && (
                    <div className="doc-content">
                      <Markdown text={td(d.content)} />
                      {d.source_url && (
                        <a className="link" href={d.source_url} target="_blank" rel="noreferrer">
                          <Icon name="external" size={14} /> {tl("Източник")}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!showAllDocs && docs.length > DOCS_PAGE && (
              <button className="btn btn-ghost drawer-morebtn" onClick={() => setShowAllDocs(true)}>
                <Icon name="chevronDown" size={15} /> {tl("Покажи още документи")} ({docs.length - DOCS_PAGE})
              </button>
            )}
          </Section>

          <Section id="procedure-sources" icon="external" title={tl("Официални източници")}>
            <div className="linklist">
              {p.link ? (
                <a href={p.link} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> {tl("Официална страница на процедурата")}</a>
              ) : (
                <p className="drawer-empty">{tl("Няма официална връзка в проследяваните данни.")}</p>
              )}
              {docs.filter((d) => d.source_url).map((d) => (
                <a key={d.id} href={d.source_url} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> {td(d.title) || tl("Източник")}</a>
              ))}
            </div>
            <p className="drawer-disclaimer">
              <Icon name="info" size={14} /> {tl("Информацията е структурирана с помощта на AI. При кандидатстване винаги проверявайте официалната страница и документацията.")}
            </p>
          </Section>
        </div>

        {/* Sticky footer actions */}
        <div className="drawer-actions">
          <button className={"btn" + (isSaved ? " btn-primary" : "")} onClick={() => onToggleSave(p.id)} aria-pressed={isSaved}>
            <Icon name={isSaved ? "bookmarkFilled" : "bookmark"} size={16} /> {isSaved ? tl("Запазена") : tl("Запази")}
          </button>
          <button className="btn" onClick={() => onCopyLink(p)}>
            <Icon name="link" size={16} /> {tl("Копирай връзка")}
          </button>
          {p.deadline_date && (
            <button className="btn" onClick={() => onCalendar(p)}>
              <Icon name="calendar" size={16} /> {tl("Календар (.ics)")}
            </button>
          )}
          {p.link && (
            <a className="btn" href={p.link} target="_blank" rel="noreferrer">
              <Icon name="external" size={16} /> {tl("Официална страница")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabelWithCountdown(p, dl, tl) {
  const isOpen = p.status === "open" || p.status === "closing_soon";
  if (isOpen && dl != null) {
    return (
      <>
        {p.deadline_date ? formatDate(p.deadline_date) : tl("отворена")} — <strong>{countdownLabel(dl)}</strong>
      </>
    );
  }
  return p.deadline || "—";
}
