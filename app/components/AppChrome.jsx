"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SystemWelcomeModal from "./SystemWelcomeModal.jsx";
import CookieConsentBanner from "./CookieConsentBanner.jsx";
import FeedbackModal from "./FeedbackModal.jsx";
import AppUpdateNotification from "./AppUpdateNotification.jsx";
import { useSession } from "../hooks/useSession.js";
import { useAppUpdate } from "../hooks/useAppUpdate.js";
import { trackUpdate } from "../services/versionService.js";
import { SYSTEM_INTRO_KEY, CONSENT_KEY, CONSENT_VERSION, INTRO_DELAY_MS } from "../lib/version.js";

function lsGet(k) { try { return window.localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } }

// Управлява глобалните елементи: информационен модал, съгласие за бисквитки, feedback.
// Информационният модал и cookie интерфейсът НИКОГА не се показват едновременно.
export default function AppChrome() {
  const session = useSession();
  const appUpdate = useAppUpdate();
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeSection, setWelcomeSection] = useState(null);
  const [cookieMode, setCookieMode] = useState(null); // null | "banner" | "settings"
  const [consent, setConsent] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const introSeenRef = useRef(false);
  const introReadyRef = useRef(false);   // изтекли ли са 5-те секунди
  const introPendingRef = useRef(false); // таймерът е гръмнал, но cookie изборът още не е направен
  const cookieResolvedRef = useRef(false);

  // Отваря информационния модал само ако е допустимо (не е видян, 5с изтекли, cookie изборът е направен).
  const maybeOpenIntro = useCallback(() => {
    if (introSeenRef.current || !introReadyRef.current) return;
    if (!cookieResolvedRef.current) { introPendingRef.current = true; return; }
    introPendingRef.current = false;
    setShowWelcome(true);
  }, []);

  useEffect(() => {
    introSeenRef.current = !!lsGet(SYSTEM_INTRO_KEY);

    // Наличен ли е вече cookie избор?
    const raw = lsGet(CONSENT_KEY);
    if (raw) {
      try { setConsent(JSON.parse(raw)); cookieResolvedRef.current = true; }
      catch { setCookieMode("banner"); cookieResolvedRef.current = false; }
    } else {
      setCookieMode("banner");
      cookieResolvedRef.current = false;
    }

    // 5-секунден таймер (не блокира зареждането; изчиства се при unmount → StrictMode безопасно).
    let timer = null;
    if (!introSeenRef.current) {
      timer = window.setTimeout(() => { introReadyRef.current = true; maybeOpenIntro(); }, INTRO_DELAY_MS);
    }

    const onWelcome = (e) => { setWelcomeSection((e && e.detail && e.detail.section) || null); setShowWelcome(true); }; // ръчно отваряне — моментално (по избор — директно на AI секцията)
    const onCookie = () => setCookieMode("settings");
    const onFeedback = () => setShowFeedback(true);
    window.addEventListener("open-welcome", onWelcome);
    window.addEventListener("open-cookie-settings", onCookie);
    window.addEventListener("open-feedback", onFeedback);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("open-welcome", onWelcome);
      window.removeEventListener("open-cookie-settings", onCookie);
      window.removeEventListener("open-feedback", onFeedback);
    };
  }, [maybeOpenIntro]);

  // Записваме „видян" ЕДВА при реално затваряне от потребителя (X / без регистрация / вход).
  const closeWelcome = () => { lsSet(SYSTEM_INTRO_KEY, "1"); introSeenRef.current = true; setShowWelcome(false); };

  const saveConsent = (obj) => {
    const c = { version: CONSENT_VERSION, necessary: true, analytics: !!obj.analytics, updatedAt: new Date().toISOString() };
    lsSet(CONSENT_KEY, JSON.stringify(c));
    setConsent(c);
    cookieResolvedRef.current = true;
    setCookieMode(null);
    // Тук би се приложил Google Consent Mode update (analytics_storage) — само ако
    // има интегриран Google tag. В момента системата няма аналитични скриптове.
    // Ако cookie изборът е бил направен след 5-те секунди — показваме модала след ~500 ms.
    if (introPendingRef.current && !introSeenRef.current) {
      introPendingRef.current = false;
      window.setTimeout(() => maybeOpenIntro(), 500);
    }
  };

  // Заключване на скрола на body само докато има активен МОДАЛ (не и за банера).
  const modalOpen = showWelcome || cookieMode === "settings" || showFeedback;
  useEffect(() => {
    if (!modalOpen) return;
    const sw = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (sw > 0) document.body.style.paddingRight = sw + "px"; // без layout jump
    return () => { document.body.style.overflow = prevOverflow; document.body.style.paddingRight = prevPad; };
  }, [modalOpen]);

  return (
    <>
      {showWelcome && (
        <SystemWelcomeModal initialSection={welcomeSection} onClose={closeWelcome} onLogin={() => { closeWelcome(); session.login(); }} />
      )}

      {/* Банерът се крие докато информационният модал е отворен — никога заедно. */}
      {cookieMode === "banner" && !consent && !showWelcome && (
        <CookieConsentBanner
          mode="banner"
          onAcceptAll={() => saveConsent({ analytics: true })}
          onNecessaryOnly={() => saveConsent({ analytics: false })}
          onOpenSettings={() => setCookieMode("settings")}
        />
      )}
      {cookieMode === "settings" && !showWelcome && (
        <CookieConsentBanner mode="settings" consent={consent} onSave={saveConsent} onClose={() => setCookieMode(consent ? null : "banner")} />
      )}

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}

      {/* Известие за нова версия — само когато cookie изборът е направен и няма
          отворен модал/банер (не се припокрива с тях). */}
      {appUpdate.update && !modalOpen && !(cookieMode === "banner" && !consent) && (
        <AppUpdateNotification
          update={appUpdate.update}
          onRefresh={appUpdate.refresh}
          onSnooze={appUpdate.snooze}
          onChangelog={() => {
            const u = appUpdate.update;
            trackUpdate("app_update_changelog_clicked", { current_version: appUpdate.currentBuildId, available_version: u.buildId, critical: !!u.critical });
            window.location.href = "/changelog?version=" + encodeURIComponent(u.version || "");
          }}
        />
      )}
    </>
  );
}
