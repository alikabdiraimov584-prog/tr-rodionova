import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ProductCard } from "@/components/shop/product-card";
import { Empty, PageTitle } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Каталог" };

const SORTS: Record<string, { label: string; orderBy: Prisma.ProductOrderByWithRelationInput }> = {
  new: { label: "Новинки", orderBy: { createdAt: "desc" } },
  "price-asc": { label: "Цена ↑", orderBy: { price: "asc" } },
  "price-desc": { label: "Цена ↓", orderBy: { price: "desc" } },
};

export default async function Catalog({ searchParams }: PageProps<"/catalog">) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" ? sp.category : undefined;
  const sort = typeof sp.sort === "string" && sp.sort in SORTS ? sp.sort : "new";
  const onlyNew = sp.new === "1";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [categories, products] = await Promise.all([
    db.category.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { products: { where: { status: "ACTIVE" } } } } } }),
    db.product.findMany({
      where: {
        status: "ACTIVE",
        ...(category ? { category: { slug: category } } : {}),
        ...(onlyNew ? { isNew: true } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { composition: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { images: { orderBy: { order: "asc" } }, variants: true },
      orderBy: SORTS[sort].orderBy,
    }),
  ]);
  const current = categories.find((c) => c.slug === category);
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { category, sort: sort === "new" ? undefined : sort, new: onlyNew ? "1" : undefined, q: q || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/catalog${s ? `?${s}` : ""}`;
  };
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <PageTitle eyebrow="Осень–зима 2026" title={onlyNew ? "Новинки" : current?.name ?? "Каталог"} />
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[0.68rem] uppercase tracking-[0.18em]">
          <Link href={link({ category: undefined })} className={!category ? "text-ink underline underline-offset-4" : "text-muted hover:text-ink"}>Все</Link>
          {categories.filter((c) => c._count.products > 0).map((c) => (
            <Link key={c.id} href={link({ category: c.slug })} className={category === c.slug ? "text-ink underline underline-offset-4" : "text-muted hover:text-ink"}>
              {c.name}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4 text-[0.68rem] uppercase tracking-[0.18em]">
          <form action="/catalog" className="hidden md:block">
            {category && <input type="hidden" name="category" value={category} />}
            <input name="q" defaultValue={q} placeholder="Поиск" className="w-36 border-b border-line bg-transparent py-1 text-xs normal-case tracking-normal outline-none focus:border-ink" />
          </form>
          {Object.entries(SORTS).map(([k, v]) => (
            <Link key={k} href={link({ sort: k === "new" ? undefined : k })} className={sort === k ? "text-ink" : "text-muted hover:text-ink"}>
              {v.label}
            </Link>
          ))}
        </div>
      </div>
      {products.length === 0 ? (
        <Empty title="Ничего не найдено" action={<Link href="/catalog" className="btn-outline">Весь каталог</Link>}>Попробуйте изменить фильтры.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
