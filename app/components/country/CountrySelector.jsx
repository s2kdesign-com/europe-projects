"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useCountry } from "./CountryProvider.jsx";
import { FALLBACK_FLAG } from "../../lib/country/countries.js";

export function FlagImg({ country, src: srcProp = null, size = 20 }) {
  const initial = srcProp || (country ? country.flag : FALLBACK_FLAG);
  const [src, setSrc] = useState(initial);
  useEffect(() => { setSrc(srcProp || (country ? country.flag : FALLBACK_FLAG)); }, [srcProp, country]);
  return (
    <img
      className="country-flag"
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round((size * 2) / 3)}
      loading="lazy"
      onError={() => setSrc(FALLBACK_FLAG)}
    />
  );
}

// variant: "footer" | "profile" | "modal"
export default function CountrySelector({ variant = "footer", id = "country-select", onChosen = null }) {
  const { t, i18n } = useTranslation();
  const uiLang = i18n.language;
  const { selectedCountry, supportedCountries, setCountry } = useCountry();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const label = useCallback((c) => (uiLang === "bg" ? c.nameBg : c.english), [uiLang]);
  const options = supportedCountries;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((c) =>
      c.native.toLowerCase().includes(q) || c.nameBg.toLowerCase().includes(q) ||
      c.english.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [options, query]);

  const current = options.find((c) => c.code === selectedCountry) || options[0];

  const choose = useCallback((code) => {
    setCountry(code);
    setOpen(false);
    setQuery("");
    if (onChosen) onChosen(code);
  }, [setCountry, onChosen]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
    if (open) setActive(Math.max(0, filtered.findIndex((c) => c.code === selectedCountry)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const opt = filtered[active]; if (opt) choose(opt.code); }
  };

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return (
    <div className={"country-select lang-select lang-" + variant} ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        className="lang-trigger country-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("country.select")}
        onClick={() => setOpen((v) => !v)}
      >
        <FlagImg country={current} />
        <span className="lang-current">{current ? current.native : "—"}</span>
        <span className="lang-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="lang-panel" role="dialog" aria-label={t("country.select")}>
          <div className="lang-search">
            <input
              ref={searchRef}
              type="text"
              className="inp inp-sm"
              placeholder={t("country.search")}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              aria-label={t("country.search")}
              aria-controls={id + "-list"}
            />
          </div>
          <ul className="lang-list" id={id + "-list"} role="listbox" ref={listRef} aria-label={t("country.select")}>
            {filtered.length === 0 && <li className="lang-empty" role="option" aria-disabled="true">{t("country.noResults")}</li>}
            {filtered.map((c, i) => {
              const selected = c.code === selectedCountry;
              return (
                <li
                  key={c.code}
                  data-idx={i}
                  role="option"
                  aria-selected={selected}
                  className={"lang-option country-option" + (selected ? " is-current" : "") + (i === active ? " is-active" : "")}
                  onClick={() => choose(c.code)}
                  onMouseEnter={() => setActive(i)}
                >
                  <FlagImg country={c} />
                  <span className="lang-native">{c.native}</span>
                  {label(c) !== c.native && <span className="lang-label">{label(c)}</span>}
                  <span className={"country-status " + (c.enabled ? "on" : "soon")}>
                    {c.enabled ? t("country.active") : t("country.comingSoon")}
                  </span>
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
