import DashboardShell from "../components/DashboardShell.jsx";

// Реален маршрут /procedures. Server компонент: описателен H1 в статичния HTML;
// DashboardShell се рендира клиентски с начален таб „Процедури".
export default function Page() {
  return (
    <>
      <h1 className="sr-only">Активни европроекти и процедури за финансиране в България</h1>
      <DashboardShell initialTab="procedures" />
    </>
  );
}
