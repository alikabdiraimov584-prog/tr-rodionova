import { Suspense } from "react";
import { ShopHeader, ShopFooter } from "@/components/shop/header";
import { Analytics } from "@/components/analytics";
import { db } from "@/lib/db";
import { getSettingOrDefault } from "@/lib/settings";
import { JsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { ThirdPartyTags } from "@/components/third-party-tags";

// Витрина читает каталог и настройки из базы на каждый запрос; при сборке база недоступна
export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const [brand, seller, loyalty, tiers] = await Promise.all([
    getSettingOrDefault("brand"),
    getSettingOrDefault("seller"),
    getSettingOrDefault("loyalty"),
    db.loyaltyTier.findMany({ orderBy: { threshold: "asc" } }).catch(() => []),
  ]);
  return (
    <>
      <JsonLd data={[organizationJsonLd(brand, seller, { tiers, loyalty }), websiteJsonLd(brand)]} />
      <ThirdPartyTags />
      <ShopHeader />
      <main className="flex-1">{children}</main>
      <ShopFooter />
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
    </>
  );
}
