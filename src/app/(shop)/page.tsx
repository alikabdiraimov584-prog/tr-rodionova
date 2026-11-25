import { AmoreCover } from "@/components/shop/amore-cover";
import { Suspense } from "react";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { photoFirst } from "@/lib/photos";
import { RowGrid, SANS } from "@/components/shop/row-grid";

// сколько вещей показывает главная: коллекция маленькая, вся помещается в одну-две строки сетки
const SHOWN = 8;

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
      <AmoreCover />
      <div id="collection" className="scroll-mt-16 pt-5 md:pt-8">
        <Suspense fallback={null}>
          <CollectionGrid />
        </Suspense>
      </div>
    </div>
  );
}
