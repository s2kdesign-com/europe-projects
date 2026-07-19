"use client";

import { useEffect, useRef, useState } from "react";
import AccountHeader from "../components/AccountHeader.jsx";
import Icon from "../components/Icon.jsx";
import { GoogleG } from "../components/UserMenu.jsx";
import { useSession } from "../hooks/useSession.js";
import { useUiTranslate } from "../lib/i18n/ui-translate.js";

const ERRORS = {
  cancelled: "Входът беше отменен. Можете да опитате отново.",
  state: "Сесията за вход изтече или е невалидна. Опитайте отново.",
  expired: "Заявката за вход изтече. Опитайте отново.",
  email_not_verified: "Имейлът във вашия Google акаунт не е потвърден.",
  provider: "Google върна грешка при входа. Опитайте отново.",
  auth_failed: "Възникна грешка при входа. Опитайте отново.",
  token_exchange_failed: "Възникна грешка при входа. Опитайте отново.",
  oauth_not_configured: "Входът все още не е конфигуриран на сървъра.",
};

const LABELS = [
  ...Object.values(ERRORS),
  "Вход в Европроекти",
  "Влезте, за да синхронизирате запазените процедури, да настроите своя профил и да получавате по-подходящи възможности за финансиране.",
  "Пренасочване…", "Продължи с Google", "Разгледай без вход",
  "Google ни предоставя само основна информация (име, имейл, снимка). Не получаваме вашата парола. Повече в",
  "поверителност",
];

export default function LoginPage() {
  const tl = useUiTranslate(LABELS);
  const session = useSession();
  const [error, setError] = useState(null);
  const [returnTo, setReturnTo] = useState("/");
  const [submitting, setSubmitting] = useState(false);
  const btnRef = useRef(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const e = p.get("error");
    if (e) setError(ERRORS[e] || ERRORS.auth_failed);
    setReturnTo(p.get("returnTo") || "/");
    btnRef.current?.focus();
  }, []);

  // Ако вече е логнат — връщаме го.
  useEffect(() => {
    if (!session.loading && session.authenticated) {
      window.location.href = returnTo && returnTo.startsWith("/") ? returnTo : "/";
    }
  }, [session.loading, session.authenticated, returnTo]);

  const start = () => {
    setSubmitting(true);
    window.location.href = "/api/auth/google?returnTo=" + encodeURIComponent(returnTo || "/");
  };

  return (
    <>
      <AccountHeader session={session} />
      <main id="main" className="auth-wrap">
        <section className="auth-card" aria-labelledby="login-title">
          <span className="auth-mark" aria-hidden="true"><Icon name="euro" size={26} /></span>
          <h1 id="login-title">{tl("Вход в Европроекти")}</h1>
          <p className="auth-desc">
            {tl("Влезте, за да синхронизирате запазените процедури, да настроите своя профил и да получавате по-подходящи възможности за финансиране.")}
          </p>

          {error && (
            <div className="auth-error" role="alert">
              <Icon name="alert" size={18} /> <span>{tl(error)}</span>
            </div>
          )}

          <button ref={btnRef} className="btn btn-google btn-google-lg" onClick={start} disabled={submitting}>
            <GoogleG size={20} /> {submitting ? tl("Пренасочване…") : tl("Продължи с Google")}
          </button>

          <a className="auth-secondary" href="/">{tl("Разгледай без вход")}</a>

          <p className="auth-privacy">
            <Icon name="info" size={14} /> {tl("Google ни предоставя само основна информация (име, имейл, снимка). Не получаваме вашата парола. Повече в")} <a href="/profile#privacy">{tl("поверителност")}</a>.
          </p>
        </section>
      </main>
    </>
  );
}
