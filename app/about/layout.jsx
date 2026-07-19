export const metadata = {
  title: "Относно Euro-Funding — държави, официални източници и AI анализ",
  description: "Вижте покритието на Euro-Funding по държави, официалните източници, ежедневния AI преглед и моделите, които структурират процедурите, документите и бюджетите.",
  alternates: { canonical: "/about", languages: { "bg-BG": "/about", "en": "/en/about", "de": "/de/about", "x-default": "/about" } },
  robots: { index: true, follow: true },
  openGraph: { images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Euro-Funding", type: "image/png" }],
    title: "Относно Euro-Funding — държави, официални източници и AI анализ",
    description: "Покритие по държави, официални източници, ежедневен AI преглед и използваните модели.",
    url: "/about",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Относно Euro-Funding", description: "Официални източници и AI анализ в ЕС." },
};

// JSON-LD: WebPage + BreadcrumbList (само реални данни, без динамични числа).
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://euro-funds.eu/about",
      url: "https://euro-funds.eu/about",
      name: "Относно Euro-Funding — държави, официални източници и AI анализ",
      inLanguage: "bg",
      isPartOf: { "@type": "WebSite", name: "Euro-Funding", url: "https://euro-funds.eu" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Начало", item: "https://euro-funds.eu/" },
        { "@type": "ListItem", position: 2, name: "Относно системата", item: "https://euro-funds.eu/about" },
      ],
    },
    {
      "@type": "WebApplication",
      name: "Euro-Funding",
      url: "https://euro-funds.eu",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "AI платформа за откриване, анализ и проследяване на европейско и национално финансиране в ЕС.",
    },
  ],
};

export default function AboutLayout({ children }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
