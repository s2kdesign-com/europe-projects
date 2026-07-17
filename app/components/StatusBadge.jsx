"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { statusMeta } from "../lib/project-utils.js";

// Статусът НЕ разчита само на цвят — винаги показваме икона + текст.
const STATUS_ICON = {
  open: "check",
  closing_soon: "clock",
  upcoming: "calendar",
  closed: "close",
};

export default function StatusBadge({ status }) {
  const { t } = useTranslation();
  const meta = statusMeta(status);
  return (
    <span className={"badge " + meta.tone}>
      <Icon name={STATUS_ICON[meta.key] || "info"} size={14} />
      {t("status." + meta.key, meta.label)}
    </span>
  );
}
