"use client";

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
  const meta = statusMeta(status);
  return (
    <span className={"badge " + meta.tone}>
      <Icon name={STATUS_ICON[meta.key] || "info"} size={14} />
      {meta.label}
    </span>
  );
}
