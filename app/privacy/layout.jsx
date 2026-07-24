export const metadata = {
  title: "Политика за поверителност",
  description: "Как платформата Euro-Funding, управлявана от S2K Design ЕООД, обработва и защитава личните данни.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
  openGraph: { images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Euro-Funding", type: "image/png" }],
    title: "Политика за поверителност",
    description: "Как платформата Euro-Funding, управлявана от S2K Design ЕООД, обработва и защитава личните данни.",
    url: "/privacy",
  },
};

export default function PrivacyLayout({ children }) {
  return children;
}
