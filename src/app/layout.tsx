import type { Metadata } from "next";
import { Hanken_Grotesk, Manrope } from "next/font/google";
import "./globals.css";

const grotesk = Hanken_Grotesk({ variable: "--font-grotesk", subsets: ["latin", "latin-ext"], weight: ["300", "400", "500"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "T.Rodionova — Premium womenswear", template: "%s — T.Rodionova" },
  description: "Женская одежда из шерсти, кашемира и шёлка. Сшито в Европе. Доставка по России, примерка курьером.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" data-scroll-behavior="smooth" className={`${grotesk.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
