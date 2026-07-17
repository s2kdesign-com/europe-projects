import DashboardShell from "./components/DashboardShell.jsx";

// Server компонент: описателният H1 влиза в статичния HTML (за SEO/ботове),
// защото DashboardShell се рендира клиентски. Видимият поздрав е h2.
// Тегленето на данни, състоянията (loading/error/retry) и всичко останало
// живеят в DashboardShell, за да е компонентът реюзабилен и тестируем.
export default function Page() {
  return (
    <>
      <h1 className="sr-only">Европроекти — активни и предстоящи европроцедури за България</h1>
      <DashboardShell />
    </>
  );
}
