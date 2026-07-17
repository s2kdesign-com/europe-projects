import DashboardShell from "../components/DashboardShell.jsx";

// Реален маршрут /saved (личен — noindex, виж layout).
export default function Page() {
  return (
    <>
      <h1 className="sr-only">Запазени процедури</h1>
      <DashboardShell initialTab="saved" />
    </>
  );
}
