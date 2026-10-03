import type { Metadata } from "next";
import { Hanken_Grotesk, Manrope } from "next/font/google";
import "./globals.css";

const grotesk = Hanken_Grotesk({ variable: "--font-grotesk", subsets: ["latin", "latin-ext"], weight: ["300", "400", "500"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"] });

const siteUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "T.Rodionova — Premium womenswear", template: "%s — T.Rodionova" },
  description: "Женская одежда из шерсти, кашемира и шёлка. Сшито в Европе. Доставка по России, примерка курьером.",
  applicationName: "T.Rodionova",
  keywords: ["женская одежда премиум", "quiet luxury", "кашемир", "шёлк", "T.Rodionova", "жакет", "платье", "боди", "брюки палаццо"],
  openGraph: { type: "website", siteName: "T.Rodionova", locale: "ru_RU", url: siteUrl, images: [{ url: "/images/brand/looks/look-01.jpg", width: 700, height: 1000, alt: "T.Rodionova — premium womenswear" }] },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  alternates: { types: { "application/rss+xml": `${siteUrl}/journal/feed.xml` } },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" data-scroll-behavior="smooth" className={`${grotesk.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
