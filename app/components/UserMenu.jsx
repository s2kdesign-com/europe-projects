"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

export function GoogleG({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function UserMenu({ session }) {
  const { authenticated, user, loading, login, logout, isAdmin } = session;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (loading) return <span className="um-skel" aria-hidden="true" />;

  if (!authenticated) {
    return (
      <button className="btn btn-google" onClick={() => login()} aria-label="Вход с Google">
        <GoogleG /> <span className="um-login-label">Вход с Google</span>
      </button>
    );
  }

  const initials = (user?.display_name || user?.email || "?").trim().charAt(0).toUpperCase();
  const menu = [
    { href: "/profile", label: "Моят профил", icon: "users" },
    { href: "/?tab=saved", label: "Моите запазени", icon: "bookmark" },
  ];
  // „Настройки" (админ конзола) — само за администратори.
  if (isAdmin) menu.push({ href: "/admin", label: "Настройки", icon: "filter" });

  return (
    <div className="um" ref={ref}>
      <button ref={btnRef} className="um-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {user?.avatar_url ? (
          <img className="um-avatar" src={user.avatar_url} alt="" width={30} height={30} referrerPolicy="no-referrer" />
        ) : (
          <span className="um-avatar um-initials" aria-hidden="true">{initials}</span>
        )}
        <span className="um-name">{user?.display_name || user?.email}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="um-menu" role="menu">
          <div className="um-head">
            <div className="um-head-name">{user?.display_name}{isAdmin && <span className="role-chip">админ</span>}</div>
            <div className="um-head-email">{user?.email}</div>
          </div>
          {menu.map((m) => (
            <a key={m.href} href={m.href} role="menuitem" className="um-item"><Icon name={m.icon} size={16} /> {m.label}</a>
          ))}
          <button role="menuitem" className="um-item um-danger" onClick={() => { setOpen(false); logout(); }}>
            <Icon name="external" size={16} /> Изход
          </button>
        </div>
      )}
    </div>
  );
}
