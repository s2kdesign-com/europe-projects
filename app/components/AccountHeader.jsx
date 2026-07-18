"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import UserMenu from "./UserMenu.jsx";
import CountryLogoMark from "./country/CountryLogoMark.jsx";

// По-лек хедър за страниците /login, /profile, /admin, /changelog.
export default function AccountHeader({ session, showBack = true }) {
  const { t } = useTranslation();
  return (
    <header className="appbar">
      <div className="appbar-inner">
        <a className="brand" href="/" aria-label={t("common.appName")}>
          <CountryLogoMark size={20} />
          <span>
            <span className="brand-name">{t("common.appName")}</span>
            <br />
            <span className="brand-sub">{t("common.tagline")}</span>
          </span>
        </a>
        {session && <div className="appbar-account"><UserMenu session={session} /></div>}
        <nav className="nav" aria-label={t("navigation.ariaLabel")}>
          {showBack && (
            <a className="nav-tab" href="/">
              <Icon name="arrowRight" size={16} style={{ transform: "rotate(180deg)" }} /> {t("common.backToDashboard")}
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
