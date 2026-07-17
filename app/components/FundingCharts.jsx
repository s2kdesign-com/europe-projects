"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { BarChart, DonutChart, ColumnChart } from "./Chart.jsx";
import { STATUS } from "../lib/constants.js";
import { byProgram, byStatus, byTargetGroup, deadlinesByMonth } from "../lib/overview-utils.js";

const STATUS_COLOR = { open: "var(--green)", closing_soon: "var(--amber)", upcoming: "var(--blue)", closed: "var(--neutral)" };

export default function FundingCharts({ projects, now }) {
  const { t } = useTranslation();
  const programs = byProgram(projects).slice(0, 7);
  const statuses = byStatus(projects).map((s) => ({ label: t(`status.${s.key}`, STATUS[s.key]?.label || s.key), value: s.value, color: STATUS_COLOR[s.key] }));
  const targets = byTargetGroup(projects).map((g) => ({ label: g.key === "youth" ? t("filters.targetYouth") : t("filters.targetGeneral"), value: g.value, color: g.key === "youth" ? "var(--green)" : "var(--blue)" }));
  const months = deadlinesByMonth(projects, now, 6);

  return (
    <section className="ov-section" aria-labelledby="charts-h">
      <div className="ov-section-head">
        <h2 id="charts-h"><Icon name="layers" size={18} /> {t("sections.funding")}</h2>
      </div>
      <div className="chart-grid">
        <div className="chart-card"><ColumnChart title={t("charts.byMonth")} data={months} /></div>
        <div className="chart-card"><BarChart title={t("charts.byProgram")} data={programs} /></div>
        <div className="chart-card"><DonutChart title={t("charts.byStatus")} data={statuses} /></div>
        <div className="chart-card"><DonutChart title={t("charts.byCandidate")} data={targets} /></div>
      </div>
      <p className="chart-note">
        <Icon name="info" size={13} /> {t("charts.note")}
      </p>
    </section>
  );
}
