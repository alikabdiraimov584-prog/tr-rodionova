import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/money";
import { AddToCart } from "@/components/shop/add-to-cart";
import { ProductCard } from "@/components/shop/product-card";
import { toggleWishlistAction } from "@/app/actions/shop";
import { SizeAdvisor } from "@/components/shop/size-advisor";
import { JsonLd, absolute, breadcrumbJsonLd } from "@/lib/seo";

async function load(slug: string) {
  return db.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { order: "asc" } },
      variants: { orderBy: { sku: "asc" } },
      category: true,
      reviews: { where: { isPublic: true }, include: { user: { select: { firstName: true, height: true, preferredSize: true } } }, orderBy: { createdAt: "desc" } },
      articles: { where: { publishedAt: { lte: new Date() } }, select: { slug: true, title: true } },
      lookItems: { include: { look: { include: { items: { include: { product: { include: { images: { orderBy: { order: "asc" } }, variants: true } } }, orderBy: { order: "asc" } } } } }, take: 2 },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p || p.status !== "ACTIVE") return { title: "Товар" };
  const description = p.description ? `${p.description.slice(0, 160)}${p.description.length > 160 ? "…" : ""}` : undefined;
  return {
    title: `${p.name} — купить в T.Rodionova`,
    description,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { type: "website", title: p.name, description, url: `/product/${p.slug}`, images: p.images.slice(0, 3).map((i) => ({ url: i.url, alt: i.alt ?? p.name })) },
  };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p || p.status !== "ACTIVE") notFound();
  const user = await getCurrentCustomer();
  if (p.earlyAccessUntil && p.earlyAccessUntil > new Date() && !user?.loyaltyTier?.earlyAccess) {
    redirect(`/circle?early=${p.slug}`);
  }
  const [inWishlist, tier, related] = await Promise.all([
    user ? db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId: p.id } } }) : null,
    user?.loyaltyTier ?? db.loyaltyTier.findFirst({ orderBy: { threshold: "asc" } }),
    db.product.findMany({ where: { status: "ACTIVE", isPreloved: false, categoryId: p.categoryId, id: { not: p.id } }, include: { images: { orderBy: { order: "asc" } }, variants: true }, take: 4 }),
  ]);
  const pts = Math.floor((p.price * (tier?.cashbackPct ?? 3)) / 100 / 100);
  // «С этим носят»: вещи из тех же образов лукбука, иначе соседи по категории
  const lookMates = p.lookItems.flatMap((li) => li.look.items.map((it) => it.product)).filter((r, i, arr) => r.id !== p.id && r.status === "ACTIVE" && arr.findIndex((x) => x.id === r.id) === i).slice(0, 4);
  const wornWith = lookMates.length > 0 ? lookMates : related;
  const rating = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : null;
  const specs: [string, string | null | undefined][] = [
    ["Состав", p.composition],
    ["Материал", p.material],
    ["Уход", p.care],
    ["Производство", p.madeIn],
    ["Артикул", p.sku],
    ...(p.isPreloved ? [["Состояние", p.condition] as [string, string | null]] : []),
    ...(p.isPreorder ? [["Отшив", p.preorderShipAt ? `к ${formatDate(p.preorderShipAt)}` : "4–6 недель"] as [string, string]] : []),
  ];
  const inStock = p.isPreorder || p.variants.some((v) => v.stock - v.reserved > 0);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description ?? undefined,
    sku: p.sku,
    brand: { "@type": "Brand", name: "T.Rodionova" },
    material: p.composition ?? undefined,
    category: p.category?.name,
    image: p.images.map((i) => absolute(i.url)),
    url: absolute(`/product/${p.slug}`),
    offers: {
      "@type": "Offer",
      priceCurrency: "RUB",
      price: (p.price / 100).toFixed(2),
      availability: inStock ? (p.isPreorder ? "https://schema.org/PreOrder" : "https://schema.org/InStock") : "https://schema.org/OutOfStock",
      itemCondition: p.isPreloved ? "https://schema.org/UsedCondition" : "https://schema.org/NewCondition",
      url: absolute(`/product/${p.slug}`),
      seller: { "@type": "Organization", name: "T.Rodionova" },
    },
    ...(rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rating.toFixed(1), reviewCount: p.reviews.length } } : {}),
  };
  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-6">
      <JsonLd data={[productJsonLd, breadcrumbJsonLd([{ name: "Главная", path: "/" }, { name: "Каталог", path: "/catalog" }, ...(p.category ? [{ name: p.category.name, path: `/catalog?category=${p.category.slug}` }] : []), { name: p.name, path: `/product/${p.slug}` }])]} />
      <nav className="py-3 text-[0.66rem] uppercase tracking-[0.1em] text-muted [&_a]:inline-block [&_a]:py-1">
        <Link href="/catalog" className="hover:text-ink">Каталог</Link>
        {p.category && <> / <Link href={`/catalog?category=${p.category.slug}`} className="hover:text-ink">{p.category.name}</Link></>}
        {p.isPreloved && <> / <Link href="/preloved" className="hover:text-ink">Pre-loved</Link></>}
      </nav>
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] lg:grid-cols-[1.4fr_1fr] lg:gap-10">
        <div className="grid grid-cols-2 gap-1">
          {p.images.map((img, i) => (
            <div key={img.id} className={`relative aspect-[3/4] bg-sand ${i === 0 ? "col-span-2 md:col-span-1" : ""}`}>
              <Image src={img.url} alt={img.alt ?? p.name} fill quality={85} priority={i === 0} sizes="(min-width: 768px) 30vw, 100vw" className="object-cover" />
            </div>
          ))}
        </div>
        <div className="min-w-0 md:sticky md:top-32 md:self-start">
          <div className="flex items-start justify-between gap-4">
            <h1 className="min-w-0 text-xl">{p.name}</h1>
            <div className="shrink-0 text-right text-base">{formatMoney(p.price)}{p.compareAt && <div className="text-xs text-muted line-through">{formatMoney(p.compareAt)}</div>}</div>
          </div>
          <div className="mt-1 text-[0.68rem] uppercase tracking-[0.08em] text-muted">
            {p.isPreorder ? "Предзаказ · " : ""}{p.isPreloved ? `Pre-loved · ${p.condition ?? ""} · ` : ""}+{pts.toLocaleString("ru-RU")} баллов Circle{rating ? ` · ★ ${rating.toFixed(1)} (${p.reviews.length})` : ""}
          </div>
          <p className="mt-5 text-sm leading-relaxed text-ink/85">{p.description}</p>
          {p.isPreorder && <p className="mt-3 border border-line bg-ivory px-3 py-2 text-xs text-ink/80">Предзаказ: вещь отшивается под вас {p.preorderShipAt ? `к ${formatDate(p.preorderShipAt)}` : "в течение 4–6 недель"}. Оплата при оформлении, баллы начисляются после получения.</p>}
          <div className="mt-5"><SizeAdvisor product={p} user={user} /></div>
          <div className="mt-4">
            <AddToCart slug={p.slug} loggedIn={!!user} preorder={p.isPreorder} variants={p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, colorHex: v.colorHex, available: v.stock - v.reserved }))} />
          </div>
          <ul className="mt-3 space-y-1 text-[0.78rem] text-ink/80">
            <li>Курьер по Москве и области завтра, по России 2–7 дней</li>
            <li>Примерка 15 минут перед покупкой: платите только за то, что подошло</li>
            <li>Возврат 14 дней, курьер заберёт бесплатно</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <form action={toggleWishlistAction} className="flex-1">
              <input type="hidden" name="productId" value={p.id} />
              <input type="hidden" name="back" value={`/product/${p.slug}`} />
              <button className="btn-outline w-full">{inWishlist ? "В избранном" : "В избранное"}</button>
            </form>
            <Link href="/sizes" className="btn-ghost shrink-0">Размеры</Link>
          </div>
          <dl className="mt-6 divide-y divide-line border-y border-line text-[0.78rem]">
            {specs.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[90px_1fr] gap-3 py-2.5 sm:grid-cols-[110px_1fr]"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
            ))}
            <div className="grid grid-cols-[90px_1fr] gap-3 py-2.5 sm:grid-cols-[110px_1fr]"><dt className="text-muted">Доставка</dt><dd>Курьер с примеркой по Москве и Петербургу за 1–2 дня, СДЭК по России 2–7 дней. <Link href="/delivery" className="underline">Подробнее</Link></dd></div>
            <div className="grid grid-cols-[90px_1fr] gap-3 py-2.5 sm:grid-cols-[110px_1fr]"><dt className="text-muted">Возврат</dt><dd>14 дней с момента получения. Для Privé — бесплатный обратный забор.</dd></div>
          </dl>
          {(p.lookItems.length > 0 || p.articles.length > 0) && (
            <div className="mt-5 text-[0.72rem] text-muted">
              {p.lookItems.map((li) => <div key={li.id}>В образе: <Link href={`/lookbook/${li.look.slug}`} className="text-ink underline">{li.look.title}</Link></div>)}
              {p.articles.map((a) => <div key={a.slug}>В журнале: <Link href={`/journal/${a.slug}`} className="text-ink underline">{a.title}</Link></div>)}
            </div>
          )}
        </div>
      </div>

      {p.reviews.length > 0 && (
        <section className="mt-16 border-t border-line pt-6">
          <h2>Отзывы · {p.reviews.length}</h2>
          <div className="mt-4 grid gap-1 sm:grid-cols-2 md:grid-cols-3">
            {p.reviews.map((r) => (
              <div key={r.id} className="border border-line p-4 text-sm">
                <div className="text-[0.68rem] tracking-[0.1em] text-muted">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} · {r.user.firstName}{r.user.height ? ` · рост ${r.user.height}` : ""}{r.user.preferredSize ? ` · размер ${r.user.preferredSize}` : ""}</div>
                <p className="mt-2">{r.text}</p>
                <div className="mt-2 text-[0.68rem] text-muted">{formatDate(r.createdAt)}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      {wornWith.length > 0 && (
        <section className="mt-16 border-t border-line pt-6">
          <h2 className="mb-3">С этим носят</h2>
          <div className="grid grid-cols-2 gap-1 md:grid-cols-4">{wornWith.map((r) => <ProductCard key={r.id} p={r} />)}</div>
        </section>
      )}
    </div>
  );
}
