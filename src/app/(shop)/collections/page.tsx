import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { ProductCard } from "@/components/shop/product-card";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";

// все коллекции на одной странице: адреса с ?slug= — та же страница, канонический адрес один
export const metadata: Metadata = { title: "Коллекции", alternates: { canonical: "/collections" } };

export default async function Collections() {
  const collections = await db.collection.findMany({ where: { isActive: true }, orderBy: { slug: "desc" }, include: { products: { where: { status: "ACTIVE", isPreloved: false }, include: { images: { orderBy: { order: "asc" } }, variants: true }, take: 8 } } });
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 md:px-6">
      <JsonLd data={[breadcrumbJsonLd([{ name: "Главная", path: "/" }, { name: "Коллекции", path: "/collections" }]), ...collections.filter((c) => c.products.length).map((c) => itemListJsonLd(`${c.name}${c.season ? ` (${c.season})` : ""} — T.Rodionova`, c.products.map((p) => ({ name: p.name, path: `/product/${p.slug}` }))))]} />
      <div className="border-b border-line pb-6"><div className="eyebrow">Бренд</div><h1 className="mt-1">Коллекции</h1></div>
      {collections.map((c) => (
        <section key={c.id} className="mt-10">
          <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
            <div>
              <div className="eyebrow">{c.season}</div>
              <h2 className="mt-1">{c.name}</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ink/80">{c.description}</p>
              <Link href="/catalog" className="btn-outline mt-5">Смотреть все вещи</Link>
            </div>
            <div className="relative aspect-[16/9] bg-sand">{c.coverUrl && <Image src={c.coverUrl} alt={c.name} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />}</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-1 md:grid-cols-4">{c.products.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        </section>
      ))}
    </div>
  );
}
