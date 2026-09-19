"use client";
import Link from "next/link";

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
        <Link className="brand" href="/" aria-label={t("common.appName")}>
          <CountryLogoMark size={20} />
          <span>
            <span className="brand-name">{t("common.appName")}</span>
            <br />
            <span className="brand-sub">{t("common.tagline")}</span>
          </span>
        </Link>
        {session && <div className="appbar-account"><UserMenu session={session} /></div>}
        <nav className="nav" aria-label={t("navigation.ariaLabel")}>
          {showBack && (
            <Link className="nav-tab" href="/">
              <Icon name="arrowRight" size={16} style={{ transform: "rotate(180deg)" }} /> {t("common.backToDashboard")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
