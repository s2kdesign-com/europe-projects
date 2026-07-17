export const metadata = {
  title: "Активни европроекти и процедури за финансиране",
  description: "Активни и предстоящи процедури за европейско и национално финансиране в България — статус, срокове, бюджети и допустими кандидати. Данни от официални източници.",
  alternates: { canonical: "/procedures", languages: { "bg-BG": "/procedures", "en": "/en/procedures", "de": "/de/procedures", "x-default": "/procedures" } },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Активни европроекти и процедури за финансиране | Европроекти",
    description: "Активни и предстоящи процедури за финансиране в България — статус, срокове, бюджети и допустими кандидати.",
    url: "/procedures",
  },
};

export default function ProceduresLayout({ children }) {
  return children;
}
