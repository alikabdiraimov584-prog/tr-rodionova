import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { ProductCard } from "@/components/shop/product-card";
import { Empty } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/lib/seo";

export async function generateMetadata({ searchParams }: PageProps<"/catalog">): Promise<Metadata> {
  const sp = await searchParams;
  const slug = typeof sp.category === "string" ? sp.category : undefined;
  if (!slug) return { title: "Каталог", description: "Женская одежда T.Rodionova: жакеты, платья, боди, брюки, трикотаж из шерсти, кашемира и шёлка. Доставка по России." };
  const c = await db.category.findUnique({ where: { slug } });
  if (!c) return { title: "Каталог" };
  return {
    title: c.seoTitle ?? `${c.name} — купить в T.Rodionova`,
    description: c.seoDescription ?? `${c.name} T.Rodionova: премиальная женская одежда, сшито в Европе. Доставка по России, примерка курьером.`,
    alternates: { canonical: `/catalog?category=${c.slug}` },
  };
}

const SORTS: Record<string, { label: string; orderBy: Prisma.ProductOrderByWithRelationInput }> = {
  new: { label: "Новое", orderBy: { createdAt: "desc" } },
  "price-asc": { label: "Цена ↑", orderBy: { price: "asc" } },
  "price-desc": { label: "Цена ↓", orderBy: { price: "desc" } },
};
const SIZES = ["XS", "S", "M", "L", "XL", "ONE"];
const PRICES: [string, string, number, number | null][] = [["до 30 000", "0-30", 0, 3_000_000], ["30–60 000", "30-60", 3_000_000, 6_000_000], ["от 60 000", "60-", 6_000_000, null]];

function Facet({ title, items }: { title: string; items: { label: string; href: string; on: boolean; hex?: string | null }[] }) {
return (
  <div>
    <div className="eyebrow border-b border-line pb-1.5">{title}</div>
    <ul className="mt-2 space-y-1 text-[0.72rem]">
      {items.map((i) => (
        <li key={i.label}><Link href={i.href} className={`flex min-h-9 items-center gap-2 md:min-h-0 md:py-0.5 ${i.on ? "text-ink underline underline-offset-4" : "text-muted hover:text-ink"}`}>{i.hex && <span className="h-2.5 w-2.5 border border-line" style={{ background: i.hex }} />}{i.label}</Link></li>
      ))}
    </ul>
  </div>
);
}

const arr = (v: string | string[] | undefined) => (typeof v === "string" ? v.split(",").filter(Boolean) : Array.isArray(v) ? v : []);

export default async function Catalog({ searchParams }: PageProps<"/catalog">) {
  const sp = await searchParams;
  const user = await getCurrentCustomer();
  const category = typeof sp.category === "string" ? sp.category : undefined;
  const sort = typeof sp.sort === "string" && sp.sort in SORTS ? sp.sort : "new";
  const onlyNew = sp.new === "1";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const sizes = arr(sp.size);
  const colors = arr(sp.color);
  const materials = arr(sp.material);
  const price = typeof sp.price === "string" ? PRICES.find((p) => p[1] === sp.price) : undefined;
  const earlyOk = !!user?.loyaltyTier?.earlyAccess;

  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    isPreloved: false,
    ...(earlyOk ? {} : { OR: [{ earlyAccessUntil: null }, { earlyAccessUntil: { lte: new Date() } }] }),
    ...(category ? { category: { slug: category } } : {}),
    ...(onlyNew ? { isNew: true } : {}),
    ...(sizes.length ? { variants: { some: { size: { in: sizes } } } } : {}),
    ...(colors.length ? { variants: { some: { color: { in: colors } } } } : {}),
    ...(materials.length ? { material: { in: materials } } : {}),
    ...(price ? { price: { gte: price[2], ...(price[3] ? { lt: price[3] } : {}) } } : {}),
    ...(q ? { AND: [{ OR: [{ name: { contains: q, mode: "insensitive" } }, { composition: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }] } : {}),
  };
  const [categories, products, allColors, allMaterials] = await Promise.all([
    db.category.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { products: { where: { status: "ACTIVE", isPreloved: false } } } } } }),
    db.product.findMany({ where, include: { images: { orderBy: { order: "asc" } }, variants: true }, orderBy: SORTS[sort].orderBy }),
    db.productVariant.findMany({ where: { product: { status: "ACTIVE" }, color: { not: null } }, distinct: ["color"], select: { color: true, colorHex: true } }),
    db.product.findMany({ where: { status: "ACTIVE", material: { not: null } }, distinct: ["material"], select: { material: true } }),
  ]);
  const current = categories.find((c) => c.slug === category);
  const faq = Array.isArray(current?.faq) ? (current!.faq as { q: string; a: string }[]) : [];
  const base = { category, sort: sort === "new" ? undefined : sort, new: onlyNew ? "1" : undefined, q: q || undefined, size: sizes.join(",") || undefined, color: colors.join(",") || undefined, material: materials.join(",") || undefined, price: price?.[1] };
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/catalog${s ? `?${s}` : ""}`;
  };
  const toggleList = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).join(",") || undefined;
  const activeCount = sizes.length + colors.length + materials.length + (price ? 1 : 0);
  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line py-2 text-[0.68rem] uppercase tracking-[0.1em]">
        <Link href={link({ category: undefined, new: undefined })} className={`py-2.5 ${!category && !onlyNew ? "underline underline-offset-4" : "text-muted hover:text-ink"}`}>Все</Link>
        <Link href={link({ category: undefined, new: "1" })} className={`py-2.5 ${onlyNew ? "underline underline-offset-4" : "text-muted hover:text-ink"}`}>Новое</Link>
        {current && <span className="underline underline-offset-4">{current.name}</span>}
        <span className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 sm:ml-auto sm:w-auto">
          <form action="/catalog" className="flex w-full items-center gap-2 sm:w-auto">
            {category && <input type="hidden" name="category" value={category} />}
            <input name="q" defaultValue={q} placeholder="Поиск" className="w-full min-w-0 border-b border-line bg-transparent py-2 text-xs normal-case tracking-normal outline-none focus:border-ink sm:w-32" />
          </form>
          {Object.entries(SORTS).map(([k, v]) => <Link key={k} href={link({ sort: k === "new" ? undefined : k })} className={`py-2.5 ${sort === k ? "underline underline-offset-4" : "text-muted hover:text-ink"}`}>{v.label}</Link>)}
        </span>
      </div>
      <div className="grid gap-4 md:gap-6 md:grid-cols-[200px_1fr]">
        <aside className="hidden space-y-6 border-r border-line py-5 pr-5 md:block">
          <div className="flex items-baseline justify-between text-[0.72rem]"><span>{products.length} {products.length === 1 ? "модель" : products.length < 5 ? "модели" : "моделей"}</span>{activeCount > 0 && <Link href={link({ size: undefined, color: undefined, material: undefined, price: undefined })} className="py-1 text-muted underline">Сбросить</Link>}</div>
          <Facet title="Размер" items={SIZES.map((s) => ({ label: s, href: link({ size: toggleList(sizes, s) }), on: sizes.includes(s) }))} />
          <Facet title="Цвет" items={allColors.map((c) => ({ label: c.color!, hex: c.colorHex, href: link({ color: toggleList(colors, c.color!) }), on: colors.includes(c.color!) }))} />
          {allMaterials.length > 0 && <Facet title="Материал" items={allMaterials.map((m) => ({ label: m.material!, href: link({ material: toggleList(materials, m.material!) }), on: materials.includes(m.material!) }))} />}
          <Facet title="Цена" items={PRICES.map((p) => ({ label: p[0], href: link({ price: price?.[1] === p[1] ? undefined : p[1] }), on: price?.[1] === p[1] }))} />
        </aside>
        <details className="border-b border-line md:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between py-2 text-[0.68rem] uppercase tracking-[0.1em]">
            <span>Фильтры{activeCount > 0 ? ` · ${activeCount}` : ""}</span>
            <span className="text-muted">{products.length} {products.length === 1 ? "модель" : products.length < 5 ? "модели" : "моделей"}</span>
          </summary>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 pb-5">
          {activeCount > 0 && <div className="col-span-2 text-[0.72rem]"><Link href={link({ size: undefined, color: undefined, material: undefined, price: undefined })} className="inline-block py-1 text-muted underline">Сбросить фильтры</Link></div>}
          <Facet title="Размер" items={SIZES.map((s) => ({ label: s, href: link({ size: toggleList(sizes, s) }), on: sizes.includes(s) }))} />
          <Facet title="Цвет" items={allColors.map((c) => ({ label: c.color!, hex: c.colorHex, href: link({ color: toggleList(colors, c.color!) }), on: colors.includes(c.color!) }))} />
          {allMaterials.length > 0 && <Facet title="Материал" items={allMaterials.map((m) => ({ label: m.material!, href: link({ material: toggleList(materials, m.material!) }), on: materials.includes(m.material!) }))} />}
          <Facet title="Цена" items={PRICES.map((p) => ({ label: p[0], href: link({ price: price?.[1] === p[1] ? undefined : p[1] }), on: price?.[1] === p[1] }))} />
          </div>
        </details>
        <div className="min-w-0 py-4 md:py-5">
          <h1 className="mb-4 text-base">{q ? `Поиск: «${q}»` : onlyNew ? "Новое" : current?.name ?? "Все вещи"}</h1>
          {products.length === 0 ? (
            <Empty title="Ничего не найдено" action={<Link href="/catalog" className="btn-outline">Весь каталог</Link>}>Попробуйте изменить фильтры или запрос.</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-1 lg:grid-cols-4">{products.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          )}
          {current && !q && !onlyNew && activeCount === 0 && (current.seoText || faq.length > 0) && (
            <section className="mt-16 max-w-3xl border-t border-line pt-10">
              {current.seoText && <div className="prose-sm"><Markdown source={current.seoText} /></div>}
              {faq.length > 0 && (
                <div className="mt-10">
                  <h2 className="mb-4 text-xl">Вопросы и ответы</h2>
                  <dl className="divide-y divide-line">
                    {faq.map((f) => (
                      <div key={f.q} className="py-4">
                        <dt className="font-medium">{f.q}</dt>
                        <dd className="mt-1 text-sm text-ink/80">{f.a}</dd>
                      </div>
                    ))}
                  </dl>
                  <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
