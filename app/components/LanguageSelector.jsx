"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES } from "../lib/i18n/locales.js";
import { useLanguage } from "./i18n/I18nProvider.jsx";
import { useSession } from "../hooks/useSession.js";

function GlobeIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
    </svg>
  );
}

// Синхронизира ръчния избор към профила на логнат потребител (между устройства).
async function syncProfileLanguage(code) {
  try {
    await fetch("/api/profile/language", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: code, mode: "manual" }),
    });
  } catch { /* грешката не бива да чупи UI-а; локалният избор вече е приложен */ }
}

export default function LanguageSelector({ variant = "footer", id = "lang-select" }) {
  const { t } = useTranslation();
  const { lang, setLanguage } = useLanguage();
  const session = useSession();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0); // индекс на маркирания за клавиатура
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const options = useMemo(() => SUPPORTED_LOCALES.filter((l) => l.enabled), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((l) =>
      l.native.toLowerCase().includes(q) || l.label.toLowerCase().includes(q) || l.code.includes(q)
    );
  }, [options, query]);

  const current = options.find((l) => l.code === lang) || options[0];

  const choose = useCallback((code) => {
    setLanguage(code);
    if (session.authenticated) syncProfileLanguage(code);
    setOpen(false);
    setQuery("");
  }, [setLanguage, session.authenticated]);

  // Затваряне при клик навън / Esc.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Фокус върху търсенето при отваряне.
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
    if (open) setActive(Math.max(0, filtered.findIndex((l) => l.code === lang)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const opt = filtered[active]; if (opt) choose(opt.code); }
  };

  // Скрол на маркирания в изгледа.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return (
    <div className={"lang-select lang-" + variant} ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        className="lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language.globeLabel")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="lang-globe"><GlobeIcon /></span>
        <span className="lang-current">{current?.native}</span>
        <span className="lang-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="lang-panel" role="dialog" aria-label={t("language.selectLanguage")}>
          <div className="lang-search">
            <input
              ref={searchRef}
              type="text"
              className="inp inp-sm"
              placeholder={t("language.searchPlaceholder")}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              aria-label={t("language.searchPlaceholder")}
              aria-controls={id + "-list"}
            />
          </div>
          <ul className="lang-list" id={id + "-list"} role="listbox" ref={listRef} aria-label={t("language.selectLanguage")}>
            {filtered.length === 0 && <li className="lang-empty" role="option" aria-disabled="true">{t("language.noResults")}</li>}
            {filtered.map((l, i) => {
              const selected = l.code === lang;
              return (
                <li
                  key={l.code}
                  data-idx={i}
                  role="option"
                  aria-selected={selected}
                  className={"lang-option" + (selected ? " is-current" : "") + (i === active ? " is-active" : "")}
                  onClick={() => choose(l.code)}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="lang-native">{l.native}</span>
                  {l.label !== l.native && <span className="lang-label">{l.label}</span>}
                  {selected && <span className="lang-check" aria-hidden="true">✓</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
