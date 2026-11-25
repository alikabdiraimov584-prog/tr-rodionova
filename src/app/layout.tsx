import type { Metadata } from "next";
import { Manrope, Noto_Serif_Display, Spectral } from "next/font/google";
import "./globals.css";
import { activeIntegration } from "@/lib/integrations/store";
import { verificationCode } from "@/lib/site-verification";

// Шрифты витрины подобраны по логотипу: заголовки — Noto Serif Display (узкая контрастная антиква, как знак T.Rodionova),
// текст и подписи — Spectral (заглавные с разрядкой повторяют дескриптор PREMIUM WOMENSWEAR). Оба с полной кириллицей.
const display = Noto_Serif_Display({ variable: "--font-display", preload: false, subsets: ["latin", "cyrillic"], weight: ["300", "400", "500"], style: ["normal", "italic"] });
const text = Spectral({ variable: "--font-text", preload: false, subsets: ["latin", "cyrillic"], weight: ["300", "400", "500", "600"], style: ["normal", "italic"] });
// CRM — рабочий интерфейс с таблицами, остаётся на гротеске
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"] });

// CSP с nonce на каждый запрос: ни одна страница не может быть статической, иначе её скрипты останутся без nonce
export const dynamic = "force-dynamic";

const siteUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function generateMetadata(): Promise<Metadata> {
  // коды подтверждения Вебмастера и Search Console — из CRM → Интеграции
  let verification: Metadata["verification"];
  try {
    const [ya, go] = await Promise.all([activeIntegration("yandex_webmaster"), activeIntegration("google_search_console")]);
    // в CRM часто вставляют тег целиком или строку для DNS: на сайт выводится только сам код
    const yandex = verificationCode(ya?.config.verification);
    const google = verificationCode(go?.config.verification);
    verification = { ...(yandex ? { yandex } : {}), ...(google ? { google } : {}) };
  } catch {
    verification = undefined;
  }
  return { ...baseMetadata, verification };
}

const baseMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "T.Rodionova — Premium womenswear", template: "%s — T.Rodionova" },
  description: "Женская одежда из шерсти, кашемира и шёлка. Сшито в Европе. Доставка по России.",
  applicationName: "T.Rodionova",
  keywords: ["женская одежда премиум", "вечерние платья", "кашемир", "шёлк", "T.Rodionova", "жакет", "платье", "боди", "брюки палаццо"],
  // без url: иначе все страницы без своего openGraph выдавали бы в og:url адрес главной
  openGraph: { type: "website", siteName: "T.Rodionova", locale: "ru_RU", images: [{ url: "/images/brand/looks/look-01.jpg", width: 700, height: 1000, alt: "T.Rodionova — premium womenswear" }] },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" data-scroll-behavior="smooth" className={`${display.variable} ${text.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
