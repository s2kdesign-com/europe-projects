import "./globals.css";
import "./overview.css";
import "./calendar.css";
import "./auth.css";
import "./admin.css";
import "./header.css";
import "./footer.css";
import "./site.css";
import ErrorReporter from "./components/ErrorReporter.jsx";
import AppChrome from "./components/AppChrome.jsx";
import SiteFooter from "./components/SiteFooter.jsx";

const SITE_URL = "https://evroproekti-dashboard.autumn-limit-8eff.workers.dev";

const TITLE = "Европроекти — Табло за европейско финансиране за България";
const DESCRIPTION =
  "Ежедневно обновяван преглед на активни и предстоящи европроцедури за България — срокове, бюджети и допустими кандидати. Данни от eufunds.bg, esf.bg, az.government.bg и ПКИП.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | Европроекти" },
  description: DESCRIPTION,
  applicationName: "Европроекти",
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  keywords: ["европроекти", "европейско финансиране", "България", "ПРЧР", "ПКИП", "оперативни програми", "отворени процедури", "безвъзмездна финансова помощ", "грантове", "финансиране за бизнес", "eufunds", "структурни фондове", "срокове за кандидатстване"],
  authors: [{ name: "s2kdesign.com", url: "https://s2kdesign.com" }],
  creator: "s2kdesign.com",
  publisher: "s2kdesign.com",
  category: "finance",
  applicationCategory: "BusinessApplication",
  alternates: { canonical: "/", languages: { "bg-BG": "/" } },
  robots: { index: true, follow: true, nocache: false, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: {
    type: "website", locale: "bg_BG", url: "/", siteName: "Европроекти", title: TITLE, description: DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Европроекти — Табло за европейско финансиране за България", type: "image/png" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og-image.png"], creator: "@s2kdesign", site: "@s2kdesign" },
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "any" }], shortcut: "/favicon.svg", apple: "/favicon.svg" },
  manifest: "/site.webmanifest",
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport = { themeColor: "#0b6ea3", width: "device-width", initialScale: 1, colorScheme: "light" };

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Европроекти",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "bg-BG",
  description: DESCRIPTION,
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  author: { "@type": "Organization", name: "s2kdesign.com", url: "https://s2kdesign.com" },
  publisher: { "@type": "Organization", name: "s2kdesign.com", url: "https://s2kdesign.com" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="bg">
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        <ErrorReporter />
        <AppChrome />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
