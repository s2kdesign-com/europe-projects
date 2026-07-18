export const metadata = {
  title: "Календар на сроковете за европроекти",
  description: "Календар с крайните срокове на активните и предстоящите процедури за финансиране в държавите от ЕС. Следете кога изтичат процедурите и планирайте кандидатстването.",
  alternates: { canonical: "/calendar", languages: { "bg-BG": "/calendar", "en": "/en/calendar", "de": "/de/calendar", "x-default": "/calendar" } },
  robots: { index: true, follow: true },
  openGraph: { images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Европроекти", type: "image/png" }],
    title: "Календар на сроковете за европроекти | Европроекти",
    description: "Крайни срокове на активните и предстоящите процедури за финансиране в държавите от ЕС.",
    url: "/calendar",
  },
};

export default function CalendarLayout({ children }) {
  return children;
}
