import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { photoFirst } from "@/lib/photos";
import { PLAIN_HEADING, RowGrid, SANS } from "@/components/shop/row-grid";

// сколько вещей показывает главная: коллекция маленькая, вся помещается в одну-две строки сетки
const SHOWN = 8;
// кадр первого экрана выбран владелицей; чтобы сменить — заменить путь (файл лежит в public)
const HOME_SHOT = "/images/brand/TR-DR-101/tr-halter-04.jpg";

// canonical: адреса с метками рекламы (?utm_…, ?yclid=…) поисковики склеивают с главной, а не считают копиями
export const metadata: Metadata = {
  title: { absolute: "T.Rodionova — премиальная женская одежда из шерсти, кашемира и шёлка" },
  alternates: { canonical: "/", types: { "application/rss+xml": "/journal/feed.xml" } },
};

const things = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "вещь" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "вещи" : "вещей"}`;

/**
 * Главная по образцу therow.com: один большой кадр без заголовков и кнопок (только строка сезона в углу),
 * под ним сразу вся коллекция сеткой — название и цена, без разделов, витрин и баннеров.
 */
export default async function Home() {
  const [products, collection] = await Promise.all([
    db.product.findMany({
      where: { status: "ACTIVE", isPreloved: false },
      select: {
        slug: true, name: true, price: true, compareAt: true, isNew: true, isPreorder: true,
        images: { orderBy: { order: "asc" }, select: { url: true, alt: true } },
        variants: {
          where: { archivedAt: null },
          select: { size: true, color: true, colorHex: true, stock: true, reserved: true },
        },
      },
      take: SHOWN,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    }),
    db.collection.findFirst({ where: { isActive: true }, orderBy: { slug: "desc" }, select: { name: true } }),
  ]);
  const items = photoFirst(products);
  const season = collection?.name ?? "Осень–зима 2026";

  return (
    <div style={SANS} className="text-[0.82rem] md:text-[0.84rem]">
      <h1 className="sr-only">T.Rodionova — премиальная женская одежда из шерсти, кашемира и шёлка</h1>
      <section aria-label={`Коллекция ${season}`} className="relative h-[calc(100svh-3.5rem)] min-h-[520px] overflow-hidden bg-[#f6f5f3] md:h-[calc(100svh-4rem)]">
        <Image src={HOME_SHOT} alt={`T.Rodionova, коллекция ${season}`} fill preload sizes="100vw" className="object-cover object-[50%_22%]" />
        {/* пока виден баннер cookie, строка поднимается над ним (--consent-h ставит баннер) */}
        <a href="#collection" className="absolute bottom-[calc(1.25rem+var(--consent-h,0px))] left-5 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]">{season}</a>
      </section>
      <div id="collection" className="scroll-mt-16">
        <div className="flex items-baseline justify-between px-5 pb-6 pt-10 md:pt-14">
          <h2 style={PLAIN_HEADING} className="flex gap-2"><span>Коллекция</span><span aria-hidden>·</span><span>{things(items.length)}</span></h2>
          <Link href="/about">О бренде</Link>
        </div>
        <RowGrid items={items} />
      </div>
    </div>
  );
}
