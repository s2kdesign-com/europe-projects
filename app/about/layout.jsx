export const metadata = {
  title: "За Европроекти — AI платформа за финансиране",
  description: "Европроекти е платформа, която събира, структурира и анализира с изкуствен интелект активните европейски и национални процедури за финансиране в България.",
  alternates: { canonical: "/about", languages: { "bg-BG": "/about", "x-default": "/about" } },
  robots: { index: true, follow: true },
  openGraph: {
    title: "За Европроекти — AI платформа за финансиране | Европроекти",
    description: "Как работи платформата, какви процедури показва и за кого е подходяща.",
    url: "/about",
  },
};

export default function AboutLayout({ children }) {
  return children;
}
