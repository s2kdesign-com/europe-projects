export const metadata = {
  title: "Календар на сроковете за европроекти",
  description: "Календар с крайните срокове на активните и предстоящите европроцедури за България. Следете кога изтичат процедурите и планирайте кандидатстването.",
  alternates: { canonical: "/calendar", languages: { "bg-BG": "/calendar", "x-default": "/calendar" } },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Календар на сроковете за европроекти | Европроекти",
    description: "Крайни срокове на активните и предстоящите европроцедури за България.",
    url: "/calendar",
  },
};

export default function CalendarLayout({ children }) {
  return children;
}
