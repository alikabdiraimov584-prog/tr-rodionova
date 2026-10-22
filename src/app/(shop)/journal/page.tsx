import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/money";
import { Empty, PageTitle } from "@/components/ui";

// по 24 статьи на страницу: журнал пополняется каждый день, без листания страница росла бы бесконечно
const PAGE_SIZE = 24;

type Params = { category?: string; page: number };

function readParams(sp: Record<string, string | string[] | undefined>): Params {
  const category = typeof sp.category === "string" && sp.category ? sp.category : undefined;
  const n = typeof sp.page === "string" ? Number.parseInt(sp.page, 10) : 1;
  return { category, page: Number.isFinite(n) && n > 1 ? n : 1 };
}

function href({ category, page }: Params) {
  const q = new URLSearchParams();
  if (category) q.set("category", category);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/journal?${s}` : "/journal";
}

export async function generateMetadata({ searchParams }: PageProps<"/journal">): Promise<Metadata> {
  const p = readParams(await searchParams);
  const suffix = [p.category, p.page > 1 ? `страница ${p.page}` : null].filter(Boolean).join(", ");
  return {
    title: suffix ? `Журнал — ${suffix}` : "Журнал",
    description: "Журнал T.Rodionova: уход за вещами, ткани, образы, размеры и ателье.",
    // каждая страница листания и рубрика — самостоятельная страница со своим адресом
    alternates: { canonical: href(p) },
  };
}

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const p = readParams(await searchParams);
  const { category, page } = p;
  const now = new Date();
  const published = { publishedAt: { not: null, lte: now } } as const;
  const where = { ...published, ...(category ? { category } : {}) };
  const [articles, total, categories] = await Promise.all([
    db.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, slug: true, title: true, excerpt: true, coverUrl: true, category: true, publishedAt: true },
    }),
    db.article.count({ where }),
    db.article.groupBy({ by: ["category"], where: { ...published, category: { not: null } }, _count: true, orderBy: { category: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <PageTitle eyebrow="Журнал" title="Заметки ателье">О тканях, уходе за вещами и людях, которые их создают.</PageTitle>
      {categories.length > 0 && (
        <nav className="mb-10 flex flex-wrap gap-x-5 gap-y-2 border-y border-line py-4 text-[0.68rem] uppercase tracking-[0.18em]">
          <Link href="/journal" className={!category ? "text-ink underline underline-offset-4" : "text-muted hover:text-ink"}>Все</Link>
          {categories.map((c) => (
            <Link key={c.category} href={href({ category: c.category!, page: 1 })} className={category === c.category ? "text-ink underline underline-offset-4" : "text-muted hover:text-ink"}>
              {c.category}
            </Link>
          ))}
        </nav>
      )}
      {articles.length === 0 ? (
        <Empty title="Статей пока нет" action={<Link href="/journal" className="btn-outline">Все статьи</Link>}>Мы готовим новые материалы.</Empty>
      ) : (
        <div className="grid gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <Link key={a.id} href={`/journal/${a.slug}`} className="group block">
              <div className="relative aspect-[4/3] overflow-hidden bg-sand">
                {a.coverUrl && <Image src={a.coverUrl} alt={a.title} fill sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />}
              </div>
              <div className="mt-4 flex items-center gap-3 text-[0.62rem] uppercase tracking-[0.16em] text-muted">
                {a.category && <span>{a.category}</span>}
                <span>{formatDate(a.publishedAt)}</span>
              </div>
              <h2 className="mt-2">{a.title}</h2>
              {a.excerpt && <p className="mt-2 text-sm leading-relaxed text-ink/75">{a.excerpt}</p>}
            </Link>
          ))}
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Страницы журнала" className="mt-16 flex items-center justify-between gap-4 border-t border-line pt-6 text-[0.68rem] uppercase tracking-[0.16em]">
          {page > 1 ? <Link href={href({ category, page: page - 1 })} className="hover:opacity-60">← Новее</Link> : <span />}
          <span className="text-muted">Страница {page} из {pages}</span>
          {page < pages ? <Link href={href({ category, page: page + 1 })} className="hover:opacity-60">Ранее →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
