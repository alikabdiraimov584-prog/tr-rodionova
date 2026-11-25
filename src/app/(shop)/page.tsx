import { Suspense } from "react";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { photoFirst } from "@/lib/photos";
import { RowGrid, SANS } from "@/components/shop/row-grid";

// сколько вещей показывает главная: коллекция маленькая, вся помещается в одну-две строки сетки
const SHOWN = 8;
const coverPath = "/images/brand/amore-cover";
function coverSources(view: "front" | "back") {
  return [640, 1080, 1600, 2160].map(width => `${coverPath}/${view}-${width}.webp ${width}w`).join(", ");
}

// canonical: адреса с метками рекламы (?utm_…, ?yclid=…) поисковики склеивают с главной, а не считают копиями
export const metadata: Metadata = {
  title: { absolute: "T.Rodionova — премиальная женская одежда из шерсти, кашемира и шёлка" },
  alternates: { canonical: "/" },
};

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
    <div style={SANS} className="text-[0.82rem] md:text-[0.84rem]">
      <h1 className="sr-only">T.Rodionova — премиальная женская одежда из шерсти, кашемира и шёлка</h1>
      <section aria-label="Платье Amore" className="grid h-[calc(100svh-3.5rem)] overflow-hidden bg-[#17191b] md:h-[calc(100svh-4rem)] md:grid-cols-2">
        <picture className="hidden min-h-0 md:block">
          <source media="(min-width: 48rem)" srcSet={coverSources("back")} sizes="50vw" />
          {/* The inline fallback keeps phones from fetching the desktop photograph. */}
          { }
          <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="Платье Amore со спины у чёрной двери" className="h-full w-full object-cover object-[50%_30%]" />
        </picture>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${coverPath}/front-1080.webp`} srcSet={coverSources("front")} sizes="(min-width: 48rem) 50vw, 100vw" fetchPriority="high" width={1080} height={1620} alt="Модель в платье Amore цвета айвори у чёрной двери" className="min-h-0 h-full w-full object-cover object-[50%_54%]" />
      </section>
      <div id="collection" className="scroll-mt-16 pt-5 md:pt-8">
        <Suspense fallback={null}>
          <CollectionGrid />
        </Suspense>
      </div>
    </div>
  );
}
