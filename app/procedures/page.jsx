import DashboardShell from "../components/DashboardShell.jsx";

// Реален маршрут /procedures. Server компонент: описателен H1 в статичния HTML;
// DashboardShell се рендира клиентски с начален таб „Процедури".
export default function Page() {
  return (
    <>
      {/* Worker-owned progressive HTML. React leaves the contents intact during hydration. */}
      <div id="procedure-bootstrap" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: "" }} />
      <h1 className="sr-only procedure-list-heading">Активни европроекти и процедури за финансиране в ЕС</h1>
      <DashboardShell initialTab="procedures" />
    </>
  );
}
