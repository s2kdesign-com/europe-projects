"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import Markdown from "./Markdown.jsx";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { useUiTranslate } from "../lib/i18n/ui-translate.js";
import { PROCEDURE_SECTIONS, sectionIdForTab, sortDocuments } from "../lib/procedure-sections.js";
import { daysLeft, countdownLabel, formatDate, isNovel, targetGroup } from "../lib/project-utils.js";

const DOCS_PAGE = 5; // при много документи: показани първоначално (после „Покажи още").

// Статични етикети (превод при en/de; при bg → оригинал).
const LABELS = [
  ...PROCEDURE_SECTIONS.map((s) => s.label),
  "Ново", "Младежи", "Затвори",
  "Данните не се заредиха", "Пълните детайли за тази процедура не можаха да бъдат изтеглени.",
  "Статус", "Приоритет", "Бележки", "Проследяване", "Първо видяно", "Обновено",
  "Не са открити достатъчно структурирани данни. Проверете официалната документация.",
  "Няма открит структуриран общ бюджет.", "Краен срок", "Няма обявен срок", "Както е обявено",
  "Зареждане на документите…", "Няма публикувани документи към тази процедура.",
  "Документ", "Източник", "Покажи още документи", "Отвори документа", "Оригинален файл",
  "Документът е наличен, но подробният анализ временно не може да бъде зареден.",
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

// Тялото на един документ (резюме + действия). Ползва се и в разгънатия единичен
// документ, и в отворен елемент от списъка — без дублиране на реализацията.
function DocumentBody({ d, td, tl }) {
  const hasContent = !!(d.content && String(d.content).trim());
  return (
    <div className="doc-content">
      {hasContent ? <Markdown text={td(d.content)} />
        : <p className="drawer-empty">{tl("Документът е наличен, но подробният анализ временно не може да бъде зареден.")}</p>}
      {d.source_url && (
        <div className="doc-actions">
          <a className="btn btn-ghost btn-sm" href={d.source_url} target="_blank" rel="noreferrer">
            <Icon name="external" size={14} /> {tl("Отвори документа")}
          </a>
          <a className="doc-origin" href={d.source_url} target="_blank" rel="noreferrer">
            {tl("Оригинален файл")}
          </a>
        </div>
      )}
    </div>
  );
}

export default function ProjectDrawer({ base, initialTab = "overview", loadDetail, onClose, isSaved, onToggleSave, onCopyLink, onCalendar }) {
  const tl = useUiTranslate(LABELS);
  const [detail, setDetail] = useState(null); // { project, documents }
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openDocs, setOpenDocs] = useState(() => new Set());
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
    setOpenDocs(new Set());
    didInitScroll.current = false;
    // Едно зареждане на детайла (вкл. документите) — без дублиращи заявки при секции.
    loadDetail(base.id, controller.signal)
      .then((d) => { if (alive) { setDetail(d); setLoading(false); } })
      .catch((e) => { if (alive && e.name !== "AbortError") { setError(true); setLoading(false); } });
    return () => { alive = false; controller.abort(); };
  }, [base.id, loadDetail]);

  const docs = useMemo(() => sortDocuments(detail?.documents || []), [detail]);

  // При повече от 1 документ първият (най-важният) е разгънат по подразбиране.
  useEffect(() => {
    if (docs.length > 1) setOpenDocs(new Set([docs[0].id]));
  }, [docs]);

  // Backward compat: стар initialTab / ?tab= / #hash → scroll до секцията. Иначе — отгоре.
  useEffect(() => {
    if (didInitScroll.current) return;
    const hash = typeof window !== "undefined" ? (window.location.hash || "").replace("#", "") : "";
    const id = (hash && PROCEDURE_SECTIONS.some((s) => s.id === hash) ? hash : null) || sectionIdForTab(initialTab);
    if (!id || id === "procedure-overview") { didInitScroll.current = true; if (scrollRef.current) scrollRef.current.scrollTop = 0; return; }
    const el = scrollRef.current?.querySelector("#" + id);
    if (el) { el.scrollIntoView({ block: "start" }); didInitScroll.current = true; }
  }, [detail, initialTab]);

  const toggleDoc = (id) => setOpenDocs((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const p = detail?.project || base;
  const dl = daysLeft(p.deadline_date);
  const single = docs.length === 1 ? docs[0] : null;
  const shownDocs = showAllDocs ? docs : docs.slice(0, DOCS_PAGE);
  // В „Официални източници" показваме само уникални източници — документите вече са
  // показани в своята секция (с „Отвори документа"), затова не ги дублираме тук.
  const extraSources = docs.filter((d) => d.source_url && d.source_url !== p.link && docs.length > 1);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" ref={trapRef}>
        {/* Компактен sticky header: статус, заглавие, програма, затваряне. */}
        <div className="drawer-head">
          <div className="drawer-head-main">
            <div className="drawer-badges">
              <StatusBadge status={p.status} />
              {isNovel(p) && <span className="badge new"><Icon name="sparkle" size={14} /> {tl("Ново")}</span>}
              {targetGroup(p) === "youth" && <span className="badge youth"><Icon name="users" size={14} /> {tl("Младежи")}</span>}
            </div>
            <h2 id="drawer-title">{td(p.name)}</h2>
            {p.program && <div className="card-prog">{td(p.program)}</div>}
          </div>
          <button className="drawer-close" onClick={onClose} aria-label={tl("Затвори")}><Icon name="close" size={20} /></button>
        </div>

        {/* Единичен вертикален скрол — всички секции една след друга. */}
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
            {!loading && docs.length === 0 && <p className="drawer-empty">{tl("Няма публикувани документи към тази процедура.")}</p>}

            {/* Точно 1 документ → винаги разгънат, без accordion бутон. */}
            {single && (
              <div className="doc-item doc-single">
                <div className="doc-single-head">
                  <Icon name="document" size={16} />
                  <h4 className="doc-single-title">{td(single.title) || td(single.doc_type) || tl("Документ")}</h4>
                  {single.doc_type && <span className="doc-type-tag">{td(single.doc_type)}</span>}
                </div>
                <DocumentBody d={single} td={td} tl={tl} />
              </div>
            )}

            {/* 2+ документа → списък с разгъване (първият отворен). */}
            {docs.length > 1 && shownDocs.map((d) => {
              const open = openDocs.has(d.id);
              return (
                <div className="doc-item" key={d.id}>
                  <button className="doc-toggle" aria-expanded={open} aria-controls={"doc-" + d.id} onClick={() => toggleDoc(d.id)}>
                    <Icon name="document" size={16} />
                    {td(d.title) || td(d.doc_type) || tl("Документ")}
                    {d.doc_type && <span className="doc-type-tag">{td(d.doc_type)}</span>}
                    <Icon name="chevronRight" size={16} className="caret" />
                  </button>
                  {open && <div id={"doc-" + d.id}><DocumentBody d={d} td={td} tl={tl} /></div>}
                </div>
              );
            })}
            {docs.length > 1 && !showAllDocs && docs.length > DOCS_PAGE && (
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
              {extraSources.map((d) => (
                <a key={d.id} href={d.source_url} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> {td(d.title) || tl("Източник")}</a>
              ))}
            </div>
            <p className="drawer-disclaimer">
              <Icon name="info" size={14} /> {tl("Информацията е структурирана с помощта на AI. При кандидатстване винаги проверявайте официалната страница и документацията.")}
            </p>
          </Section>
        </div>

        {/* Sticky footer действия */}
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
