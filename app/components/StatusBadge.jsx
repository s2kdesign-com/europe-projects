"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { statusMeta } from "../lib/project-utils.js";
import { needsDeadlineReview, DEADLINE_REVIEW_LABEL } from '../lib/deadline-review.js';

// Статусът НЕ разчита само на цвят — винаги показваме икона + текст.
const STATUS_ICON = {
  open: "check",
  closing_soon: "clock",
  upcoming: "calendar",
  closed: "close",
};

export default function StatusBadge({ status, deadlineDate }) {
  const { t } = useTranslation();
  const meta = statusMeta(status);
  const overdue = needsDeadlineReview({status, deadline_date: deadlineDate});
  return (
    <span className={"badge " + (overdue ? statusMeta('closing_soon').tone : meta.tone)}>
      <Icon name={overdue ? 'clock' : STATUS_ICON[meta.key] || "info"} size={14} />
      {overdue ? t('status.deadlineReview', DEADLINE_REVIEW_LABEL) : t("status." + meta.key, meta.label)}
    </span>
  );
}
