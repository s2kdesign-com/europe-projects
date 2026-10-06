import { useCallback, useEffect, useState } from "react";
import { reportClientError } from "../services/error-reporting.js";

export async function adminRequest(path, options) {
  try {
    const response = await fetch(path, { credentials: "same-origin", ...options });
    const body = await response.json();
    if (!response.ok || body.ok === false) {
      throw new Error(`HTTP ${response.status}${body.error ? `: ${body.error}` : ""}`);
    }
    return body;
  } catch (error) {
    if (error.name !== "AbortError") reportClientError({ path: path.split("?")[0], method: options?.method || "GET", message: error.message, detail: error.stack || "" });
    throw error;
  }
}

export function useAdminPage(path, key) {
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    adminRequest(`${path}?page=${page}&pageSize=${pageSize}`, { signal: controller.signal }).then(body => {
      if (!Array.isArray(body[key]) || !Number.isInteger(body.total) || !Number.isInteger(body.page)) throw new Error("Invalid administration response");
      if (!controller.signal.aborted) { setData(body); if (body.page !== page) setPage(body.page); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, key, page, pageSize, revision]);
  return { data, setData, error, loading, page, setPage, pageSize, changeSize: size => { setPageSize(size); setPage(1); }, refresh };
}

export function formatAdminDate(value, lang) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(lang, { dateStyle: "short", timeStyle: "short" });
}
