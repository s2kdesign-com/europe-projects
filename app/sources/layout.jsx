export const metadata = {
  title: "Официални източници на данни | Европроекти",
  description: "Официалните национални портали и управляващи органи, от които Европроекти събира процедурите за финансиране — според избраната държава.",
  alternates: { canonical: "/sources", languages: { "bg-BG": "/sources", "en": "/en/sources", "de": "/de/sources", "x-default": "/sources" } },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Официални източници на данни | Европроекти",
    description: "Официалните портали и управляващи органи за процедурите за финансиране, по държава.",
    url: "/sources",
  },
};

export default function SourcesLayout({ children }) {
  return children;
}
