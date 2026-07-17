import DashboardShell from "../components/DashboardShell.jsx";

// Реален маршрут /calendar.
export default function Page() {
  return (
    <>
      <h1 className="sr-only">Календар на сроковете за европроекти в България</h1>
      <DashboardShell initialTab="calendar" />
    </>
  );
}
