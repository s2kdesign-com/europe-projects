import { useUiTr } from "../lib/i18n/ui-translate.js";

export const PAGER_LABELS = ["На страница", "Страница", "Пагинация", "Опитай отново", "Неуспешно зареждане."];

export default function AdminPager({ state, sizes = [25, 50, 100], disabled = false }) {
  const tl = useUiTr();
  const { data, loading, pageSize, setPage, changeSize } = state;
  const page = data?.page || 1, pages = data?.totalPages || 1, total = data?.total || 0;
  return <nav className="admin-pager" aria-label={tl("Пагинация")}>
    <span className="pg-info" aria-live="polite">{total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} / {total}</span>
    <label className="admin-page-size">{tl("На страница")} <select className="inp" value={pageSize} disabled={loading || disabled} onChange={event => changeSize(Number(event.target.value))}>{sizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    <button className="btn btn-ghost" disabled={loading || disabled || page <= 1} onClick={() => setPage(page - 1)}>{tl("Предишна")}</button>
    <span>{tl("Страница")} {page} / {pages}</span>
    <button className="btn btn-ghost" disabled={loading || disabled || page >= pages} onClick={() => setPage(page + 1)}>{tl("Следваща")}</button>
  </nav>;
}

export function AdminLoadError({ error, retry }) {
  const tl = useUiTr();
  return error ? <div className="admin-load-error" role="alert"><span>{tl("Неуспешно зареждане.")} {error}</span><button className="btn" onClick={retry}>{tl("Опитай отново")}</button></div> : null;
}
