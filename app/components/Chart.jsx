"use client";

// Малки, достъпни SVG диаграми без външна библиотека. Цветовете идват от
// CSS променливите (тема). Всяка диаграма има скрита таблица за екранни четци.

import { useUiTranslate } from "../lib/i18n/ui-translate.js";

const PALETTE = ["var(--primary)", "var(--green)", "var(--amber)", "var(--violet)", "var(--blue)", "var(--red)", "var(--neutral)"];

// ВАЖНО: таблицата за екранни четци се загръща в <div className="sr-only">.
// Класът .sr-only върху самата <table> НЕ работи — при table-layout:auto
// браузърът игнорира width:1px и разширява таблицата до min-content на
// съдържанието (nowrap), което разширява layout viewport-а на мобилно и води
// до хоризонтален overflow. Блоковият div спазва width:1px + overflow:hidden
// и клипва вътрешната таблица, като я запазва в дървото за достъпност.
function SrTable({ title, rows }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{title}</caption>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row">{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BarChart({ title, data, max }) {
  const m = max || Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <div className="barchart" role="img" aria-label={title}>
        {data.map((d, i) => (
          <div className="barrow" key={d.label + i}>
            <span className="barlabel" title={d.label}>{d.label}</span>
            <span className="bartrack">
              <span className="barfill" style={{ width: `${(d.value / m) * 100}%`, background: d.color || PALETTE[i % PALETTE.length] }} />
            </span>
            <span className="barval">{d.value}</span>
          </div>
        ))}
      </div>
      <SrTable title={title} rows={data} />
    </figure>
  );
}

export function ColumnChart({ title, data, series }) {
  // data: [{label, <seriesKey>:n, ...}]; series: [{key,label,color}]
  const s = series || [{ key: "value", label: title, color: PALETTE[0] }];
  const max = Math.max(1, ...data.flatMap((d) => s.map((x) => d[x.key] || 0)));
  const W = 320, H = 140, pad = 24, gap = 8;
  const groupW = (W - pad * 2) / data.length;
  const barW = Math.max(4, (groupW - gap) / s.length);
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <svg className="colchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--line-strong)" strokeWidth="1" />
        {data.map((d, gi) => (
          <g key={gi} transform={`translate(${pad + gi * groupW}, 0)`}>
            {s.map((x, si) => {
              const v = d[x.key] || 0;
              const h = ((H - pad * 2) * v) / max;
              return (
                <rect
                  key={x.key}
                  x={gap / 2 + si * barW}
                  y={H - pad - h}
                  width={barW - 2}
                  height={h}
                  rx="2"
                  fill={x.color || PALETTE[si % PALETTE.length]}
                >
                  <title>{`${d.label} · ${x.label}: ${v}`}</title>
                </rect>
              );
            })}
            <text x={groupW / 2} y={H - pad + 12} textAnchor="middle" fontSize="9" fill="var(--muted)">{d.label}</text>
          </g>
        ))}
      </svg>
      {series && series.length > 1 && (
        <div className="chart-legend">
          {series.map((x) => (
            <span key={x.key} className="legend-item"><span className="legend-dot" style={{ background: x.color }} />{x.label}</span>
          ))}
        </div>
      )}
      <SrTable title={title} rows={data.flatMap((d) => s.map((x) => ({ label: `${d.label} — ${x.label}`, value: d[x.key] || 0 })))} />
    </figure>
  );
}

export function DonutChart({ title, data }) {
  const tl = useUiTranslate(["общо"]);
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R, cx = 70, cy = 70;
  let offset = 0;
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <div className="donut-wrap">
        <svg viewBox="0 0 140 140" width="120" height="120" role="img" aria-label={title}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
          {data.map((d, i) => {
            const frac = d.value / total;
            const len = frac * C;
            const seg = (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={R}
                fill="none"
                stroke={d.color || PALETTE[i % PALETTE.length]}
                strokeWidth="16"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              >
                <title>{`${d.label}: ${d.value}`}</title>
              </circle>
            );
            offset += len;
            return seg;
          })}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--ink)">{total}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill="var(--muted)">{tl("общо")}</text>
        </svg>
        <div className="chart-legend col">
          {data.map((d, i) => (
            <span key={i} className="legend-item">
              <span className="legend-dot" style={{ background: d.color || PALETTE[i % PALETTE.length] }} />
              {d.label} <strong>{d.value}</strong>
            </span>
          ))}
        </div>
      </div>
      <SrTable title={title} rows={data} />
    </figure>
  );
}
