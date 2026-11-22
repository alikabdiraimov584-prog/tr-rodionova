import { Suspense } from "react";
import { ShopHeader, ShopFooter } from "@/components/shop/header";
import { Analytics } from "@/components/analytics";
import { getSettingOrDefault } from "@/lib/settings";
import { JsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { ThirdPartyTags } from "@/components/third-party-tags";

// Витрина читает каталог и настройки из базы на каждый запрос; при сборке база недоступна
export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const [brand, seller] = await Promise.all([
    getSettingOrDefault("brand"),
    getSettingOrDefault("seller"),
  ]);
  return (
    <>
      <JsonLd data={[organizationJsonLd(brand, seller), websiteJsonLd(brand)]} />
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
