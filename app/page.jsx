"use client";

import DashboardShell from "./components/DashboardShell.jsx";

// Тегленето на данни, състоянията (loading/error/retry) и всичко останало
// живеят в DashboardShell, за да е компонентът реюзабилен и тестируем.
export default function Page() {
  return <DashboardShell />;
}
