import "server-only";
import { headers } from "next/headers";

/** Публичный адрес сайта для канонических ссылок, sitemap и Open Graph. */
export function siteUrl() {
  return (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function absolute(path: string) {
  return path.startsWith("http") ? path : `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Структурированные данные schema.org. Рендерится в <script type="application/ld+json">. */
export async function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  // символ «<» экранируется, чтобы содержимое не могло закрыть тег script; nonce — из CSP текущего запроса
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} />;
}

export function organizationJsonLd(brand: { name: string; phone: string; email: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    url: siteUrl(),
    logo: absolute("/icon.svg"),
    email: brand.email,
    telephone: brand.phone,
    sameAs: [] as string[],
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absolute(it.path) })),
  };
}
