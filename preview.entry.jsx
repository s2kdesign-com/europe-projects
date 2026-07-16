// Входна точка за офлайн preview (preview.html). Рендира DashboardShell с
// фикстурни данни и гост-сесия, за да няма мрежови заявки. Билд: build-preview.mjs
import React from "react";
import { createRoot } from "react-dom/client";
import DashboardShell from "./app/components/DashboardShell.jsx";
import data from "./fixtures/sample-data.json";

// Брой документи на процедура (както прави API-то със свой JOIN).
const docCount = {};
for (const d of data.documents || []) docCount[d.project_id] = (docCount[d.project_id] || 0) + 1;
const projects = (data.projects || []).map((p) => ({ ...p, doc_count: docCount[p.id] || 0 }));

// Гост-сесия — без мрежа, без Google.
const guestSession = {
  authenticated: false, user: null, loading: false, isAdmin: false, profileCompletion: 0,
  login() {}, logout() {},
};

createRoot(document.getElementById("root")).render(
  React.createElement(DashboardShell, {
    initialData: { projects, snapshot: data.snapshot, ok: true },
    session: guestSession,
  })
);
