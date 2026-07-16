"use client";

import Icon from "./Icon.jsx";
import { BarChart, DonutChart, ColumnChart } from "./Chart.jsx";
import { STATUS } from "../lib/constants.js";
import { byProgram, byStatus, byTargetGroup, deadlinesByMonth, newChangedOverWeeks } from "../lib/overview-utils.js";

const STATUS_COLOR = { open: "var(--green)", closing_soon: "var(--amber)", upcoming: "var(--blue)", closed: "var(--neutral)" };

export default function FundingCharts({ projects, now }) {
  const programs = byProgram(projects).slice(0, 7);
  const statuses = byStatus(projects).map((s) => ({ label: STATUS[s.key]?.label || s.key, value: s.value, color: STATUS_COLOR[s.key] }));
  const targets = byTargetGroup(projects).map((t) => ({ label: t.label, value: t.value, color: t.key === "youth" ? "var(--green)" : "var(--blue)" }));
  const months = deadlinesByMonth(projects, now, 6);
  const overWeeks = newChangedOverWeeks(projects, now, 6);

  return (
    <section className="ov-section" aria-labelledby="charts-h">
      <div className="ov-section-head">
        <h2 id="charts-h"><Icon name="layers" size={18} /> Финансиране по направления</h2>
      </div>
      <div className="chart-grid">
        <div className="chart-card"><ColumnChart title="Срокове по месеци" data={months} /></div>
        <div className="chart-card"><BarChart title="Процедури по програма" data={programs} /></div>
        <div className="chart-card"><DonutChart title="По статус" data={statuses} /></div>
        <div className="chart-card"><DonutChart title="По тип кандидат" data={targets} /></div>
        <div className="chart-card wide">
          <ColumnChart
            title="Нови и променени във времето (по седмици)"
            data={overWeeks}
            series={[{ key: "new", label: "Нови", color: "var(--violet)" }, { key: "changed", label: "Променени", color: "var(--blue)" }]}
          />
        </div>
      </div>
      <p className="chart-note">
        <Icon name="info" size={13} /> Сумарен бюджет и разбивка по сектор не се показват — бюджетът е свободен текст,
        а поле „сектор" липсва в данните. Използва се програмата като налично измерение.
      </p>
    </section>
  );
}
