import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/money";
import { AddToCart } from "@/components/shop/add-to-cart";
import { RowGrid, SANS, PLAIN_HEADING } from "@/components/shop/row-grid";
import { ProductGallery } from "@/components/shop/product-gallery";
import { MobileBuyBar } from "@/components/shop/mobile-buy-bar";
import { isRealPhoto, photoFirst } from "@/lib/photos";
import { recommendSize } from "@/lib/sizes";
import { toggleWishlistAction } from "@/app/actions/shop";
import { SizeTable } from "@/components/shop/size-table";
import { SizeAdvisor } from "@/components/shop/size-advisor";
import { JsonLd, breadcrumbJsonLd, productJsonLd } from "@/lib/seo";
import { MetrikaGoal } from "@/components/metrika-goal";

async function load(slug: string) {
  return db.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { order: "asc" } },
      variants: { where: { archivedAt: null }, orderBy: { sku: "asc" } },
      category: true,
      reviews: { where: { isPublic: true }, include: { user: { select: { firstName: true, height: true, preferredSize: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p || p.status !== "ACTIVE") return { title: "Товар" };
  const description = p.description ? `${p.description.slice(0, 160)}${p.description.length > 160 ? "…" : ""}` : undefined;
  return {
    // бренд уже в заголовке — шаблон «… — T.Rodionova» не добавляет его второй раз
    title: { absolute: `${p.name} — купить в T.Rodionova` },
    description,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { type: "website", siteName: "T.Rodionova", locale: "ru_RU", title: p.name, description, url: `/product/${p.slug}`, images: p.images.slice(0, 3).map((i) => ({ url: i.url, alt: i.alt ?? p.name })) },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/product/[slug]">) {
  const { slug } = await params;
  // ?size= и ?color= из адресов вариантов (разметка товара, Яндекс и Google): этот размер выбран сразу
  const sp = await searchParams;
  const wantedSize = typeof sp.size === "string" ? sp.size : null;
  const wantedColor = typeof sp.color === "string" ? sp.color : null;
  const p = await load(slug);
  // pre-loved убран из бренда: бывшие вещи витрины pre-loved не открываются
  if (!p || p.status !== "ACTIVE" || p.isPreloved) notFound();
  // скрытая в CRM категория не показывается и в «хлебных крошках»
  const category = p.category?.isActive ? p.category : null;
  const user = await getCurrentCustomer();
  const [inWishlist, related] = await Promise.all([
    user ? db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId: p.id } } }) : null,
    db.product.findMany({ where: { status: "ACTIVE", isPreloved: false, categoryId: p.categoryId, id: { not: p.id } }, include: { images: { orderBy: { order: "asc" } }, variants: { where: { archivedAt: null } } }, take: 4 }),
  ]);
  const relatedReal = photoFirst(related).filter((r) => isRealPhoto(r.images[0]?.url));
  const advice = user ? recommendSize(user) : null;
  const rating = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : null;
  const specs: [string, string | null | undefined][] = [
    ["Состав", p.composition],
    ["Материал", p.material],
    ["Уход", p.care],
    ["Производство", p.madeIn],
    ["Артикул", p.sku],
  ];
  const ld = productJsonLd(p);
  const shots = p.images.filter((img) => isRealPhoto(img.url));
  const price = (
    <>
      {p.compareAt && <s className="mr-2 text-[#9a9a9a]"><span className="sr-only">Было </span>{formatMoney(p.compareAt)}</s>}
      {formatMoney(p.price)}
    </>
  );
  // карточка по образцу therow.com: кадры слева (на компьютере друг под другом, на телефоне листаются), справа узкая
  // колонка обычным гротеском — путь, название, цена, цвет, размеры строкой, кнопка в рамке, описание и список разделов
  return (
    <div style={SANS} className="text-[0.84rem] leading-relaxed">
      {/* цель Метрики для ретаргетинга в Директе: «смотрела вещь, не купила» */}
      <MetrikaGoal goal="product_view" dedupe={p.slug} />
      <JsonLd data={[ld, breadcrumbJsonLd([{ name: "Главная", path: "/" }, { name: "Каталог", path: "/catalog" }, ...(category ? [{ name: category.name, path: `/catalog?category=${category.slug}` }] : []), { name: p.name, path: `/product/${p.slug}` }])]} />
      <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-10 lg:gap-20">
        <div className="md:hidden">
          <ProductGallery images={p.images.map((img) => ({ id: img.id, url: img.url, alt: img.alt }))} name={p.name} />
        </div>
        <section aria-label={`Фото: ${p.name}`} className="hidden space-y-2 md:block md:pl-5">
          {(shots.length ? shots : p.images.slice(0, 1)).map((img, i) => (
            <div key={img.id} className="relative mx-auto aspect-[4/5] max-w-[680px] bg-[#f6f5f3]">
              <Image src={img.url} alt={i === 0 ? img.alt ?? p.name : `${p.name}, фото ${i + 1}`} fill quality={85} loading={i === 0 ? "eager" : "lazy"} sizes="(min-width: 768px) 50vw, 1px" className="object-cover" />
            </div>
          ))}
        </section>
        <div id="buy" className="min-w-0 scroll-mt-20 px-5 pt-6 md:sticky md:top-16 md:self-start md:has-[#product-size-chart[open]]:static md:pl-0 md:pr-10 md:pt-8 lg:max-w-[520px]">
          <nav aria-label="Навигация" className="hidden gap-2 text-[#6f6f6f] md:flex">
            <Link href="/#collection" className="hover:text-ink">Коллекция</Link>
            {category && <><span aria-hidden>·</span><span>{category.name}</span></>}
          </nav>
          <h1 style={PLAIN_HEADING} className="flex items-baseline justify-between gap-4 md:mt-14 md:block">
            <span>{p.name}</span>
            <span className="shrink-0 md:hidden">{price}</span>
          </h1>
          <div className="mt-5 hidden md:block">{price}</div>
          {rating && <a href="#reviews" className="mt-1 inline-block text-[#6f6f6f] underline-offset-4 hover:underline">★ {rating.toFixed(1)} · {p.reviews.length} {p.reviews.length === 1 ? "отзыв" : p.reviews.length < 5 ? "отзыва" : "отзывов"}</a>}
          <div className="mt-8"><SizeAdvisor user={user} sizes={[...new Set(p.variants.map((v) => v.size))]} /></div>
          <div className="mt-2">
            <AddToCart slug={p.slug} loggedIn={!!user} defaultSize={wantedSize ?? (advice?.fit === "точно" ? advice.size : null)} defaultColor={wantedColor} variants={p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, colorHex: v.colorHex, available: v.stock - v.reserved }))}>
              <form action={toggleWishlistAction}>
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="back" value={`/product/${p.slug}`} />
                <button aria-pressed={!!inWishlist} className="min-h-11 transition-opacity hover:opacity-60">{inWishlist ? "В избранном" : "В избранное"}</button>
              </form>
            </AddToCart>
          </div>
          {p.description && <p className="mt-8">{p.description}</p>}
          {p.sku && <div className="mt-3 text-[0.72rem] text-[#6f6f6f]">{p.sku}</div>}
          <div className="mt-10">
            <details className="group">
              <summary className="acc-line">Состав и уход<span aria-hidden className="acc-mark">+</span></summary>
              <dl className="space-y-1.5 pb-5">
                {specs.filter(([k, v]) => v && k !== "Артикул").map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3"><dt className="text-[#6f6f6f]">{k}</dt><dd className={k === "Уход" ? "whitespace-pre-line" : undefined}>{v}</dd></div>)}
              </dl>
            </details>
            <details id="product-size-chart" className="group scroll-mt-20">
              <summary className="acc-line">Размер и посадка<span aria-hidden className="acc-mark">+</span></summary>
              <div className="pb-5"><SizeTable /></div>
            </details>
            <details className="group">
              <summary className="acc-line">Доставка и возврат<span aria-hidden className="acc-mark">+</span></summary>
              <div className="space-y-2 pb-5">
                <p>СДЭК, Яндекс Доставка или Яндекс Экспресс.</p>
                <p>Для возврата обратитесь в <Link href="/account/support?topic=return" className="underline">поддержку</Link> в течение 14 дней с момента получения. <Link href="/delivery" className="underline underline-offset-4">Подробнее</Link></p>
              </div>
            </details>
          </div>
        </div>
      </div>

      {relatedReal.length > 0 && (
        <section className="mt-28 md:mt-40">
          <div className="flex items-baseline justify-between px-5 pb-6">
            <h2 style={PLAIN_HEADING}>С этим носят</h2>
          </div>
          <RowGrid items={relatedReal} />
        </section>
      )}

      {p.reviews.length > 0 && (
        <section id="reviews" className="mt-28 scroll-mt-20 px-5">
          <h2 style={PLAIN_HEADING}>Отзывы · {p.reviews.length}</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            {p.reviews.map((r) => (
              <div key={r.id} className="border-t border-line pt-4">
                <div className="text-[0.75rem] text-[#6f6f6f]">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} · {r.user.firstName}{r.user.height ? ` · рост ${r.user.height}` : ""}{r.user.preferredSize ? ` · размер ${r.user.preferredSize}` : ""}</div>
                <p className="mt-2">{r.text}</p>
                <div className="mt-2 text-[0.75rem] text-[#6f6f6f]">{formatDate(r.createdAt)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* подпись не зависит от того, выбран ли размер: панель только возвращает к блоку покупки */}
      {p.variants.length > 0 && <MobileBuyBar name={p.name} price={formatMoney(p.price)} label={p.variants.some((v) => v.stock - v.reserved > 0) ? "Купить" : "Сообщить о поступлении"} />}
    </div>
  );
}
