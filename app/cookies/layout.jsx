export const metadata = {
  title: "Политика за бисквитките",
  description: "Какви бисквитки и локално хранилище използва платформата Европроекти, управлявана от S2K Design ЕООД, и как да управлявате съгласието си.",
  alternates: { canonical: "/cookies" },
  robots: { index: true, follow: true },
  openGraph: { images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Европроекти", type: "image/png" }],
    title: "Политика за бисквитките | Европроекти",
    description: "Какви бисквитки използва платформата Европроекти и как да управлявате съгласието си.",
    url: "/cookies",
  },
};

export default function CookiesLayout({ children }) {
  return children;
}
