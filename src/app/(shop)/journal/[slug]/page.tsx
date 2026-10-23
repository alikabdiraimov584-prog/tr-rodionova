import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/money";
import { Markdown } from "@/components/markdown";
import { ProductCard } from "@/components/shop/product-card";
import { getSetting } from "@/lib/settings";
import { JsonLd, articleJsonLd, breadcrumbJsonLd } from "@/lib/seo";

async function load(slug: string) {
  return db.article.findUnique({
    where: { slug },
    include: { products: { where: { status: "ACTIVE" }, include: { images: { orderBy: { order: "asc" } }, variants: true } } },
  });
}

function isPublished(a: { publishedAt: Date | null }) {
  return !!a.publishedAt && a.publishedAt <= new Date();
}

/** «Читайте также»: три статьи той же рубрики, затем свежие — перелинковка помогает поисковикам находить новые статьи. */
async function relatedArticles(a: { id: string; category: string | null }) {
  const select = { id: true, slug: true, title: true, coverUrl: true, category: true, publishedAt: true } as const;
  const published = { publishedAt: { not: null, lte: new Date() } } as const;
  const same = a.category
    ? await db.article.findMany({ where: { ...published, category: a.category, id: { not: a.id } }, orderBy: { publishedAt: "desc" }, take: 3, select })
    : [];
  if (same.length >= 3) return same;
  const rest = await db.article.findMany({
    where: { ...published, id: { notIn: [a.id, ...same.map((x) => x.id)] } },
    orderBy: { publishedAt: "desc" },
    take: 3 - same.length,
    select,
  });
  return [...same, ...rest];
}

export async function generateMetadata({ params }: PageProps<"/journal/[slug]">): Promise<Metadata> {
  const a = await load((await params).slug);
  if (!a || !isPublished(a)) return { title: "Журнал" };
  const description = a.metaDescription ?? a.excerpt ?? undefined;
  const title = a.metaTitle ?? a.title;
  return {
    // в SEO-заголовке статьи бренд часто уже есть — тогда шаблон не повторяет его
    title: /T\.?\s?Rodionova/i.test(title) ? { absolute: title } : title,
    description,
    keywords: a.keywords.length ? a.keywords : undefined,
    alternates: { canonical: `/journal/${a.slug}` },
    openGraph: {
      type: "article",
      siteName: "T.Rodionova",
      locale: "ru_RU",
      title,
      description,
      url: `/journal/${a.slug}`,
      publishedTime: a.publishedAt?.toISOString(),
      modifiedTime: a.updatedAt.toISOString(),
      section: a.category ?? undefined,
      tags: a.keywords,
      ...(a.coverUrl ? { images: [{ url: a.coverUrl, alt: a.title }] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: PageProps<"/journal/[slug]">) {
  const { slug } = await params;
  const a = await load(slug);
  if (!a || !isPublished(a)) notFound();
  const [brand, related] = await Promise.all([getSetting("brand"), relatedArticles(a)]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
      <JsonLd data={[articleJsonLd(a, brand, a.products), breadcrumbJsonLd([{ name: "Главная", path: "/" }, { name: "Журнал", path: "/journal" }, { name: a.title, path: `/journal/${a.slug}` }])]} />
      <nav className="mb-6 text-[0.65rem] uppercase tracking-[0.2em] text-muted">
        <Link href="/journal">Журнал</Link>
        {a.category && <> / <Link href={`/journal?category=${encodeURIComponent(a.category)}`}>{a.category}</Link></>}
      </nav>
      <header className="mx-auto max-w-3xl text-center">
        <div className="flex justify-center gap-3 text-[0.62rem] uppercase tracking-[0.16em] text-muted">
          {a.category && <span>{a.category}</span>}
          <span>{formatDate(a.publishedAt)}</span>
        </div>
        <h1 className="mt-3">{a.title}</h1>
        {a.excerpt && <p className="mt-4 text-sm leading-relaxed text-ink/80"><span className="eyebrow mr-2 !text-[0.62rem]">Коротко</span>{a.excerpt}</p>}
        <p className="mt-4 text-[0.68rem] uppercase tracking-[0.12em] text-muted">
          Текст: <Link href="/about#founder" className="underline underline-offset-4">{brand.founder || `Редакция ${brand.name}`}</Link>
          {a.updatedAt.getTime() - (a.publishedAt?.getTime() ?? 0) > 86_400_000 && <> · обновлено {formatDate(a.updatedAt)}</>}
        </p>
      </header>
      {a.coverUrl && (
        <div className="relative mx-auto mt-10 aspect-[16/9] max-w-5xl bg-sand">
          <Image src={a.coverUrl} alt={a.title} fill priority sizes="(min-width: 1024px) 60rem, 100vw" className="object-cover" />
        </div>
      )}
      <div className="mx-auto mt-12 max-w-5xl">
        <Markdown source={a.body} />
      </div>
      {a.products.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-8">Вещи из статьи</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {a.products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}
      {related.length > 0 && (
        <section className="mt-20 border-t border-line pt-10">
          <h2 className="mb-8">Читайте также</h2>
          <div className="grid gap-x-6 gap-y-10 md:grid-cols-3">
            {related.map((r) => (
              <Link key={r.id} href={`/journal/${r.slug}`} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden bg-sand">
                  {r.coverUrl && <Image src={r.coverUrl} alt={r.title} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />}
                </div>
                <div className="mt-3 flex items-center gap-3 text-[0.62rem] uppercase tracking-[0.16em] text-muted">
                  {r.category && <span>{r.category}</span>}
                  <span>{formatDate(r.publishedAt)}</span>
                </div>
                <h3 className="mt-2">{r.title}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
