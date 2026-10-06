import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { ProductCard } from "@/components/shop/product-card";
import { photoFirst } from "@/lib/photos";
import { Empty } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { Markdown } from "@/components/markdown";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";

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
  new: { label: "Сначала новые", orderBy: { createdAt: "desc" } },
  "price-asc": { label: "Сначала дешевле", orderBy: { price: "asc" } },
  "price-desc": { label: "Сначала дороже", orderBy: { price: "desc" } },
};
const PRICES: [string, number, number | null][] = [["0-30", 0, 3_000_000], ["30-60", 3_000_000, 6_000_000], ["60-", 6_000_000, null]];
const arr = (v: string | string[] | undefined) => (typeof v === "string" ? v.split(",").filter(Boolean) : Array.isArray(v) ? v : []);
const models = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "модель" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "модели" : "моделей"}`;

/**
 * Каталог по образцу ACTE: заголовок, одна строка категорий и сетка крупных фото. Боковые фильтры убраны;
 * старые ссылки с size/color/material/price продолжают работать, чтобы не терять переходы из рассылок и поиска.
 */
export default async function Catalog({ searchParams }: PageProps<"/catalog">) {
  const sp = await searchParams;
  const user = await getCurrentCustomer();
  const category = typeof sp.category === "string" ? sp.category : undefined;
  const sort = typeof sp.sort === "string" && sp.sort in SORTS ? sp.sort : "new";
  const onlyNew = sp.new === "1";
  const searching = typeof sp.q === "string";
  const q = searching ? (sp.q as string).trim() : "";
  const sizes = arr(sp.size);
  const colors = arr(sp.color);
  const materials = arr(sp.material);
  const price = typeof sp.price === "string" ? PRICES.find((p) => p[0] === sp.price) : undefined;
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
    ...(price ? { price: { gte: price[1], ...(price[2] ? { lt: price[2] } : {}) } } : {}),
    ...(q ? { AND: [{ OR: [{ name: { contains: q, mode: "insensitive" } }, { composition: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }] } : {}),
  };
  const [categories, found] = await Promise.all([
    db.category.findMany({ orderBy: { order: "asc" }, where: { products: { some: { status: "ACTIVE", isPreloved: false } } } }),
    db.product.findMany({ where, include: { images: { orderBy: { order: "asc" } }, variants: true }, orderBy: SORTS[sort].orderBy }),
  ]);
  // по умолчанию («сначала новые») вещи со съёмкой идут первыми; при сортировке по цене порядок строгий
  const products = sort === "new" ? photoFirst(found) : found;
  const current = categories.find((c) => c.slug === category);
  const faq = Array.isArray(current?.faq) ? (current!.faq as { q: string; a: string }[]) : [];
  const filtered = sizes.length + colors.length + materials.length + (price ? 1 : 0) > 0;
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ category, new: onlyNew ? "1" : undefined, sort: sort === "new" ? undefined : sort, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/catalog${s ? `?${s}` : ""}`;
  };
  const listName = q ? `Поиск: «${q}»` : searching ? "Поиск" : onlyNew ? "Новая коллекция" : current?.name ?? "Каталог";
  // структура ассортимента для краулеров: список вещей и путь к категории; при поиске и фильтрах — без разметки, это не самостоятельные страницы
  const plain = !q && !filtered;
  const tab = (on: boolean) => `shrink-0 whitespace-nowrap py-3 ${on ? "text-ink underline underline-offset-[6px]" : "text-muted hover:text-ink"}`;
  return (
    <div className="mx-auto max-w-[1600px] px-1 md:px-5">
      {plain && products.length > 0 && <JsonLd data={[itemListJsonLd(`${listName} — T.Rodionova`, products.map((p) => ({ name: p.name, path: `/product/${p.slug}` }))), breadcrumbJsonLd([{ name: "Главная", path: "/" }, { name: "Каталог", path: "/catalog" }, ...(current ? [{ name: current.name, path: `/catalog?category=${current.slug}` }] : [])])]} />}
      <div className="px-3 pt-8 text-center md:px-0 md:pt-12">
        <h1 className="text-[1.05rem] uppercase tracking-[0.14em] md:text-[1.25rem]">{listName}</h1>
        {searching && (
          <form action="/catalog" role="search" className="mx-auto mt-5 flex max-w-md items-center border-b border-ink">
            <input name="q" defaultValue={q} placeholder="Что вы ищете?" aria-label="Поиск по каталогу" autoFocus={!q} className="min-w-0 flex-1 bg-transparent py-3 text-[0.95rem] outline-none" />
            <button className="nav-link py-3 pl-3">Найти</button>
          </form>
        )}
      </div>
      <nav aria-label="Категории" className="scroll-row mt-5 flex justify-start gap-6 overflow-x-auto px-3 text-[0.72rem] uppercase tracking-[0.12em] md:justify-center md:px-0">
        <Link href="/catalog" className={tab(!category && !onlyNew && !searching)} aria-current={!category && !onlyNew && !searching ? "page" : undefined}>Все</Link>
        <Link href="/catalog?new=1" className={tab(onlyNew && !category)} aria-current={onlyNew && !category ? "page" : undefined}>Новое</Link>
        {categories.map((c) => <Link key={c.id} href={`/catalog?category=${c.slug}`} className={tab(category === c.slug)} aria-current={category === c.slug ? "page" : undefined}>{c.name}</Link>)}
      </nav>
      <div className="mt-2 flex items-center justify-between border-y border-line px-3 py-2 text-[0.72rem] uppercase tracking-[0.1em] md:px-1">
        <span className="text-muted">{models(products.length)}{filtered && <> · <Link href={link({})} className="underline">сбросить фильтр</Link></>}</span>
        <details className="relative">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5">{SORTS[sort].label}<span aria-hidden className="text-muted">▾</span></summary>
          <div className="absolute right-0 z-20 mt-1 w-48 border border-line bg-ivory py-1 normal-case tracking-normal shadow-sm">
            {Object.entries(SORTS).map(([k, v]) => <Link key={k} href={link({ sort: k === "new" ? undefined : k })} className={`block px-4 py-2.5 text-[0.82rem] hover:bg-sand ${sort === k ? "text-ink" : "text-muted"}`}>{v.label}</Link>)}
          </div>
        </details>
      </div>
      <div className="pt-1">
        {products.length === 0 ? (
          <Empty title={q ? "Ничего не нашлось" : "Здесь пока пусто"} action={<Link href="/catalog" className="btn-outline">Весь каталог</Link>}>{q ? "Попробуйте другое слово: «платье», «кашемир», «шёлк»." : "Загляните в другие категории."}</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-x-1 md:grid-cols-3 xl:grid-cols-4">{products.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 4} />)}</div>
        )}
        {current && !q && !onlyNew && !filtered && (current.seoText || faq.length > 0) && (
          <section className="mx-auto mt-20 max-w-3xl border-t border-line px-3 pt-10 md:px-0">
            {current.seoText && <div className="prose-sm text-ink/80"><Markdown source={current.seoText} /></div>}
            {faq.length > 0 && (
              <div className="mt-10">
                <h2 className="section-title mb-4">Вопросы и ответы</h2>
                <div className="divide-y divide-line border-y border-line">
                  {faq.map((f) => (
                    <details key={f.q} className="group py-1">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-[0.9rem]">{f.q}<span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span></summary>
                      <p className="pb-4 text-sm text-ink/80">{f.a}</p>
                    </details>
                  ))}
                </div>
                <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
