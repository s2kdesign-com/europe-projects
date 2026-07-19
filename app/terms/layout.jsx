export const metadata = {
  title: "Условия за ползване",
  description: "Условията, които уреждат достъпа до и използването на платформата Euro-Funding, управлявана от S2K Design ЕООД.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
  openGraph: { images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Euro-Funding", type: "image/png" }],
    title: "Условия за ползване | Euro-Funding",
    description: "Условията, които уреждат достъпа до и използването на платформата Euro-Funding, управлявана от S2K Design ЕООД.",
    url: "/terms",
  },
};

export default function TermsLayout({ children }) {
  return children;
}
