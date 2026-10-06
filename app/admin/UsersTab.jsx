"use client";
import { useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import { useLanguage } from "../components/i18n/I18nProvider.jsx";
import { useUiTr } from "../lib/i18n/ui-translate.js";
import { adminRequest, formatAdminDate, useAdminPage } from "./admin-data.js";
import AdminPager, { AdminLoadError } from "./AdminPager.jsx";

export const USER_LABELS = ["Език", "Автоматично", "Ръчно", "По подразбиране", "Последна активност", "Току-що", "Няма потребители", "Неуспешна промяна на ролята."];
const roles = [{ key: "user", label: "Потребител" }, { key: "premium", label: "Премиум" }, { key: "admin", label: "Администратор" }];

function recent(value, lang, now, tl) {
  const elapsed = now - Date.parse(value);
  if (!Number.isFinite(elapsed)) return "—";
  if (elapsed < 60_000) return tl("Току-що");
  for (const [unit, ms] of [["day", 86400000], ["hour", 3600000], ["minute", 60000]]) {
    if (elapsed >= ms) return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(-Math.floor(elapsed / ms), unit);
  }
}
function displayName(code, lang, type) {
  if (!code) return "—";
  try { return new Intl.DisplayNames([lang], { type }).of(code) || code; } catch { return code; }
}

export default function UsersTab() {
  const tl = useUiTr(), { lang } = useLanguage();
  const state = useAdminPage("/api/admin/users", "users");
  const { data, setData, loading, error, refresh } = state;
  const [message, setMessage] = useState(null), [saving, setSaving] = useState(null), [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const changeRole = async (id, role) => {
    setSaving(id); setMessage(null);
    try {
      await adminRequest("/api/admin/users/" + encodeURIComponent(id), { method: "PATCH", headers: { "content-type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify({ role }) });
      setData(current => ({ ...current, users: current.users.map(user => user.id === id ? { ...user, role } : user) }));
      setMessage({ text: tl("Ролята е обновена."), error: false });
      refresh();
    } catch (error) { setMessage({ text: `${tl("Неуспешна промяна на ролята.")} ${error.message}`, error: true }); }
    finally { setSaving(null); }
  };
  return <section className="prof-card" aria-busy={loading}>
    <div className="ov-section-head"><h2 className="prof-section-title">{tl("Потребители")}</h2>{data && <span className="count-dot">{data.total}</span>}<button className="btn btn-ghost admin-refresh" disabled={loading || !!saving} onClick={refresh}><Icon name="refresh" size={16} />{tl("Обнови")}</button></div>
    {message && <p className={message.error ? "admin-load-error" : "save-ok"} role={message.error ? "alert" : "status"}>{message.text}</p>}
    <AdminLoadError error={error} retry={refresh} />
    {loading && <p role="status">{tl("Зареждане…")}</p>}
    {data && <>
      <div className="table-scroll admin-users-scroll" tabIndex={0} aria-label={tl("Потребители")}>
        <table className="admin-table admin-users-table">
          <thead><tr>{["Потребител", "Роля", "Държава", "Език", "Premium достъп", "Регистриран", "Последна активност"].map(label => <th key={label} scope="col">{tl(label)}</th>)}</tr></thead>
          <tbody>{data.users.map(user => <tr key={user.id}>
            <td><div className="u-cell">{user.avatar_url ? <img src={user.avatar_url} alt="" width={28} height={28} className="um-avatar" referrerPolicy="no-referrer" /> : <span className="um-avatar um-initials">{(user.display_name || user.email || "?").charAt(0).toUpperCase()}</span>}<div><strong>{user.display_name || "—"}</strong><span className="admin-user-email">{user.email}</span></div></div></td>
            <td><select className="inp admin-role" value={user.role || "user"} disabled={loading || !!saving} onChange={event => changeRole(user.id, event.target.value)} aria-label={`${tl("Роля")}: ${user.email}`}>{roles.map(role => <option key={role.key} value={role.key}>{tl(role.label)}</option>)}</select></td>
            <td title={user.country_mode !== "manual" && user.automatic_country_at ? formatAdminDate(user.automatic_country_at, lang) : undefined}>{displayName(user.country_mode === "manual" ? user.preferred_country : user.automatic_country, lang, "region")}<small className="admin-cell-note">{tl(user.country_mode === "manual" ? "Ръчно" : "Автоматично")}{user.country_mode !== "manual" && user.automatic_country_source === "fallback" ? ` · ${tl("По подразбиране")}` : ""}</small></td>
            <td title={user.language_mode !== "manual" && user.automatic_language_at ? formatAdminDate(user.automatic_language_at, lang) : undefined}>{displayName(user.language_mode === "manual" ? user.language : user.automatic_language, lang, "language")}<small className="admin-cell-note">{tl(user.language_mode === "manual" ? "Ръчно" : "Автоматично")}{user.language_mode !== "manual" && user.automatic_language_source === "fallback" ? ` · ${tl("По подразбиране")}` : ""}</small></td>
            <td>{user.premium_source ? tl(user.premium_source === "administrator" ? "От администратор" : "Чрез абонамент") : "—"}<details className="admin-billing"><summary>{tl("Абонамент")}: {user.subscription_status || "—"}</summary><dl>{[["План", user.plan_id || "—"], ["Край на периода", formatAdminDate(user.current_period_end, lang)], ["Последна фактура", user.last_invoice_status || "—"]].map(([label, value]) => <div key={label}><dt>{tl(label)}</dt><dd>{value}</dd></div>)}</dl></details></td>
            <td className="admin-date">{formatAdminDate(user.created_at, lang)}</td>
            <td className="admin-date"><time dateTime={user.last_active_at || undefined} title={formatAdminDate(user.last_active_at, lang)}>{recent(user.last_active_at, lang, now, tl)}</time><small className="admin-cell-note">{formatAdminDate(user.last_active_at, lang)}</small></td>
          </tr>)}{!data.users.length && <tr><td colSpan={7}>{tl("Няма потребители")}</td></tr>}</tbody>
        </table>
      </div>
      <AdminPager state={state} disabled={!!saving} />
    </>}
  </section>;
}
