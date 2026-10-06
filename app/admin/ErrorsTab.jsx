"use client";
import { useState } from "react";
import Icon from "../components/Icon.jsx";
import { useLanguage } from "../components/i18n/I18nProvider.jsx";
import { useUiTr } from "../lib/i18n/ui-translate.js";
import { errorOrigin } from "../services/error-reporting.js";
import { adminRequest, formatAdminDate, useAdminPage } from "./admin-data.js";
import AdminPager, { AdminLoadError } from "./AdminPager.jsx";

const NATIVE_BRIDGE = "Това изключение идва от нативния мост на Android браузъра (iabjs). Мостът не е част от сайта. Поправката изисква промяна в приложението, което предоставя браузъра. Оригиналното изключение е запазено.";
const OPAQUE_SCRIPT = "Грешка от външен скрипт без диагностични подробности. Браузърът не предоставя източника и стека.";
const EXTENSION = "Това изключение идва от разширение на браузъра. Поправката изисква промяна в разширението. Оригиналното изключение е запазено.";
export const ERROR_LABELS = ["Интеграция на браузъра", "Разширение на браузъра", "Подробности", "Потребителски идентификатор", "Неуспешно изчистване на журнала.", NATIVE_BRIDGE, OPAQUE_SCRIPT, EXTENSION];

export default function ErrorsTab() {
  const tl = useUiTr(), { lang } = useLanguage();
  const state = useAdminPage("/api/admin/errors", "errors");
  const { data, loading, error, refresh, setPage } = state;
  const [clearing, setClearing] = useState(false), [clearError, setClearError] = useState(null);
  const clear = async () => {
    if (!confirm(tl("Да изчистя ли журнала с грешки?"))) return;
    setClearing(true); setClearError(null);
    try { await adminRequest("/api/admin/errors", { method: "DELETE", headers: { "X-Requested-With": "fetch" } }); setPage(1); refresh(); }
    catch (error) { setClearError(`${tl("Неуспешно изчистване на журнала.")} ${error.message}`); }
    finally { setClearing(false); }
  };
  return <section className="prof-card" aria-busy={loading || clearing}>
    <div className="ov-section-head"><h2 className="prof-section-title">Exceptions</h2>{data && <span className="count-dot">{data.total}</span>}<div className="admin-error-actions"><button className="btn btn-ghost" disabled={loading || clearing} onClick={refresh}><Icon name="refresh" size={16} />{tl("Обнови")}</button>{data?.total > 0 && <button className="btn btn-danger" disabled={loading || clearing} onClick={clear}><Icon name="close" size={16} />{tl("Изчисти")}</button>}</div></div>
    <AdminLoadError error={error} retry={refresh} />
    {clearError && <p className="admin-load-error" role="alert">{clearError}</p>}
    {loading && <p role="status">{tl("Зареждане…")}</p>}
    {data && <><div className="table-scroll" tabIndex={0} aria-label="Exceptions"><table className="admin-table admin-errors-table">
      <thead><tr>{["Време", "Източник", "Метод/Път", "Статус", "Съобщение"].map(label => <th key={label} scope="col">{tl(label)}</th>)}</tr></thead>
      <tbody>{data.errors.map(row => <tr key={row.id}>
        <td className="admin-date">{formatAdminDate(row.created_at, lang)}</td>
        <td><span className={`badge ${row.source === "server" ? "amber" : "blue"}`}>{row.source || "?"}</span>{["native-browser", "browser-extension"].includes(errorOrigin(row)) && <small className="admin-cell-note">{tl(errorOrigin(row) === "native-browser" ? "Интеграция на браузъра" : "Разширение на браузъра")}</small>}</td>
        <td className="mono">{row.method} {row.path}</td><td>{row.status || "—"}</td>
        <td className="admin-error-message"><div>{row.message}</div><details><summary>{tl("Подробности")}</summary>
          {errorOrigin(row) === "native-browser" && <p>{tl(NATIVE_BRIDGE)}</p>}
          {errorOrigin(row) === "browser-extension" && <p>{tl(EXTENSION)}</p>}
          {row.message === "Script error." && <p>{tl(OPAQUE_SCRIPT)}</p>}
          <p>{tl("Потребителски идентификатор")}: {row.user_id || "—"}</p><pre className="err-detail">{row.detail || "—"}</pre>
        </details></td>
      </tr>)}{!data.errors.length && <tr><td colSpan={5}>{tl("Няма записани грешки")}</td></tr>}</tbody>
    </table></div><AdminPager state={state} sizes={[50, 100, 200]} disabled={clearing} /></>}
  </section>;
}
