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

/**
 * Постоянные идентификаторы сущностей (@id). Один и тот же бренд, основательница, сайт, шоурум и программа
 * лояльности на всех страницах ссылаются на эти адреса — так поисковики и ИИ понимают, что речь об одном объекте.
 */
export function ids() {
  const base = siteUrl();
  return { organization: `${base}/#organization`, brand: `${base}/#brand`, website: `${base}/#website`, founder: `${base}/about#founder`, store: `${base}/showroom#store`, program: `${base}/circle#program` };
}

type BrandLike = { name: string; phone: string; email: string; telegram?: string; description?: string; foundedYear?: string; founder?: string; city?: string; instagram?: string; vk?: string; pinterest?: string; youtube?: string; dzen?: string; yandexBusiness?: string; twoGis?: string; wikidata?: string; showroomGeo?: string };
type SellerLike = { name?: string; inn?: string; address?: string; hours?: string; showroom?: string };
type TierLike = { code: string; name: string; threshold: number; cashbackPct: number; freeShipping?: boolean; freeReturns?: boolean; earlyAccess?: boolean; stylist?: boolean };
type LoyaltyLike = { welcomePoints: number; referralPoints: number; pointsExpireDays: number };
type DeliveryLike = { freeFrom: number; courier: number; cdek: number };

const SCHEMA = "https://schema.org/";

/** Логотип растровым квадратом: Google и Яндекс не принимают SVG для logo Organization. */
export function logoJsonLd() {
  return { "@type": "ImageObject", url: absolute("/logo.png"), width: 512, height: 512 };
}

/** Ссылки на карточки бренда на других площадках: по ним поисковики и ИИ сверяют, что это одна и та же сущность. */
export function brandSameAs(brand: BrandLike) {
  return [brand.telegram, brand.instagram, brand.vk, brand.pinterest, brand.youtube, brand.dzen, brand.yandexBusiness, brand.twoGis, brand.wikidata].filter((u): u is string => !!u && /^https?:\/\//.test(u));
}

/** Основательница как Person со стабильным @id: автор статей и founder организации — одна сущность. */
export function founderJsonLd(brand: BrandLike) {
  if (!brand.founder) return undefined;
  return {
    "@type": "Person",
    "@id": ids().founder,
    name: brand.founder,
    jobTitle: "Основательница и дизайнер",
    url: absolute("/about#founder"),
    worksFor: { "@id": ids().organization },
    knowsAbout: ["дизайн женской одежды", "натуральные ткани: шерсть, кашемир, шёлк, хлопок", "индивидуальный пошив и посадка"],
  };
}

/** Общие условия возврата: 14 дней, обратная доставка за счёт покупательницы (для Privé — бесплатно, это выше уровня политики). */
export function returnPolicyJsonLd(hasStore = false) {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "RU",
    returnPolicyCountry: "RU",
    returnPolicyCategory: `${SCHEMA}MerchantReturnFiniteReturnWindow`,
    merchantReturnDays: 14,
    returnMethod: [`${SCHEMA}ReturnByMail`, ...(hasStore ? [`${SCHEMA}ReturnInStore`] : [])],
    returnFees: `${SCHEMA}ReturnFeesCustomerResponsibility`,
    refundType: `${SCHEMA}FullRefund`,
    itemCondition: `${SCHEMA}NewCondition`,
    merchantReturnLink: absolute("/delivery#returns"),
  };
}

/** Программа Circle официальным типом MemberProgram: баллы, уровни и порог входа читаются машинно. */
export function memberProgramJsonLd(tiers: TierLike[], loyalty: LoyaltyLike) {
  return {
    "@type": "MemberProgram",
    "@id": ids().program,
    name: "T.Rodionova Circle",
    url: absolute("/circle"),
    description: `${loyalty.welcomePoints.toLocaleString("ru-RU")} баллов за регистрацию, 1 балл = 1 ₽, баллами можно оплатить до 30% заказа. Уровни: ${tiers.map((t) => `${t.name} — ${t.cashbackPct}% баллами`).join(", ")}. Баллы действуют ${loyalty.pointsExpireDays} дней.`,
    hostingOrganization: { "@id": ids().organization },
    hasTiers: tiers.map((t) => ({
      "@type": "MemberProgramTier",
      "@id": `${absolute("/circle")}#${t.code.toLowerCase()}`,
      name: t.name,
      url: `${absolute("/circle")}#${t.code.toLowerCase()}`,
      hasTierBenefit: [`${SCHEMA}TierBenefitLoyaltyPoints`, ...(t.freeShipping ? [`${SCHEMA}TierBenefitLoyaltyShipping`] : []), ...(t.freeReturns ? [`${SCHEMA}TierBenefitLoyaltyReturns`] : [])],
      membershipPointsEarned: { "@type": "QuantitativeValue", value: t.cashbackPct, unitText: "% от суммы покупки баллами" },
      hasTierRequirement: t.threshold ? { "@type": "MonetaryAmount", currency: "RUB", value: t.threshold / 100, description: "покупки за 12 месяцев" } : "Регистрация на сайте",
    })),
  };
}

/** Карточка сущности бренда: реквизиты, основательница, площадки, политика возврата, программа лояльности, шоурум. */
/** Телефон-заглушка из настроек по умолчанию («000-00-00») в разметку не попадает: лучше без номера, чем с выдуманным. */
export function publicPhone(phone: string | undefined) {
  return phone && !/0{3}-0{2}-0{2}/.test(phone) ? phone : undefined;
}

export function organizationJsonLd(brand: BrandLike, seller?: SellerLike, extra: { tiers?: TierLike[]; loyalty?: LoyaltyLike } = {}) {
  const founder = founderJsonLd(brand);
  const sameAs = brandSameAs(brand);
  const hasStore = !!seller?.showroom;
  const phone = publicPhone(brand.phone);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ids().organization,
    name: brand.name,
    alternateName: ["Т.Родионова", "T. Rodionova"],
    url: siteUrl(),
    logo: logoJsonLd(),
    image: absolute("/logo.png"),
    description: brand.description || undefined,
    foundingDate: brand.foundedYear || undefined,
    foundingLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: brand.city || "Москва", addressCountry: "RU" } },
    founder,
    email: brand.email,
    ...(phone ? { telephone: phone } : {}),
    areaServed: "RU",
    knowsAbout: ["женская одежда премиум-класса", "натуральные волокна: шерсть, кашемир, шёлк, хлопок", "ткани Бьеллы и Комо", "малотиражный пошив в Португалии и Литве"],
    ...(seller?.name ? { legalName: seller.name } : {}),
    ...(seller?.inn ? { taxID: seller.inn } : {}),
    // публичный адрес — только шоурум; адрес регистрации ИП остаётся в оферте и реквизитах, иначе NAP бренда «Москва» противоречит разметке
    ...(hasStore ? { address: { "@type": "PostalAddress", streetAddress: seller!.showroom, addressLocality: brand.city || "Москва", addressCountry: "RU" } } : {}),
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer service", ...(phone ? { telephone: phone } : {}), email: brand.email, availableLanguage: ["ru"], areaServed: "RU" }],
    sameAs,
    brand: { "@type": "Brand", "@id": ids().brand, name: brand.name, logo: logoJsonLd(), sameAs },
    hasMerchantReturnPolicy: returnPolicyJsonLd(hasStore),
    ...(extra.tiers?.length && extra.loyalty ? { hasMemberProgram: memberProgramJsonLd(extra.tiers, extra.loyalty) } : {}),
    ...(hasStore ? { location: { "@id": ids().store } } : {}),
  };
}

/** Сайт как WebSite с издателем и поиском по каталогу (/catalog?q= действительно ищет по названию, составу и описанию). */
export function websiteJsonLd(brand: BrandLike) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": ids().website,
    name: brand.name,
    alternateName: "Т.Родионова",
    url: siteUrl(),
    inLanguage: "ru-RU",
    publisher: { "@id": ids().organization },
    potentialAction: { "@type": "SearchAction", target: `${siteUrl()}/catalog?q={search_term_string}`, "query-input": "required name=search_term_string" },
  };
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_RU: Record<string, number> = { пн: 0, вт: 1, ср: 2, чт: 3, пт: 4, сб: 5, вс: 6 };

/** «ежедневно 10:00–21:00» или «пн–пт 11:00–20:00, сб 12:00–18:00» → openingHoursSpecification; непонятный текст — пусто. */
export function parseHours(text: string | undefined) {
  if (!text) return [];
  const out: { "@type": "OpeningHoursSpecification"; dayOfWeek: string[]; opens: string; closes: string }[] = [];
  for (const part of text.split(/[,;]/)) {
    const time = part.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
    if (!time) continue;
    const opens = `${time[1].padStart(2, "0")}:${time[2]}`;
    const closes = `${time[3].padStart(2, "0")}:${time[4]}`;
    let days: string[] = [];
    if (/ежедневно|без выходных|каждый день/i.test(part)) days = DAYS;
    else {
      const range = part.match(/(пн|вт|ср|чт|пт|сб|вс)\s*[–—-]\s*(пн|вт|ср|чт|пт|сб|вс)/i);
      if (range) {
        const a = DAY_RU[range[1].toLowerCase()];
        const b = DAY_RU[range[2].toLowerCase()];
        for (let i = a; i <= b; i++) days.push(DAYS[i]);
      } else {
        for (const m of part.matchAll(/\b(пн|вт|ср|чт|пт|сб|вс)\b/gi)) days.push(DAYS[DAY_RU[m[1].toLowerCase()]]);
      }
    }
    if (days.length) out.push({ "@type": "OpeningHoursSpecification", dayOfWeek: days, opens, closes });
  }
  return out;
}

/** Шоурум как магазин: адрес, часы, координаты, карта, карточки Яндекс Бизнес и 2ГИС. Только когда адрес заполнен в CRM → Настройки. */
export function storeJsonLd(brand: BrandLike, seller: SellerLike) {
  if (!seller.showroom) return null;
  const [lat, lng] = (brand.showroomGeo ?? "").split(",").map((x) => Number(x.trim()));
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && !!lat && !!lng;
  const hours = parseHours(seller.hours);
  const sameAs = [brand.yandexBusiness, brand.twoGis].filter((u): u is string => !!u && /^https?:\/\//.test(u));
  return {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    "@id": ids().store,
    name: `${brand.name} — шоурум`,
    url: absolute("/showroom"),
    image: absolute("/logo.png"),
    logo: logoJsonLd(),
    ...(publicPhone(brand.phone) ? { telephone: publicPhone(brand.phone) } : {}),
    email: brand.email,
    address: { "@type": "PostalAddress", streetAddress: seller.showroom, addressLocality: brand.city || "Москва", addressCountry: "RU" },
    ...(hasGeo ? { geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng }, hasMap: brand.yandexBusiness || `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map` } : brand.yandexBusiness ? { hasMap: brand.yandexBusiness } : {}),
    ...(seller.hours ? { openingHours: seller.hours } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    parentOrganization: { "@id": ids().organization },
    brand: { "@id": ids().brand },
    priceRange: "₽₽₽₽",
    currenciesAccepted: "RUB",
    paymentAccepted: "Банковская карта, СБП",
  };
}

/**
 * Условия доставки и возврата для Offer: поисковики показывают их в карточке, ИИ-ответы цитируют.
 * price — цена предложения в копейках: от порога бесплатной доставки тариф 0, как в корзине и на карточке.
 */
export function offerPoliciesJsonLd(delivery: DeliveryLike, hasStore = false, price?: number) {
  const free = price !== undefined && delivery.freeFrom > 0 && price >= delivery.freeFrom;
  const rub = (k: number) => (free ? 0 : k / 100).toFixed(2);
  const time = (min: number, max: number) => ({ "@type": "ShippingDeliveryTime", handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" }, transitTime: { "@type": "QuantitativeValue", minValue: min, maxValue: max, unitCode: "DAY" } });
  return {
    shippingDetails: [
      { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "RU" }, shippingRate: { "@type": "MonetaryAmount", value: rub(delivery.cdek), currency: "RUB" }, deliveryTime: time(2, 7) },
      { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "RU", addressRegion: ["Москва", "Санкт-Петербург"] }, shippingRate: { "@type": "MonetaryAmount", value: rub(delivery.courier), currency: "RUB" }, deliveryTime: time(1, 2) },
    ],
    hasMerchantReturnPolicy: returnPolicyJsonLd(hasStore),
  };
}

type ProductLike = {
  slug: string;
  sku: string;
  name: string;
  description: string | null;
  composition: string | null;
  madeIn: string | null;
  price: number;
  isPreorder: boolean;
  isPreloved: boolean;
  condition: string | null;
  category?: { name: string } | null;
  images: { url: string }[];
  variants: { sku: string; size: string; color: string | null; price: number | null; stock: number; reserved: number }[];
  reviews: { rating: number; text: string | null; createdAt: Date; user: { firstName: string } }[];
};

/**
 * Карточка вещи: ProductGroup с вариантами по размеру и цвету (Google официально читает группы вариаций с 2024 года),
 * у каждого варианта — своё предложение с ценой, наличием и остатком; отзывы покупательниц — как Review с автором и датой.
 * Без вариантов (например, вещь под предзаказ без сетки размеров) — обычный Product.
 */
export function productJsonLd(p: ProductLike, delivery: DeliveryLike, opts: { hasStore?: boolean } = {}) {
  const url = absolute(`/product/${p.slug}`);
  const images = p.images.map((i) => absolute(i.url));
  const colors = [...new Set(p.variants.map((v) => v.color).filter((c): c is string => !!c))];
  const sizes = [...new Set(p.variants.map((v) => v.size))];
  const condition = p.isPreloved ? `${SCHEMA}UsedCondition` : `${SCHEMA}NewCondition`;
  const priceValidUntil = `${new Date().getFullYear()}-12-31`;
  const availability = (free: number) => (p.isPreorder ? `${SCHEMA}PreOrder` : free > 0 ? `${SCHEMA}InStock` : `${SCHEMA}OutOfStock`);
  const offer = (price: number, free: number, offerUrl: string) => ({
    "@type": "Offer",
    url: offerUrl,
    priceCurrency: "RUB",
    price: (price / 100).toFixed(2),
    priceValidUntil,
    availability: availability(free),
    ...(p.isPreorder ? {} : { inventoryLevel: { "@type": "QuantitativeValue", value: Math.max(0, free) } }),
    itemCondition: condition,
    seller: { "@id": ids().organization },
    ...(p.isPreloved ? {} : offerPoliciesJsonLd(delivery, opts.hasStore, price)),
  });
  const common = {
    brand: { "@id": ids().brand },
    manufacturer: { "@id": ids().organization },
    ...(p.composition ? { material: p.composition } : {}),
    ...(p.madeIn && !/^europe$/i.test(p.madeIn) ? { countryOfOrigin: { "@type": "Country", name: p.madeIn } } : {}),
    audience: { "@type": "PeopleAudience", suggestedGender: "female" },
    ...(p.category ? { category: p.category.name } : {}),
    image: images,
  };
  const published = p.reviews.filter((r) => r.text);
  const rating = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : 0;
  const reviews = {
    ...(published.length ? { review: published.map((r) => ({ "@type": "Review", author: { "@type": "Person", name: r.user.firstName }, datePublished: r.createdAt.toISOString().slice(0, 10), reviewBody: r.text, reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 } })) } : {}),
    // агрегат — только когда отзывов хотя бы два: одна оценка не статистика
    ...(p.reviews.length >= 2 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rating.toFixed(1), reviewCount: p.reviews.length, bestRating: 5, worstRating: 1 } } : {}),
  };
  if (!p.variants.length) {
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${url}#group`,
      name: p.name,
      description: p.description ?? undefined,
      sku: p.sku,
      url,
      ...common,
      ...(p.isPreloved && p.condition ? { itemCondition: condition } : {}),
      offers: offer(p.price, p.isPreorder ? 1 : 0, url),
      ...reviews,
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${url}#group`,
    productGroupID: p.sku,
    name: p.name,
    description: p.description ?? undefined,
    url,
    ...common,
    ...(sizes.length ? { size: sizes } : {}),
    ...(colors.length ? { color: colors.join(", ") } : {}),
    variesBy: [`${SCHEMA}size`, ...(colors.length > 1 ? [`${SCHEMA}color`] : [])],
    hasVariant: p.variants.map((v) => {
      const free = v.stock - v.reserved;
      // адрес варианта открывает карточку с выбранным размером (и цветом, если цветов несколько)
      const variantUrl = `${url}?size=${encodeURIComponent(v.size)}${colors.length > 1 && v.color ? `&color=${encodeURIComponent(v.color)}` : ""}`;
      return {
        "@type": "Product",
        "@id": `${url}#${encodeURIComponent(v.sku)}`,
        sku: v.sku,
        name: `${p.name}, ${[v.color, v.size].filter(Boolean).join(", ")}`,
        ...(v.color ? { color: v.color } : {}),
        size: v.size,
        image: images,
        url: variantUrl,
        offers: offer(v.price ?? p.price, free, variantUrl),
      };
    }),
    ...reviews,
  };
}

type ArticleLike = { slug: string; title: string; excerpt: string | null; metaDescription: string | null; coverUrl: string | null; publishedAt: Date | null; updatedAt: Date; category: string | null; keywords: string[] };

/** Статья журнала: автор — основательница (Person с @id), издатель — организация, упомянутые вещи — ссылками на их ProductGroup. */
export function articleJsonLd(a: ArticleLike, brand: BrandLike, products: { slug: string; name: string }[]) {
  const founder = founderJsonLd(brand);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${absolute(`/journal/${a.slug}`)}#article`,
    headline: a.title,
    description: a.metaDescription ?? a.excerpt ?? undefined,
    image: a.coverUrl ? [absolute(a.coverUrl)] : undefined,
    datePublished: a.publishedAt?.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    articleSection: a.category ?? undefined,
    ...(a.category ? { about: [{ "@type": "Thing", name: a.category }] } : {}),
    keywords: a.keywords.join(", ") || undefined,
    inLanguage: "ru-RU",
    mainEntityOfPage: absolute(`/journal/${a.slug}`),
    isPartOf: { "@id": ids().website },
    author: founder ?? { "@id": ids().organization },
    publisher: { "@id": ids().organization },
    ...(products.length ? { mentions: products.map((p) => ({ "@type": "Product", "@id": `${absolute(`/product/${p.slug}`)}#group`, name: p.name, url: absolute(`/product/${p.slug}`) })) } : {}),
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

/** Список вещей на странице каталога, категории или коллекции: структура ассортимента для краулеров. */
export function itemListJsonLd(name: string, items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: absolute(it.path) })),
  };
}
