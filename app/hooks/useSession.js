"use client";

import { useCallback, useEffect, useState } from "react";

// Клиентско състояние на сесията. Изтегля /api/auth/me. При липса на сървър
// (локален преглед) третираме потребителя като нелогнат — приложението работи.
export function useSession() {
  const [state, setState] = useState({ loading: true, authenticated: false, user: null, role: "user", profileCompletion: 0 });

  const refresh = useCallback(async (signal) => {
    try {
      const r = await fetch("/api/auth/me", { signal, credentials: "same-origin" });
      if (!r.ok) throw new Error("http");
      const d = await r.json();
      setState({ loading: false, authenticated: !!d.authenticated, user: d.user || null, role: (d.user && d.user.role) || "user", profileCompletion: d.profileCompletion || 0 });
      return d;
    } catch {
      setState({ loading: false, authenticated: false, user: null, role: "user", profileCompletion: 0 });
      return { authenticated: false };
    }
  }, []);

  useEffect(() => {
    const c = new AbortController();
    refresh(c.signal);
    return () => c.abort();
  }, [refresh]);

  const login = useCallback((returnTo) => {
    const rt = returnTo || (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
    window.location.href = "/api/auth/google?returnTo=" + encodeURIComponent(rt);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "X-Requested-With": "fetch" } });
    } catch { /* ignore */ }
    setState({ loading: false, authenticated: false, user: null, role: "user", profileCompletion: 0 });
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  return { ...state, isAdmin: state.role === "admin", refresh, login, logout };
}
