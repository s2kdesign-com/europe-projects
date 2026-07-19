"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import Markdown from "./Markdown.jsx";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { useUiTranslate } from "../lib/i18n/ui-translate.js";
import { daysLeft, countdownLabel, formatDate, isNovel, targetGroup } from "../lib/project-utils.js";

const TABS = [
  { key: "overview", label: "Обзор" },
  { key: "eligible", label: "Допустими кандидати" },
  { key: "funding", label: "Финансиране" },
  { key: "deadlines", label: "Срокове" },
  { key: "documents", label: "Документи" },
  { key: "sources", label: "Официални източници" },
];

// Всички статични етикети, които трябва да се преведат при en/de (source: bg).
const LABELS = [
  "Ново", "Младежи", "Затвори", "Секции",
  "Данните не се заредиха", "Пълните детайли за тази процедура не можаха да бъдат изтеглени.",
  "Статус", "Приоритет", "Бележки", "Проследяване", "Първо видяно", "Обновено",
  "Допустими кандидати", "Няма конкретна информация в проследяваните данни.",
  "Бюджет / финансиране", "Краен срок", "Няма обявен срок", "Както е обявено",
  "Зареждане на документите…", "Няма прикачени документи.", "Документ", "Източник",
  "Официална страница на процедурата", "Няма официална връзка в проследяваните данни.",
  "Запазена", "Запази", "Копирай връзка", "Календар (.ics)", "Официална страница",
  "Обзор", "Финансиране", "Срокове", "Документи", "Официални източници", "отворена",
];

export default function ProjectDrawer({ base, initialTab = "overview", loadDetail, onClose, isSaved, onToggleSave, onCopyLink, onCalendar }) {
  const tl = useUiTranslate(LABELS);
  const [tab, setTab] = useState(initialTab);
  const [detail, setDetail] = useState(null); // { project, documents }
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openDoc, setOpenDoc] = useState(null);
  const trapRef = useFocusTrap(true, onClose);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setTab(initialTab); // започваме от подадения таб (Обзор или Документи)
    loadDetail(base.id, controller.signal)
      .then((d) => {
        if (alive) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive && e.name !== "AbortError") {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [base.id, initialTab, loadDetail]);

  const p = detail?.project || base; // светкавичен header от лекия списък
  const docs = detail?.documents || [];
  const dl = daysLeft(p.deadline_date);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" ref={trapRef}>
        <div className="drawer-head">
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusBadge status={p.status} />
              {isNovel(p) && <span className="badge new"><Icon name="sparkle" size={14} /> {tl("Ново")}</span>}
              {targetGroup(p) === "youth" && <span className="badge youth"><Icon name="users" size={14} /> {tl("Младежи")}</span>}
            </div>
            <h2 id="drawer-title">{p.name}</h2>
            {p.program && <div className="card-prog" style={{ marginTop: 4 }}>{p.program}</div>}
          </div>
          <button className="drawer-close" onClick={onClose} aria-label={tl("Затвори")}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="drawer-tabs" role="tablist" aria-label={tl("Секции")}>
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              id={"tab-" + t.key}
              aria-selected={tab === t.key}
              aria-controls="drawer-panel"
              className="drawer-tab"
              onClick={() => setTab(t.key)}
            >
              {tl(t.label)}
              {t.key === "documents" && p.doc_count ? ` (${p.doc_count})` : ""}
            </button>
          ))}
        </div>

        <div className="drawer-body" id="drawer-panel" role="tabpanel" aria-labelledby={"tab-" + tab}>
          {error && (
            <div className="state error">
              <Icon name="alert" size={28} />
              <h3>{tl("Данните не се заредиха")}</h3>
              <p>{tl("Пълните детайли за тази процедура не можаха да бъдат изтеглени.")}</p>
            </div>
          )}

          {tab === "overview" && (
            <>
              <dl className="def">
                <dt>{tl("Статус")}</dt>
                <dd>{statusLabelWithCountdown(p, dl, tl)}</dd>
              </dl>
              {p.priority && (
                <dl className="def"><dt>{tl("Приоритет")}</dt><dd>{p.priority}</dd></dl>
              )}
              {p.notes && (
                <dl className="def"><dt>{tl("Бележки")}</dt><dd><Markdown text={p.notes} /></dd></dl>
              )}
              <dl className="def">
                <dt>{tl("Проследяване")}</dt>
                <dd>
                  {p.first_seen && <>{tl("Първо видяно")}: {formatDate(p.first_seen)}<br /></>}
                  {p.last_updated && <>{tl("Обновено")}: {formatDate(p.last_updated)}</>}
                </dd>
              </dl>
            </>
          )}

          {tab === "eligible" && (
            <dl className="def">
              <dt>{tl("Допустими кандидати")}</dt>
              <dd>{p.eligible || tl("Няма конкретна информация в проследяваните данни.")}</dd>
            </dl>
          )}

          {tab === "funding" && (
            <dl className="def">
              <dt>{tl("Бюджет / финансиране")}</dt>
              <dd>{p.budget || tl("Няма конкретна информация в проследяваните данни.")}</dd>
            </dl>
          )}

          {tab === "deadlines" && (
            <>
              <dl className="def">
                <dt>{tl("Краен срок")}</dt>
                <dd>
                  {p.deadline_date ? (
                    <time dateTime={p.deadline_date}>{formatDate(p.deadline_date)}</time>
                  ) : (
                    p.deadline || tl("Няма обявен срок")
                  )}
                  {dl != null && (p.status === "open" || p.status === "closing_soon") && (
                    <> — <strong>{countdownLabel(dl)}</strong></>
                  )}
                </dd>
              </dl>
              {p.deadline && p.deadline_date && (
                <dl className="def"><dt>{tl("Както е обявено")}</dt><dd>{p.deadline}</dd></dl>
              )}
            </>
          )}

          {tab === "documents" && (
            <>
              {loading && <p className="prose">{tl("Зареждане на документите…")}</p>}
              {!loading && docs.length === 0 && <p className="prose">{tl("Няма прикачени документи.")}</p>}
              {docs.map((d) => {
                const open = openDoc === d.id;
                return (
                  <div className="doc-item" key={d.id}>
                    <button className="doc-toggle" aria-expanded={open} onClick={() => setOpenDoc(open ? null : d.id)}>
                      <Icon name="document" size={16} />
                      {d.title || d.doc_type || tl("Документ")}
                      {d.doc_type && <span className="doc-type-tag">{d.doc_type}</span>}
                      <Icon name="chevronRight" size={16} className="caret" />
                    </button>
                    {open && (
                      <div className="doc-content">
                        <Markdown text={d.content} />
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
            </>
          )}

          {tab === "sources" && (
            <div className="linklist">
              {p.link ? (
                <a href={p.link} target="_blank" rel="noreferrer">
                  <Icon name="external" size={16} /> {tl("Официална страница на процедурата")}
                </a>
              ) : (
                <p className="prose">{tl("Няма официална връзка в проследяваните данни.")}</p>
              )}
              {docs
                .filter((d) => d.source_url)
                .map((d) => (
                  <a key={d.id} href={d.source_url} target="_blank" rel="noreferrer">
                    <Icon name="external" size={16} /> {d.title || tl("Източник")}
                  </a>
                ))}
            </div>
          )}
        </div>

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
