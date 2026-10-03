import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/money";
import { Empty, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Журнал", description: "Журнал T.Rodionova: уход за вещами, ткани, ателье, интервью." };

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" && sp.category ? sp.category : undefined;
  const now = new Date();
  const published = { publishedAt: { not: null, lte: now } } as const;
  const [articles, categories] = await Promise.all([
    db.article.findMany({
      where: { ...published, ...(category ? { category } : {}) },
      orderBy: { publishedAt: "desc" },
      select: { id: true, slug: true, title: true, excerpt: true, coverUrl: true, category: true, publishedAt: true },
    }),
    db.article.groupBy({ by: ["category"], where: { ...published, category: { not: null } }, _count: true, orderBy: { category: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <PageTitle eyebrow="Журнал" title="Заметки ателье">О тканях, уходе за вещами и людях, которые их создают.</PageTitle>
      {categories.length > 0 && (
        <nav className="mb-10 flex flex-wrap gap-x-5 gap-y-2 border-y border-line py-4 text-[0.68rem] uppercase tracking-[0.18em]">
          <Link href="/journal" className={!category ? "text-ink underline underline-offset-4" : "text-muted hover:text-ink"}>Все</Link>
          {categories.map((c) => (
            <Link key={c.category} href={`/journal?category=${encodeURIComponent(c.category!)}`} className={category === c.category ? "text-ink underline underline-offset-4" : "text-muted hover:text-ink"}>
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
                {a.coverUrl && <Image src={a.coverUrl} alt={a.title} fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />}
              </div>
              <div className="mt-4 flex items-center gap-3 text-[0.62rem] uppercase tracking-[0.16em] text-muted">
                {a.category && <span>{a.category}</span>}
                <span>{formatDate(a.publishedAt)}</span>
              </div>
              <h2 className="mt-2 text-xl">{a.title}</h2>
              {a.excerpt && <p className="mt-2 text-sm leading-relaxed text-ink/75">{a.excerpt}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
