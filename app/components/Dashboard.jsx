"use client";

import { useMemo, useState } from "react";

const STATUS_META = {
  open: { label: "Отворена", cls: "st-open" },
  closing_soon: { label: "Изтича скоро", cls: "st-closing" },
  upcoming: { label: "Предстояща", cls: "st-upcoming" },
  closed: { label: "Приключена", cls: "st-closed" },
};

const STATUS_ORDER = { open: 0, closing_soon: 1, upcoming: 2, closed: 3 };

const CATEGORY_META = {
  youth: { label: "Младежка заетост", icon: "👥" },
  new: { label: "Ново", icon: "⚡" },
  other: { label: "Други", icon: "📋" },
};

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T23:59:59");
  if (isNaN(d)) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("bg-BG", { day: "2-digit", month: "long", year: "numeric" });
}

// Лек Markdown -> React (заглавия, удебелен текст, списъци, параграфи)
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const out = [];
  let list = null;
  const inline = (s, key) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={key + "-" + i}>{p.slice(2, -2)}</strong>
      ) : (
        <span key={key + "-" + i}>{p}</span>
      )
    );
  };
  const flush = (k) => {
    if (list) {
      out.push(<ul key={"ul" + k}>{list}</ul>);
      list = null;
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(i); return; }
    if (line.startsWith("### ")) { flush(i); out.push(<h5 key={i}>{inline(line.slice(4), i)}</h5>); }
    else if (line.startsWith("## ")) { flush(i); out.push(<h4 key={i}>{inline(line.slice(3), i)}</h4>); }
    else if (line.startsWith("# ")) { flush(i); out.push(<h4 key={i}>{inline(line.slice(2), i)}</h4>); }
    else if (line.startsWith("- ")) { if (!list) list = []; list.push(<li key={i}>{inline(line.slice(2), i)}</li>); }
    else { flush(i); out.push(<p key={i}>{inline(line, i)}</p>); }
  });
  flush("end");
  return out;
}

export default function Dashboard({ projects, documents = [], snapshot, ok }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const docsByProject = useMemo(() => {
    const m = new Map();
    for (const d of documents) {
      if (!m.has(d.project_id)) m.set(d.project_id, []);
      m.get(d.project_id).push(d);
    }
    return m;
  }, [documents]);

  const stats = useMemo(() => {
    const s = { total: projects.length, open: 0, upcoming: 0, youth: 0, docs: documents.length };
    for (const p of projects) {
      if (p.status === "open" || p.status === "closing_soon") s.open++;
      if (p.status === "upcoming") s.upcoming++;
      if (p.category === "youth") s.youth++;
    }
    return s;
  }, [projects, documents]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = projects.filter((p) => {
      if (filter === "open" && !(p.status === "open" || p.status === "closing_soon")) return false;
      if (filter === "upcoming" && p.status !== "upcoming") return false;
      if (filter === "youth" && p.category !== "youth") return false;
      if (filter === "archive" && p.status !== "closed") return false;
      if (!q) return true;
      return (
        (p.name || "").toLowerCase().includes(q) ||
        (p.program || "").toLowerCase().includes(q) ||
        (p.eligible || "").toLowerCase().includes(q) ||
        (p.notes || "").toLowerCase().includes(q)
      );
    });
    const map = new Map();
    for (const p of filtered) {
      const key = p.program || "Други";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
          (a.deadline_date || "").localeCompare(b.deadline_date || "")
      );
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [projects, query, filter]);

  return (
    <main className="wrap">
      <header className="hero">
        <div className="hero-inner">
          <div>
            <h1>Европроекти <span className="dot">•</span> Дашборд</h1>
            <p className="sub">Активни, предстоящи и архивни европроцедури за България · фокус младежка заетост</p>
          </div>
          <div className="updated">
            {snapshot?.run_date ? (
              <><span className="live" /> Обновено: <strong>{fmtDate(snapshot.run_date)}</strong></>
            ) : (
              <>Автоматично обновяване всеки ден в 08:08</>
            )}
          </div>
        </div>
      </header>

      {snapshot?.summary && (
        <section className="banner">
          <span className="banner-ico">⚡</span>
          <p>{snapshot.summary}</p>
        </section>
      )}

      <section className="stats">
        <Stat n={stats.total} label="Общо процедури" tone="t-blue" />
        <Stat n={stats.open} label="Отворени сега" tone="t-green" />
        <Stat n={stats.upcoming} label="Предстоящи" tone="t-amber" />
        <Stat n={stats.docs} label="Документи" tone="t-purple" />
      </section>

      <section className="toolbar">
        <input
          className="search"
          placeholder="Търси по име, програма, бенефициент…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {[
            ["all", "Всички"],
            ["open", "Отворени"],
            ["upcoming", "Предстоящи"],
            ["youth", "Младежки"],
            ["archive", "Архив"],
          ].map(([k, l]) => (
            <button key={k} className={"chip" + (filter === k ? " chip-on" : "")} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      </section>

      {!ok && (
        <p className="empty">
          Базата данни все още не е свързана към този изглед. При деплой в Cloudflare процедурите ще се заредят автоматично.
        </p>
      )}

      {ok && groups.length === 0 && <p className="empty">Няма процедури, отговарящи на филтъра.</p>}

      {groups.map(([program, items]) => (
        <section key={program} className="group">
          <div className="group-head">
            <h2>{program}</h2>
            <span className="count">{items.length}</span>
          </div>
          <div className="cards">
            {items.map((p) => (
              <ProjectCard key={p.id} p={p} docs={docsByProject.get(p.id) || []} />
            ))}
          </div>
        </section>
      ))}

      <footer className="foot">
        Данни от eufunds.bg, esf.bg, az.government.bg, ПКИП · Съхранение в Cloudflare D1 · Изградено с Next.js
      </footer>
    </main>
  );
}

function Stat({ n, label, tone }) {
  return (
    <div className={"stat " + tone}>
      <div className="stat-n">{n}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

function ProjectCard({ p, docs }) {
  const [openDoc, setOpenDoc] = useState(null);
  const meta = STATUS_META[p.status] || STATUS_META.upcoming;
  const cat = CATEGORY_META[p.category] || CATEGORY_META.other;
  const dl = daysLeft(p.dead