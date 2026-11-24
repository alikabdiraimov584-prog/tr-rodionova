import "server-only";
import Script from "next/script";
import { headers } from "next/headers";
import { activeIntegration } from "@/lib/integrations/store";

/**
 * Сторонние счётчики (Яндекс Метрика, GA4). Ставятся только когда посетительница приняла cookie
 * (tr_consent=all) — так работает согласие по 152-ФЗ. Скрипты получают nonce из CSP.
 */
export async function ThirdPartyTags() {
  const [metrika, ga] = await Promise.all([activeIntegration("metrika"), activeIntegration("ga4")]);
  if (!metrika?.config.counterId && !ga?.config.measurementId) return null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const counter = metrika?.config.counterId?.replace(/\D/g, "");
  const ga4 = ga?.config.measurementId?.replace(/[^A-Z0-9-]/gi, "");
  const webvisor = /^(on|да|yes|1|true|вкл)/i.test((metrika?.config.webvisor ?? "").trim()); // поле текстовое: принимаем «on», «да», «1»
  return (
    <Script id="shop-analytics-consent" nonce={nonce} strategy="afterInteractive">
      {`(() => {
        function load(src) {
          const tag = document.createElement("script");
          tag.async = true;
          tag.src = src;
          document.head.appendChild(tag);
        }
        function start() {
          if (!document.cookie.split("; ").includes("tr_consent=all")) return;
          window.removeEventListener("tr:analytics-consent", start);
          const counter = ${JSON.stringify(counter || null)};
          if (counter) {
            window.ym = window.ym || function() { (window.ym.a = window.ym.a || []).push(arguments); };
            window.ym.l = Date.now();
            window.__trMetrika = Number(counter);
            window.ym(Number(counter), "init", {ssr:true, clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:${webvisor}, ecommerce:"dataLayer"});
            load("https://mc.yandex.ru/metrika/tag.js");
          }
          const ga4 = ${JSON.stringify(ga4 || null)};
          if (ga4) {
            window.dataLayer = window.dataLayer || [];
            window.gtag = function() { window.dataLayer.push(arguments); };
            window.gtag("js", new Date());
            window.gtag("config", ga4, {anonymize_ip:true});
            load("https://www.googletagmanager.com/gtag/js?id=" + ga4);
          }
        }
        window.addEventListener("tr:analytics-consent", start);
        start();
      })();`}
    </Script>
  );
}
