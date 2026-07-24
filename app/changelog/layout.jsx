export const metadata = {
  title: "Промени",
  description: "История на промените в Euro-Funding — нови функции, подобрения и поправки по таблото за европейско финансиране.",
  alternates: { canonical: "/changelog" },
  robots: { index: true, follow: true },
  openGraph: { images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Euro-Funding", type: "image/png" }],
    title: "Промени",
    description: "История на промените в Euro-Funding — нови функции, подобрения и поправки.",
    url: "/changelog",
  },
};

export default function ChangelogLayout({ children }) {
  return children;
}
