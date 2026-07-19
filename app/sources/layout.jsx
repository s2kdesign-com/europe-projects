export const metadata = {
  title: "Официални източници на данни | Euro-Funding",
  description: "Официалните национални портали и управляващи органи, от които Euro-Funding събира процедурите за финансиране — според избраната държава.",
  alternates: { canonical: "/sources", languages: { "bg-BG": "/sources", "en": "/en/sources", "de": "/de/sources", "x-default": "/sources" } },
  robots: { index: true, follow: true },
  openGraph: { images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Euro-Funding", type: "image/png" }],
    title: "Официални източници на данни | Euro-Funding",
    description: "Официалните портали и управляващи органи за процедурите за финансиране, по държава.",
    url: "/sources",
  },
};

export default function SourcesLayout({ children }) {
  return children;
}
