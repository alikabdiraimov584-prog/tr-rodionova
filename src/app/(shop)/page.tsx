import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { isRealPhoto, photoFirst } from "@/lib/photos";

const withImages = { images: { orderBy: { order: "asc" as const } }, variants: true } as const;
// сколько вещей показывает главная: коллекция маленькая, каждая вещь получает свой экран
const SHOWN = 6;

// canonical: адреса с метками рекламы (?utm_…, ?yclid=…) поисковики склеивают с главной, а не считают копиями
export const metadata: Metadata = {
  title: { absolute: "T.Rodionova — премиальная женская одежда из шерсти, кашемира и шёлка" },
  alternates: { canonical: "/", types: { "application/rss+xml": "/journal/feed.xml" } },
};

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "ONE SIZE"];
const bySize = (a: string, b: string) => {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase());
  const ib = SIZE_ORDER.indexOf(b.toUpperCase());
  if (ia >= 0 && ib >= 0) return ia - ib;
  return ia >= 0 ? -1 : ib >= 0 ? 1 : a.localeCompare(b, "ru", { numeric: true });
};

/** Первое предложение описания — коротко, без перечня деталей (полное описание на странице вещи). */
function lead(text: string | null) {
  if (!text) return "";
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return first.length > 220 ? `${first.slice(0, 217).trimEnd()}…` : first;
}

/**
 * Главная для маленькой коллекции (3–6 вещей): первый экран и каждая вещь своим крупным блоком —
 * два кадра, название, одна строка описания, состав, цена, размеры и кнопка. Без каталога, разделов и витрин.
 */
export default async function Home() {
  const [products, collection] = await Promise.all([
    db.product.findMany({ where: { status: "ACTIVE", isPreloved: false }, include: withImages, take: SHOWN, orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }] }),
    db.collection.findFirst({ where: { isActive: true }, orderBy: { slug: "desc" } }),
  ]);
  const items = photoFirst(products);
  const hero = items.find((p) => isRealPhoto(p.images[0]?.url)) ?? items[0];
  const heroShots = hero ? [hero.images[0], items.find((p) => p.id !== hero.id)?.images[0] ?? hero.images[1]].filter((i) => !!i) : [];
  const season = collection?.name ?? "Осень–зима 2026";
  const count = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "вещь" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "вещи" : "вещей"}`;

  return (
    <div>
      <h1 className="sr-only">T.Rodionova — премиальная женская одежда из шерсти, кашемира и шёлка</h1>
      {hero && heroShots.length > 0 && (
        <section aria-label="Коллекция" className="relative h-[calc(100svh-3.5rem)] min-h-[520px] md:h-[calc(100svh-4rem)]">
          <div className="grid h-full md:grid-cols-2">
            {heroShots.map((img, i) => (
              <div key={img.url} className={`relative h-full overflow-hidden bg-sand ${i > 0 ? "hidden md:block" : ""}`}>
                <Image src={img.url} alt={i === 0 ? `${hero.name} — ${season}` : ""} fill preload={i === 0} sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-top" />
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
          {/* пока виден баннер cookie, кнопка поднимается над ним (--consent-h ставит баннер) */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-4 pb-[calc(2.5rem+var(--consent-h,0px))] text-center text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.25)] md:pb-[calc(3.5rem+var(--consent-h,0px))]">
            <div className="caps">{season} · {count(items.length)}</div>
            <h2 className="mt-4 text-[2.6rem] font-light leading-none md:text-[4.5rem]">Коллекция</h2>
            <a href="#collection" className="caps mt-8 inline-flex min-h-12 items-center bg-white px-10 text-ink [text-shadow:none] transition-colors hover:bg-ink hover:text-white">Смотреть</a>
          </div>
        </section>
      )}

      <div id="collection" className="scroll-mt-16">
        {items.map((p, i) => {
          const shots = p.images.slice(0, 2);
          const sizes = [...new Set(p.variants.map((v) => v.size))].sort(bySize);
          const inStock = new Set(p.variants.filter((v) => v.stock - v.reserved > 0).map((v) => v.size));
          const soldOut = !p.isPreorder && inStock.size === 0;
          const flip = i % 2 === 1;
          return (
            <section key={p.id} aria-labelledby={`item-${p.slug}`} className="mx-auto mt-24 max-w-[1400px] px-4 md:mt-40 md:px-10">
              <div className={`grid items-center gap-8 md:gap-16 ${flip ? "md:grid-cols-[1fr_1.4fr]" : "md:grid-cols-[1.4fr_1fr]"}`}>
                <Link href={`/product/${p.slug}`} tabIndex={-1} aria-hidden className={`grid gap-2 ${shots.length > 1 ? "grid-cols-2" : ""} ${flip ? "md:order-2" : ""}`}>
                  {shots.map((img, k) => (
                    <div key={img.url} className={`relative aspect-[3/4] overflow-hidden bg-sand ${k === 1 ? "mt-16 md:mt-24" : ""}`}>
                      <Image src={img.url} alt="" fill sizes="(min-width: 768px) 30vw, 50vw" className="object-cover" />
                    </div>
                  ))}
                </Link>
                <div className={`md:max-w-md ${flip ? "md:order-1 md:justify-self-end" : ""}`}>
                  <div className="caps text-muted">{String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</div>
                  <h2 id={`item-${p.slug}`} className="mt-5 text-[2.2rem] font-light leading-tight md:text-[3rem]">
                    <Link href={`/product/${p.slug}`} className="transition-opacity hover:opacity-60">{p.name}</Link>
                  </h2>
                  {p.description && <p className="mt-5 leading-relaxed text-muted-dark">{lead(p.description)}</p>}
                  {p.composition && <p className="mt-3 text-[0.85rem] text-muted">{p.composition}</p>}
                  <div className="mt-6 text-[1.05rem]">{formatMoney(p.price)}</div>
                  {sizes.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[0.72rem] font-semibold uppercase tracking-[0.2em]">
                      {sizes.map((sz) => <span key={sz} className={inStock.has(sz) || p.isPreorder ? "" : "text-muted line-through"}>{sz}</span>)}
                    </div>
                  )}
                  <Link href={`/product/${p.slug}`} className={`${soldOut ? "btn-outline" : "btn-primary"} mt-8`}>{soldOut ? "Узнать о поступлении" : p.isPreorder ? "Предзаказ" : "Выбрать размер"}</Link>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
