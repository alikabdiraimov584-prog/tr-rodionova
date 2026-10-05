import { Suspense } from "react";
import { ShopHeader, ShopFooter } from "@/components/shop/header";
import { Analytics } from "@/components/analytics";
import { getSettingOrDefault } from "@/lib/settings";
import { JsonLd, organizationJsonLd, siteUrl, storeJsonLd } from "@/lib/seo";
import { ThirdPartyTags } from "@/components/third-party-tags";

// Витрина читает каталог и настройки из базы на каждый запрос; при сборке база недоступна
export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const [brand, seller] = await Promise.all([getSettingOrDefault("brand"), getSettingOrDefault("seller")]);
  const store = storeJsonLd(brand, seller);
  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd(brand, seller),
          ...(store ? [store] : []),
          { "@context": "https://schema.org", "@type": "WebSite", name: brand.name, url: siteUrl(), potentialAction: { "@type": "SearchAction", target: `${siteUrl()}/catalog?q={search_term_string}`, "query-input": "required name=search_term_string" } },
        ]}
      />
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
