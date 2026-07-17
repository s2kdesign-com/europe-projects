import "./globals.css";
import "./overview.css";
import "./calendar.css";
import "./auth.css";
import "./admin.css";
import "./header.css";
import "./footer.css";
import "./site.css";
import "./i18n.css";
import ErrorReporter from "./components/ErrorReporter.jsx";
import AppChrome from "./components/AppChrome.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import I18nProvider from "./components/i18n/I18nProvider.jsx";

// No-flash: определя езика и задава <html lang/dir> ПРЕДИ хидратацията, за да не
// мига интерфейсът от български към избрания език. Приоритет: URL ?lang → ръчен
// guest избор → browser. Профилният език (за логнат потребител) се прилага след
// зареждане на сесията. Списъкът с кодове е дублиран тук нарочно (inline скрипт
// не може да импортира модули); синхронизиран е с app/lib/i18n/locales.js.
const NO_FLASH = `(function(){try{
var S=['bg','en','de','fr','es','it','ro','el','pl','cs','sk','hu','nl','pt','tr','uk','sr','hr','sl','sv','da','fi','et','lv','lt'];
var R=['ar','he','fa','ur'];
function n(x){if(!x)return null;x=String(x).toLowerCase().replace('_','-');if(S.indexOf(x)>-1)return x;var b=x.split('-')[0];return S.indexOf(b)>-1?b:null;}
var l=null;
try{l=n(new URLSearchParams(location.search).get('lang'));}catch(e){}
if(!l){try{if(localStorage.getItem('evroproekti_language_mode')==='manual')l=n(localStorage.getItem('evroproekti_language'));}catch(e){}}
if(!l){var a=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language];for(var i=0;i<a.length;i++){var m=n(a[i]);if(m){l=m;break;}}}
if(!l)l='bg';
document.documentElement.lang=l;document.documentElement.dir=R.indexOf(l)>-1?'rtl':'ltr';
window.__I18N_INITIAL=l;
}catch(e){}})();`;

const SITE_URL = "https://euro-funds.eu";

const TITLE = "Европроекти — Табло за европейско финансиране за България";
const DESCRIPTION =
  "Ежедневно обновяван преглед на активни и предстоящи европроцедури за България — срокове, бюджети и допустими кандидати. Данни от официални източници.";

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
  alternates: { canonical: "/", languages: { "bg-BG": "/", "x-default": "/" } },
  // Верификация за Google Search Console / Bing (задава се чрез env при билд;
  // ако липсва — просто не се извежда). Не hardcode-ваме кодове.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
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
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        <I18nProvider>
          <ErrorReporter />
          <AppChrome />
          {children}
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
