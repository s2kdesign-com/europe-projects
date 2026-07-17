export const metadata = {
  title: "Промени",
  description: "История на промените в Европроекти — нови функции, подобрения и поправки по таблото за европейско финансиране.",
  alternates: { canonical: "/changelog" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Промени | Европроекти",
    description: "История на промените в Европроекти — нови функции, подобрения и поправки.",
    url: "/changelog",
  },
};

export default function ChangelogLayout({ children }) {
  return children;
}
