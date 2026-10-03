import { Suspense } from "react";
import { ShopHeader, ShopFooter } from "@/components/shop/header";
import { Analytics } from "@/components/analytics";
import { getSetting } from "@/lib/settings";
import { JsonLd, organizationJsonLd, siteUrl } from "@/lib/seo";

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const brand = await getSetting("brand");
  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd(brand),
          { "@context": "https://schema.org", "@type": "WebSite", name: brand.name, url: siteUrl(), potentialAction: { "@type": "SearchAction", target: `${siteUrl()}/catalog?q={search_term_string}`, "query-input": "required name=search_term_string" } },
        ]}
      />
      <ShopHeader />
      <main className="flex-1">{children}</main>
      <ShopFooter />
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
    </>
  );
}
