import "./globals.css";

export const metadata = {
  title: "Европроекти — Дашборд",
  description:
    "Ежедневно обновяван преглед на активни и предстоящи европроцедури за България.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="bg">
      <body>{children}</body>
    </html>
  );
}
