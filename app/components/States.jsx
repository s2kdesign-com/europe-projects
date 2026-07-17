"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="cards" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="sk sk-pill" />
          <div className="sk sk-line sk-title" style={{ marginTop: 14 }} />
          <div className="sk sk-line" style={{ width: "60%" }} />
          <div className="sk sk-line" style={{ width: "90%", marginTop: 18 }} />
          <div className="sk sk-line" style={{ width: "70%" }} />
        </div>
      ))}
    </div>
  );
}

export function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <p className="sr-only" role="status">{t("states.loadingProcedures")}</p>
      <SkeletonGrid count={6} />
    </div>
  );
}

export function EmptyState({ title, message, action }) {
  const { t } = useTranslation();
  return (
    <div className="state">
      <Icon name="search" size={30} />
      <h3>{title || t("states.noResults")}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="state error" role="alert">
      <Icon name="alert" size={30} />
      <h3>{t("states.loadError")}</h3>
      <p>{t("states.loadErrorHint")}</p>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          <Icon name="refresh" size={16} /> {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function StaleBanner({ text }) {
  return (
    <div className="stale" role="status">
      <Icon name="alert" size={18} />
      <span>{text}</span>
    </div>
  );
}
