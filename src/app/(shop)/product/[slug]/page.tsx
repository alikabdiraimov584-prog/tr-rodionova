import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getCurrentCustomer } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/money";
import { AddToCart } from "@/components/shop/add-to-cart";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGallery } from "@/components/shop/product-gallery";
import { MobileBuyBar } from "@/components/shop/mobile-buy-bar";
import { IconHeart } from "@/components/shop/icons";
import { isRealPhoto, photoFirst } from "@/lib/photos";
import { chartForProduct, recommendSize } from "@/lib/sizes";
import { dolyameAvailableFor } from "@/lib/payments/dolyame";
import { toggleWishlistAction } from "@/app/actions/shop";
import { SizeAdvisor } from "@/components/shop/size-advisor";
import { JsonLd, breadcrumbJsonLd, faqJsonLd, productJsonLd } from "@/lib/seo";
import { productFaq } from "@/lib/faq";

async function load(slug: string) {
  return db.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { order: "asc" } },
      variants: { orderBy: { sku: "asc" } },
      category: true,
      reviews: { where: { isPublic: true }, include: { user: { select: { firstName: true, height: true, preferredSize: true } } }, orderBy: { createdAt: "desc" } },
      articles: { where: { publishedAt: { lte: new Date() } }, select: { slug: true, title: true } },
      lookItems: { where: { look: { isPublished: true } }, include: { look: { include: { items: { include: { product: { include: { images: { orderBy: { order: "asc" } }, variants: true } } }, orderBy: { order: "asc" } } } } }, take: 2 },
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
  const [inWishlist, tier, related, delivery, seller, installments] = await Promise.all([
    user ? db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId: p.id } } }) : null,
    user?.loyaltyTier ?? db.loyaltyTier.findFirst({ orderBy: { threshold: "asc" } }),
    db.product.findMany({ where: { status: "ACTIVE", isPreloved: false, categoryId: p.categoryId, id: { not: p.id } }, include: { images: { orderBy: { order: "asc" } }, variants: true }, take: 4 }),
    getSetting("delivery"),
    getSetting("seller"),
    // «4 платежа» обещаем, только если оплата Долями подключена и цена в её пределах
    dolyameAvailableFor(p.price).catch(() => false),
  ]);
  const pts = Math.floor((p.price * (tier?.cashbackPct ?? 3)) / 100 / 100);
  // «С этим носят»: вещи из тех же образов лукбука, иначе соседи по категории
  // в подборках под карточкой — только вещи со съёмкой, иначе блок из заглушек выглядит незаконченным
  const lookMates = p.lookItems.flatMap((li) => li.look.items.map((it) => it.product)).filter((r, i, arr) => r.id !== p.id && r.status === "ACTIVE" && isRealPhoto(r.images[0]?.url) && arr.findIndex((x) => x.id === r.id) === i).slice(0, 4);
  const relatedReal = photoFirst(related).filter((r) => isRealPhoto(r.images[0]?.url));
  const wornWith = lookMates.length > 0 ? lookMates : relatedReal;
  const lookSlug = lookMates.length > 0 ? p.lookItems[0]?.look.slug : undefined;
  // размер по меркам из профиля: если подходит точно, он выбран заранее
  const chart = chartForProduct(p);
  const advice = chart && user ? recommendSize(chart, user) : null;
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
  const sizesAll = [...new Set(p.variants.map((v) => v.size))];
  const faq = productFaq(p, sizesAll, delivery, pts);
  const ld = productJsonLd(p, delivery, { hasStore: !!seller.showroom });
  return (
    <div className="mx-auto max-w-[1600px] md:px-5">
      <JsonLd data={[ld, faqJsonLd(faq.map(({ q, a }) => ({ q, a }))), breadcrumbJsonLd([{ name: "Главная", path: "/" }, { name: "Каталог", path: "/catalog" }, ...(p.category ? [{ name: p.category.name, path: `/catalog?category=${p.category.slug}` }] : []), { name: p.name, path: `/product/${p.slug}` }])]} />
      <div className="grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-10 lg:gap-16">
        <ProductGallery images={p.images.map((img) => ({ id: img.id, url: img.url, alt: img.alt }))} name={p.name} />
        <div id="buy" className="min-w-0 scroll-mt-20 px-4 pt-6 md:sticky md:top-24 md:self-start md:px-0 md:pt-10 lg:max-w-[460px]">
          <nav aria-label="Навигация" className="hidden text-[0.66rem] uppercase tracking-[0.12em] text-muted md:block [&_a]:hover:text-ink">
            <Link href="/catalog">Каталог</Link>
            {p.category && <> / <Link href={`/catalog?category=${p.category.slug}`}>{p.category.name}</Link></>}
            {p.isPreloved && <> / <Link href="/preloved">Pre-loved</Link></>}
          </nav>
          <h1 className="mt-0 text-[1.15rem] uppercase tracking-[0.08em] md:mt-4 md:text-[1.35rem]">{p.name}</h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[1.05rem]">{formatMoney(p.price)}</span>
            {p.compareAt && <span className="text-muted line-through">{formatMoney(p.compareAt)}</span>}
            {rating && <a href="#reviews" className="-my-2 py-2 text-[0.75rem] text-muted underline-offset-4 hover:underline">★ {rating.toFixed(1)} · {p.reviews.length} {p.reviews.length === 1 ? "отзыв" : p.reviews.length < 5 ? "отзыва" : "отзывов"}</a>}
          </div>
          {installments && !p.isPreloved && <div className="mt-1 text-[0.78rem]">или 4 платежа по {formatMoney(Math.ceil(p.price / 4 / 100) * 100)} с Долями</div>}
          <div className="mt-1 text-[0.75rem] text-muted">+{pts.toLocaleString("ru-RU")} баллов Circle{p.isPreloved && p.condition ? ` · состояние: ${p.condition}` : ""}</div>
          {p.isPreorder && <p className="mt-4 border-l-2 border-ink pl-3 text-[0.8rem]">Предзаказ: отшиваем под вас {p.preorderShipAt ? `к ${formatDate(p.preorderShipAt).replace(/\.$/, "")}` : "за 4–6 недель"}. Оплата при оформлении, баллы — после получения.</p>}
          <div className="mt-5"><SizeAdvisor product={p} user={user} /></div>
          <div className="mt-5">
            <AddToCart slug={p.slug} loggedIn={!!user} preorder={p.isPreorder} defaultSize={advice?.fit === "точно" ? advice.size : null} variants={p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, colorHex: v.colorHex, available: v.stock - v.reserved }))}>
              <form action={toggleWishlistAction}>
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="back" value={`/product/${p.slug}`} />
                <button aria-label={inWishlist ? "Убрать из избранного" : "В избранное"} aria-pressed={!!inWishlist} className="flex h-12 w-12 items-center justify-center border border-line hover:border-ink"><IconHeart filled={!!inWishlist} /></button>
              </form>
            </AddToCart>
          </div>
          <ul className="mt-5 grid grid-cols-3 gap-2 border-y border-line py-4 text-center text-[0.68rem] uppercase leading-snug tracking-[0.06em] text-muted">
            <li>Примерка<br />курьером</li>
            {/* коротко и в согласии с разметкой Offer: бесплатно от порога из настроек, иначе — срок без привязки к городу */}
            <li>{p.price >= delivery.freeFrom ? <>Бесплатная<br />доставка</> : <>Доставка<br />от 1 дня</>}</li>
            <li>Возврат<br />14 дней</li>
          </ul>
          <div className="divide-y divide-line border-b border-line">
            <details className="group" open>
              <summary className="acc">Описание<span aria-hidden className="acc-mark">+</span></summary>
              <p className="pb-5 text-[0.9rem] leading-relaxed text-ink/85">{p.description}</p>
            </details>
            <details className="group">
              <summary className="acc">Состав и уход<span aria-hidden className="acc-mark">+</span></summary>
              <dl className="space-y-2 pb-5 text-[0.85rem]">
                {specs.filter(([, v]) => v).map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
              </dl>
            </details>
            <details className="group">
              <summary className="acc">Доставка и возврат<span aria-hidden className="acc-mark">+</span></summary>
              <div className="space-y-2 pb-5 text-[0.85rem] text-ink/85">
                <p>Курьер с примеркой по Москве и Петербургу за 1–2 дня: 15 минут на примерку, платите только за то, что подошло. СДЭК по России — 2–7 дней.</p>
                <p>Возврат 14 дней с момента получения. Для уровня Privé обратный забор бесплатный. <Link href="/delivery" className="underline underline-offset-4">Подробнее</Link></p>
              </div>
            </details>
            {p.articles.length > 0 && (
              <details className="group">
                <summary className="acc">Читать в журнале<span aria-hidden className="acc-mark">+</span></summary>
                <ul className="space-y-2 pb-5 text-[0.85rem]">
                  {p.articles.map((a) => <li key={a.slug}><Link href={`/journal/${a.slug}`} className="underline underline-offset-4 hover:opacity-70">{a.title}</Link></li>)}
                </ul>
              </details>
            )}
            <details className="group">
              <summary className="acc">Вопросы о вещи<span aria-hidden className="acc-mark">+</span></summary>
              <dl className="space-y-4 pb-5 text-[0.85rem]">
                {faq.map((f) => (
                  <div key={f.q}>
                    <dt className="font-medium">{f.q}</dt>
                    <dd className="mt-1 text-ink/80">{f.a}{f.href && <> <Link href={f.href} className="underline underline-offset-4">Подробнее</Link></>}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
          {/* образ, в котором снята вещь: если подборки «Собрать образ» ниже нет, ссылка на страницу образа остаётся здесь */}
          {lookMates.length === 0 && p.lookItems.length > 0 && (
            <div className="mt-5 text-[0.78rem] text-muted">
              {p.lookItems.map((li) => <div key={li.id}>В образе: <Link href={`/lookbook/${li.look.slug}`} className="text-ink underline underline-offset-4">{li.look.title}</Link></div>)}
            </div>
          )}
        </div>
      </div>

      {wornWith.length > 0 && (
        <section className="mt-20 px-1 md:px-0">
          <div className="mb-5 flex items-baseline justify-between px-3 md:px-1">
            <h2 className="section-title">{lookMates.length > 0 ? "Собрать образ" : "Вам может понравиться"}</h2>
            {lookSlug && <Link href={`/lookbook/${lookSlug}`} className="nav-link -my-2 py-2 underline underline-offset-4">Весь образ</Link>}
          </div>
          <div className="grid grid-cols-2 gap-x-1 md:grid-cols-4">{wornWith.map((r) => <ProductCard key={r.id} p={r} />)}</div>
        </section>
      )}

      {p.reviews.length > 0 && (
        <section id="reviews" className="mt-16 scroll-mt-20 px-4 md:px-1">
          <h2 className="section-title">Отзывы · {p.reviews.length}</h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            {p.reviews.map((r) => (
              <div key={r.id} className="border-t border-line pt-4 text-[0.88rem]">
                <div className="text-[0.72rem] text-muted">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} · {r.user.firstName}{r.user.height ? ` · рост ${r.user.height}` : ""}{r.user.preferredSize ? ` · размер ${r.user.preferredSize}` : ""}</div>
                <p className="mt-2">{r.text}</p>
                <div className="mt-2 text-[0.72rem] text-muted">{formatDate(r.createdAt)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <MobileBuyBar name={p.name} price={formatMoney(p.price)} label={p.isPreorder ? "Предзаказ" : "Выбрать размер"} />
    </div>
  );
}
