"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import AppHeader from "../components/AppHeader.jsx";
import LanguageSelector from "../components/LanguageSelector.jsx";
import CountrySourcesPanel from "../components/country/CountrySourcesPanel.jsx";
import { useSession } from "../hooks/useSession.js";
import { pathForTab } from "../lib/routes.js";

// Публична страница „Официални източници" — според избраната държава (CountryContext).
// Има същото топ меню като останалите страници + езиков избор до заглавието.
export default function SourcesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useSession();
  const navigateTab = useCallback((key) => router.push(pathForTab(key)), [router]);

  return (
    <>
      <AppHeader tab={null} onTab={navigateTab} savedCount={0} session={session} />
      <main id="main" className="container page prose-page">
        <div className="sources-page-head">
          <h1>{t("country.sourcesTitle")}</h1>
          <div className="sources-page-lang">
            <LanguageSelector variant="footer" id="sources-lang" />
          </div>
        </div>
        <CountrySourcesPanel />
      </main>
    </>
  );
}
