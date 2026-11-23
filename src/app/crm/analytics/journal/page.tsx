import type { Metadata } from "next";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/money";
import { Eyebrow, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Охват журнала" };

type ArticleReach = {
  slug: string;
  title: string;
  category: string | null;
  publishedAt: Date;
  views: number;
  visits: number;
  readers: number;
};

const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const WINDOW_DAYS = 14;
const WINDOW_MS = WINDOW_DAYS * 86_400_000;

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export default async function JournalAnalyticsPage() {
  await requireSection("analytics");
  // Сопоставляем статьи с полным и одинаковым сроком наблюдения, включая статьи без просмотров.
  const cutoff = new Date(new Date().getTime() - WINDOW_MS);
  const articles = await db.$queryRaw<ArticleReach[]>`
    WITH journal_hits AS (
      SELECT e.id, e."sessionId", rtrim(split_part(split_part(e.path, '?', 1), '#', 1), '/') AS path, e."createdAt"
      FROM "AnalyticsEvent" e
      WHERE e.type = 'PAGEVIEW' AND e.path LIKE '/journal/%'
    )
    SELECT a.slug, a.title, a.category, a."publishedAt",
      COUNT(h.id)::int AS views,
      COUNT(DISTINCT h."sessionId")::int AS visits,
      COUNT(DISTINCT s."visitorId")::int AS readers
    FROM "Article" a
    LEFT JOIN journal_hits h
      ON h.path = '/journal/' || a.slug
      AND h."createdAt" >= a."publishedAt"
      AND h."createdAt" < a."publishedAt" + INTERVAL '336 hours'
    LEFT JOIN "VisitorSession" s ON s.id = h."sessionId"
    WHERE a."publishedAt" <= ${cutoff}
    GROUP BY a.id
    ORDER BY readers DESC, views DESC, a."publishedAt" DESC, a.slug
  `;
  const groups = new Map<string, ArticleReach[]>();
  for (const article of articles) {
    const label = article.category || "Без рубрики";
    const list = groups.get(label) ?? [];
    list.push(article);
    groups.set(label, list);
  }
  const formats = [...groups].map(([label, rows]) => ({
    label,
    count: rows.length,
    medianReaders: median(rows.map((r) => r.readers)),
    averageViews: rows.reduce((sum, r) => sum + r.views, 0) / rows.length,
  })).sort((a, b) => b.medianReaders - a.medianReaders || b.averageViews - a.averageViews);

  return (
    <div className="space-y-6">
      <PageTitle title="Охват журнала" actions={<Link href="/crm/analytics" className="btn-outline btn-sm">Вся аналитика</Link>}>
        Первые {WINDOW_DAYS} дней после публикации. Читатели — уникальные идентификаторы посетителей в счётчике сайта.
        Поисковые показы измеряются отдельно в Вебмастере или Search Console.
      </PageTitle>
      {!articles.length ? <p className="text-sm text-muted">Пока нет статей с полными 14 днями после публикации.</p> : <>
        {!articles.some((a) => a.views > 0) && <p className="text-sm text-muted">В этом окне счётчик не зарегистрировал просмотров статей.</p>}
        <section className="card overflow-x-auto" aria-label="Охват по рубрикам">
          <div className="p-5 pb-2"><Eyebrow>Сравнение рубрик</Eyebrow></div>
          <table className="table">
            <thead><tr><th>Рубрика</th><th className="text-right">Статей</th><th className="text-right">Медиана читателей на статью</th><th className="text-right">Среднее просмотров на статью</th></tr></thead>
            <tbody>{formats.map((row) => <tr key={row.label}>
              <td>{row.label}</td><td className="text-right">{format.format(row.count)}</td>
              <td className="text-right">{format.format(row.medianReaders)}</td>
              <td className="text-right">{format.format(row.averageViews)}</td>
            </tr>)}</tbody>
          </table>
        </section>
        <section className="card overflow-x-auto" aria-label="Охват по статьям">
          <div className="p-5 pb-2"><Eyebrow>Все статьи с полным периодом</Eyebrow></div>
          <table className="table">
            <thead><tr><th>Статья</th><th>Рубрика</th><th>Выпуск</th><th className="text-right">Читатели</th><th className="text-right">Визиты</th><th className="text-right">Просмотры</th></tr></thead>
            <tbody>{articles.map((row) => <tr key={row.slug}>
              <td><Link href={`/journal/${row.slug}`} className="underline">{row.title}</Link></td>
              <td>{row.category || "—"}</td><td className="whitespace-nowrap">{formatDate(row.publishedAt)}</td>
              <td className="text-right">{format.format(row.readers)}</td>
              <td className="text-right">{format.format(row.visits)}</td>
              <td className="text-right">{format.format(row.views)}</td>
            </tr>)}</tbody>
          </table>
        </section>
      </>}
    </div>
  );
}
