import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import "./globals.css";

const serif = DM_Serif_Display({ variable: "--font-dm-serif", subsets: ["latin"], weight: "400" });
const sans = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"], weight: ["300", "400", "500"] });

export const metadata: Metadata = {
  title: { default: "T.Rodionova — Premium womenswear", template: "%s — T.Rodionova" },
  description: "Тихая роскошь. Шерсть, кашемир и шёлк. Женская одежда, сшитая в Европе.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${serif.variable} ${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
