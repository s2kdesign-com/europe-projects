export const metadata = {
  title: "Условия за ползване",
  description: "Условията, които уреждат достъпа до и използването на платформата Европроекти, управлявана от S2K Design ЕООД.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
  openGraph: { images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Европроекти", type: "image/png" }],
    title: "Условия за ползване | Европроекти",
    description: "Условията, които уреждат достъпа до и използването на платформата Европроекти, управлявана от S2K Design ЕООД.",
    url: "/terms",
  },
};

export default function TermsLayout({ children }) {
  return children;
}
