import { Suspense } from "react";
import Image from "next/image";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { photoFirst } from "@/lib/photos";
import { RowGrid, BRAND_TYPE } from "@/components/shop/row-grid";

// сколько вещей показывает главная: коллекция маленькая, вся помещается в одну-две строки сетки
const SHOWN = 8;
// кадр первого экрана выбран владелицей; чтобы сменить — заменить путь (файл лежит в public)
const HOME_SHOT = "/images/brand/TR-DR-101/tr-halter-04.jpg";

// canonical: адреса с метками рекламы (?utm_…, ?yclid=…) поисковики склеивают с главной, а не считают копиями
export const metadata: Metadata = {
  title: { absolute: "T.Rodionova — премиальная женская одежда из шерсти, кашемира и шёлка" },
  alternates: { canonical: "/", types: { "application/rss+xml": "/journal/feed.xml" } },
};

async function Season() {
  const collection = await db.collection.findFirst({
    where: { isActive: true }, orderBy: { slug: "desc" }, select: { name: true },
  });
  return collection?.name ?? "Осень–зима 2026";
}

async function CollectionGrid() {
  const products = await db.product.findMany({
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
  });
  const items = photoFirst(products);
  return <RowGrid items={items} />;
}

export default function Home() {
  return (
    <div style={BRAND_TYPE} className="text-[0.82rem] md:text-[0.84rem]">
      <h1 className="sr-only">T.Rodionova — премиальная женская одежда из шерсти, кашемира и шёлка</h1>
      <section aria-label="Коллекция" className="relative h-[calc(100svh-3.5rem)] min-h-[520px] overflow-hidden bg-[#f6f5f3] md:h-[calc(100svh-4rem)]">
        <Image src={HOME_SHOT} alt="Коллекция T.Rodionova" fill preload sizes="100vw" className="object-cover object-[50%_22%]" />
        {/* пока виден баннер cookie, строка поднимается над ним (--consent-h ставит баннер) */}
        <a href="#collection" className="absolute bottom-[calc(1.25rem+var(--consent-h,0px))] left-[clamp(12px,3vw,32px)] bg-black/70 px-3 py-2 text-base font-medium !text-white md:text-lg" aria-label="Перейти к коллекции"><Suspense fallback={null}><Season /></Suspense></a>
      </section>
      <div id="collection" className="scroll-mt-16 pt-5 md:pt-8">
        <Suspense fallback={null}>
          <CollectionGrid />
        </Suspense>
      </div>
    </div>
  );
}
