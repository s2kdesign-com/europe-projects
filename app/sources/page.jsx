"use client";

import { useTranslation } from "react-i18next";
import CountrySourcesPanel from "../components/country/CountrySourcesPanel.jsx";

// Публична страница „Официални източници" — според избраната държава (CountryContext).
export default function SourcesPage() {
  const { t } = useTranslation();
  return (
    <main id="main" className="container page prose-page">
      <nav className="crumbs" aria-label="breadcrumbs">
        <a href="/">{t("common.appName")}</a> › <span aria-current="page">{t("country.sourcesTitle")}</span>
      </nav>
      <h1>{t("country.sourcesTitle")}</h1>
      <CountrySourcesPanel />
    </main>
  );
}
