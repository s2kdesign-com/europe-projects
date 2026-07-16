"use client";

// Лек, безопасен Markdown -> React (заглавия, удебелен текст, списъци, параграфи).
// Не рендира сурово HTML — само текстови възли, така че е безопасно.
export default function Markdown({ text }) {
  return <div className="prose">{render(text)}</div>;
}

function inline(s, key) {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={key + "-" + i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={key + "-" + i}>{p}</span>
    )
  );
}

export function render(text) {
  if (!text) return null;
  const lines = String(text).split("\n");
  const out = [];
  let list = null;
  const flush = (k) => {
    if (list) {
      out.push(<ul key={"ul" + k}>{list}</ul>);
      list = null;
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) return flush(i);
    if (line.startsWith("### ")) { flush(i); out.push(<h5 key={i}>{inline(line.slice(4), i)}</h5>); }
    else if (line.startsWith("## ")) { flush(i); out.push(<h4 key={i}>{inline(line.slice(3), i)}</h4>); }
    else if (line.startsWith("# ")) { flush(i); out.push(<h4 key={i}>{inline(line.slice(2), i)}</h4>); }
    else if (line.startsWith("- ")) { if (!list) list = []; list.push(<li key={i}>{inline(line.slice(2), i)}</li>); }
    else { flush(i); out.push(<p key={i}>{inline(line, i)}</p>); }
  });
  flush("end");
  return out;
}
