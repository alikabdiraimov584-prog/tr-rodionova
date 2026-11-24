import { headers } from "next/headers";
import { Wordmark } from "@/components/brand-marks";
import { Suspense } from "react";
import { ShopHeader, ShopFooter } from "@/components/shop/header";
import { Analytics } from "@/components/analytics";
import { getSettingOrDefault } from "@/lib/settings";
import { JsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { ThirdPartyTags } from "@/components/third-party-tags";

// Run during HTML parsing, before the storefront is painted. Client navigation
// keeps this layout mounted. Without JS or session storage the shop shows directly.
const introScript = `(() => {
  const intro = document.getElementById("shop-intro");
  if (!intro || document.readyState !== "loading" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const key = "tr:shop-intro";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch { return; }
  intro.hidden = false;
  const dismiss = () => { intro.hidden = true; };
  const finish = () => {
    if (intro.hidden) return;
    intro.classList.add("shop-intro-exit");
    setTimeout(dismiss, 610);
  };
  window.addEventListener("pagehide", dismiss, { once: true });
  document.addEventListener("keydown", dismiss, { once: true });
  intro.addEventListener("click", dismiss, { once: true });
  setTimeout(finish, 1900);
})();`;

// Витрина читает каталог и настройки из базы на каждый запрос; при сборке база недоступна
export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const [brand, seller, requestHeaders] = await Promise.all([
    getSettingOrDefault("brand"),
    getSettingOrDefault("seller"),
    headers(),
  ]);
  return (
    <>
      <div id="shop-intro" hidden suppressHydrationWarning aria-hidden="true">
        <Wordmark className="w-[clamp(160px,28vw,225px)]" />
      </div>
      <script nonce={requestHeaders.get("x-nonce") ?? undefined} dangerouslySetInnerHTML={{ __html: introScript }} />
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
