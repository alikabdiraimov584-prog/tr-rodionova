import "server-only";
import { cookies, headers } from "next/headers";
import { activeIntegration } from "@/lib/integrations/store";

/**
 * Сторонние счётчики (Яндекс Метрика, GA4). Ставятся только когда посетительница приняла cookie
 * (tr_consent=all) — так работает согласие по 152-ФЗ. Скрипты получают nonce из CSP.
 */
export async function ThirdPartyTags() {
  const consent = (await cookies()).get("tr_consent")?.value;
  if (consent !== "all") return null;
  const [metrika, ga] = await Promise.all([activeIntegration("metrika"), activeIntegration("ga4")]);
  if (!metrika?.config.counterId && !ga?.config.measurementId) return null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const counter = metrika?.config.counterId?.replace(/\D/g, "");
  const ga4 = ga?.config.measurementId?.replace(/[^A-Z0-9-]/gi, "");
  const webvisor = /^(on|да|yes|1|true|вкл)/i.test((metrika?.config.webvisor ?? "").trim()); // поле текстовое: принимаем «on», «да», «1»
  return (
    <>
      {counter && (
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${counter},"init",{ssr:true,clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:${webvisor},ecommerce:"dataLayer"});window.__trMetrika=${counter};`,
          }}
        />
      )}
      {ga4 && (
        <>
          <script nonce={nonce} async src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`} />
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${ga4}",{anonymize_ip:true});` }} />
        </>
      )}
    </>
  );
}
