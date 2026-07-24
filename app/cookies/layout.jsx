export const metadata = {
  title: "Политика за бисквитките",
  description: "Какви бисквитки и локално хранилище използва платформата Euro-Funding, управлявана от S2K Design ЕООД, и как да управлявате съгласието си.",
  alternates: { canonical: "/cookies" },
  robots: { index: true, follow: true },
  openGraph: { images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Euro-Funding", type: "image/png" }],
    title: "Политика за бисквитките",
    description: "Какви бисквитки използва платформата Euro-Funding и как да управлявате съгласието си.",
    url: "/cookies",
  },
};

export default function CookiesLayout({ children }) {
  return children;
}
