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

type BrandLike = { name: string; phone: string; email: string; telegram?: string; description?: string; foundedYear?: string; founder?: string; city?: string; instagram?: string; vk?: string; pinterest?: string; youtube?: string; dzen?: string; yandexBusiness?: string; twoGis?: string; wikidata?: string; showroomGeo?: string };
type SellerLike = { name?: string; address?: string; hours?: string; showroom?: string };

/** Ссылки на карточки бренда на других площадках: по ним поисковики и ИИ сверяют, что это одна и та же сущность. */
export function brandSameAs(brand: BrandLike) {
  return [brand.telegram, brand.instagram, brand.vk, brand.pinterest, brand.youtube, brand.dzen, brand.yandexBusiness, brand.twoGis, brand.wikidata].filter((u): u is string => !!u && /^https?:\/\//.test(u));
}

export function founderJsonLd(brand: BrandLike) {
  if (!brand.founder) return undefined;
  return { "@type": "Person", name: brand.founder, jobTitle: "Основательница и дизайнер", worksFor: { "@type": "Organization", name: brand.name }, url: absolute("/about") };
}

export function organizationJsonLd(brand: BrandLike, seller?: SellerLike) {
  const founder = founderJsonLd(brand);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: brand.name,
    url: siteUrl(),
    logo: absolute("/icon.svg"),
    description: brand.description || undefined,
    foundingDate: brand.foundedYear || undefined,
    founder,
    email: brand.email,
    telephone: brand.phone,
    areaServed: "RU",
    ...(seller?.name ? { legalName: seller.name } : {}),
    ...(seller?.address ? { address: { "@type": "PostalAddress", streetAddress: seller.address, addressCountry: "RU" } } : {}),
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer service", telephone: brand.phone, email: brand.email, availableLanguage: ["ru"], areaServed: "RU" }],
    sameAs: brandSameAs(brand),
  };
}

/** Шоурум как магазин: адрес, часы, координаты. Только когда адрес заполнен в CRM → Настройки. */
export function storeJsonLd(brand: BrandLike, seller: SellerLike) {
  if (!seller.showroom) return null;
  const [lat, lng] = (brand.showroomGeo ?? "").split(",").map((x) => Number(x.trim()));
  return {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    "@id": `${siteUrl()}/showroom#store`,
    name: `${brand.name} — шоурум`,
    url: absolute("/showroom"),
    image: absolute("/icon.svg"),
    telephone: brand.phone,
    email: brand.email,
    address: { "@type": "PostalAddress", streetAddress: seller.showroom, addressLocality: brand.city || "Москва", addressCountry: "RU" },
    ...(Number.isFinite(lat) && Number.isFinite(lng) && lat && lng ? { geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng } } : {}),
    ...(seller.hours ? { openingHours: seller.hours } : {}),
    parentOrganization: { "@id": `${siteUrl()}/#organization` },
    priceRange: "₽₽₽₽",
    currenciesAccepted: "RUB",
    paymentAccepted: "Банковская карта, СБП",
  };
}

/** Условия доставки и возврата для Offer: поисковики показывают их в карточке, ИИ-ответы цитируют. */
export function offerPoliciesJsonLd(delivery: { freeFrom: number; courier: number; cdek: number }) {
  const rub = (k: number) => (k / 100).toFixed(2);
  return {
    shippingDetails: [
      { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "RU" }, shippingRate: { "@type": "MonetaryAmount", value: rub(delivery.cdek), currency: "RUB" }, deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" }, transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 7, unitCode: "DAY" } } },
      { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "RU", addressRegion: ["Москва", "Санкт-Петербург"] }, shippingRate: { "@type": "MonetaryAmount", value: rub(delivery.courier), currency: "RUB" }, deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" }, transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" } } },
    ],
    hasMerchantReturnPolicy: { "@type": "MerchantReturnPolicy", applicableCountry: "RU", returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow", merchantReturnDays: 14, returnMethod: ["https://schema.org/ReturnByMail", "https://schema.org/ReturnInStore"], itemCondition: "https://schema.org/NewCondition", merchantReturnLink: absolute("/delivery") },
  };
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absolute(it.path) })),
  };
}
