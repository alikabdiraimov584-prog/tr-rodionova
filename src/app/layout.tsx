import type { Metadata } from "next";
import { Golos_Text, Manrope } from "next/font/google";
import "./globals.css";
import { activeIntegration } from "@/lib/integrations/store";

// Витрина: Golos Text — гротеск с полной кириллицей (прежний Hanken Grotesk кириллицы не имел, и русский текст шёл системным Arial)
const golos = Golos_Text({ variable: "--font-golos", subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"] });

// CSP с nonce на каждый запрос: ни одна страница не может быть статической, иначе её скрипты останутся без nonce
export const dynamic = "force-dynamic";

const siteUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function generateMetadata(): Promise<Metadata> {
  // коды подтверждения Вебмастера и Search Console — из CRM → Интеграции
  let verification: Metadata["verification"];
  try {
    const [ya, go] = await Promise.all([activeIntegration("yandex_webmaster"), activeIntegration("google_search_console")]);
    verification = { ...(ya?.config.verification ? { yandex: ya.config.verification } : {}), ...(go?.config.verification ? { google: go.config.verification } : {}) };
  } catch {
    verification = undefined;
  }
  return { ...baseMetadata, verification };
}

const baseMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "T.Rodionova — Premium womenswear", template: "%s — T.Rodionova" },
  description: "Женская одежда из шерсти, кашемира и шёлка. Сшито в Европе. Доставка по России, примерка курьером.",
  applicationName: "T.Rodionova",
  keywords: ["женская одежда премиум", "quiet luxury", "кашемир", "шёлк", "T.Rodionova", "жакет", "платье", "боди", "брюки палаццо"],
  // без url: иначе все страницы без своего openGraph выдавали бы в og:url адрес главной
  openGraph: { type: "website", siteName: "T.Rodionova", locale: "ru_RU", images: [{ url: "/images/brand/looks/look-01.jpg", width: 700, height: 1000, alt: "T.Rodionova — premium womenswear" }] },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  alternates: { types: { "application/rss+xml": `${siteUrl}/journal/feed.xml` } },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" data-scroll-behavior="smooth" className={`${golos.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
