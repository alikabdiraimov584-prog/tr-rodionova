import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getCurrentCustomer } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/money";
import { AddToCart } from "@/components/shop/add-to-cart";
import { RowGrid, SANS, PLAIN_HEADING } from "@/components/shop/row-grid";
import { ProductGallery } from "@/components/shop/product-gallery";
import { MobileBuyBar } from "@/components/shop/mobile-buy-bar";
import { isRealPhoto, photoFirst } from "@/lib/photos";
import { chartForProduct, recommendSize } from "@/lib/sizes";
import { dolyameAvailableFor } from "@/lib/payments/dolyame";
import { toggleWishlistAction } from "@/app/actions/shop";
import { SizeAdvisor } from "@/components/shop/size-advisor";
import { JsonLd, breadcrumbJsonLd, faqJsonLd, productJsonLd } from "@/lib/seo";
import { productFaq } from "@/lib/faq";
import { MetrikaGoal } from "@/components/metrika-goal";

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
  const [inWishlist, related, delivery, seller, installments] = await Promise.all([
    user ? db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId: p.id } } }) : null,
    db.product.findMany({ where: { status: "ACTIVE", isPreloved: false, categoryId: p.categoryId, id: { not: p.id } }, include: { images: { orderBy: { order: "asc" } }, variants: true }, take: 4 }),
    getSetting("delivery"),
    getSetting("seller"),
    // «4 платежа» обещаем, только если оплата Долями подключена и цена в её пределах
    dolyameAvailableFor(p.price).catch(() => false),
  ]);
  // «С этим носят»: вещи из тех же образов лукбука, иначе соседи по категории
  // в подборках под карточкой — только вещи со съёмкой, иначе блок из заглушек выглядит незаконченным
  // «Собрать образ» — вещи одного образа, того же, куда ведёт «Весь образ»; остальные образы — ссылками у блока покупки
  const matesOf = (li: (typeof p.lookItems)[number]) => li.look.items.map((it) => it.product).filter((r) => r.id !== p.id && r.status === "ACTIVE" && isRealPhoto(r.images[0]?.url));
  const lookWith = p.lookItems.find((li) => matesOf(li).length > 0);
  const lookMates = lookWith ? matesOf(lookWith).slice(0, 4) : [];
  const relatedReal = photoFirst(related).filter((r) => isRealPhoto(r.images[0]?.url));
  const wornWith = lookMates.length > 0 ? lookMates : relatedReal;
  const lookSlug = lookWith?.look.slug;
  const otherLooks = p.lookItems.filter((li) => li !== lookWith);
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
    ...(p.isPreorder ? [["Отшив", p.preorderShipAt ? `к ${formatDate(p.preorderShipAt)}` : "4–6 недель"] as [string, string]] : []),
  ];
  const sizesAll = [...new Set(p.variants.map((v) => v.size))];
  const faq = productFaq(p, sizesAll, delivery);
  const ld = productJsonLd(p, delivery, { hasStore: !!seller.showroom });
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
      <JsonLd data={[ld, faqJsonLd(faq.map(({ q, a }) => ({ q, a }))), breadcrumbJsonLd([{ name: "Главная", path: "/" }, { name: "Каталог", path: "/catalog" }, ...(category ? [{ name: category.name, path: `/catalog?category=${category.slug}` }] : []), { name: p.name, path: `/product/${p.slug}` }])]} />
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
        <div id="buy" className="min-w-0 scroll-mt-20 px-5 pt-6 md:sticky md:top-16 md:self-start md:pl-0 md:pr-10 md:pt-8 lg:max-w-[520px]">
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
          {installments && <div className="mt-1 text-[#6f6f6f]">или 4 платежа по {formatMoney(Math.ceil(p.price / 4 / 100) * 100)} с Долями</div>}
          {p.isPreorder && <p className="mt-6 text-[#6f6f6f]">Предзаказ: отшиваем под вас {p.preorderShipAt ? `к ${formatDate(p.preorderShipAt).replace(/\.$/, "")}` : "за 4–6 недель"}. Оплата при оформлении.</p>}
          <div className="mt-8"><SizeAdvisor product={p} user={user} sizes={[...new Set(p.variants.map((v) => v.size))]} /></div>
          <div className="mt-2">
            <AddToCart slug={p.slug} loggedIn={!!user} preorder={p.isPreorder} defaultSize={wantedSize ?? (advice?.fit === "точно" ? advice.size : null)} defaultColor={wantedColor} variants={p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, colorHex: v.colorHex, available: v.stock - v.reserved }))}>
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
                {specs.filter(([k, v]) => v && k !== "Артикул").map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3"><dt className="text-[#6f6f6f]">{k}</dt><dd>{v}</dd></div>)}
              </dl>
            </details>
            <details className="group">
              <summary className="acc-line">Размер и посадка<span aria-hidden className="acc-mark">+</span></summary>
              <p className="pb-5">Размеры и мерки — в <Link href="/sizes" className="underline underline-offset-4">таблице размеров</Link>. Не уверены — закажите курьера с примеркой: платите только за то, что подошло.</p>
            </details>
            <details className="group">
              <summary className="acc-line">Доставка и возврат<span aria-hidden className="acc-mark">+</span></summary>
              <div className="space-y-2 pb-5">
                <p>Курьер с примеркой по Москве и Петербургу за 1–2 дня: до 20 минут на примерку, платите только за то, что подошло. СДЭК по России — 2–7 дней.</p>
                <p>Возврат 14 дней с момента получения. <Link href="/delivery" className="underline underline-offset-4">Подробнее</Link></p>
              </div>
            </details>
            {p.articles.length > 0 && (
              <details className="group">
                <summary className="acc-line">Читать в журнале<span aria-hidden className="acc-mark">+</span></summary>
                <ul className="space-y-1.5 pb-5">
                  {p.articles.map((a) => <li key={a.slug}><Link href={`/journal/${a.slug}`} className="underline underline-offset-4 hover:opacity-70">{a.title}</Link></li>)}
                </ul>
              </details>
            )}
            <details className="group">
              <summary className="acc-line">Вопросы о вещи<span aria-hidden className="acc-mark">+</span></summary>
              <dl className="space-y-4 pb-5">
                {faq.map((f) => (
                  <div key={f.q}>
                    <dt>{f.q}</dt>
                    <dd className="mt-1 text-[#6f6f6f]">{f.a}{f.href && <> <Link href={f.href} className="underline underline-offset-4">Подробнее</Link></>}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
          {/* образы, в которых снята вещь, кроме того, что собран ниже в «Собрать образ» */}
          {otherLooks.length > 0 && (
            <div className="mt-5 text-[#6f6f6f]">
              {otherLooks.map((li) => <div key={li.id}>{lookWith ? "Ещё в образе" : "В образе"}: <Link href={`/lookbook/${li.look.slug}`} className="text-ink underline underline-offset-4">{li.look.title}</Link></div>)}
            </div>
          )}
        </div>
      </div>

      {wornWith.length > 0 && (
        <section className="mt-28 md:mt-40">
          <div className="flex items-baseline justify-between px-5 pb-6">
            <h2 style={PLAIN_HEADING}>{lookMates.length > 0 ? "Собрать образ" : "С этим носят"}</h2>
            {lookSlug && <Link href={`/lookbook/${lookSlug}`} className="underline underline-offset-4">Весь образ</Link>}
          </div>
          <RowGrid items={wornWith} />
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
      <MobileBuyBar name={p.name} price={formatMoney(p.price)} label={p.isPreorder ? "Предзаказ" : p.variants.some((v) => v.stock - v.reserved > 0) ? "Купить" : "Сообщить о поступлении"} />
    </div>
  );
}
