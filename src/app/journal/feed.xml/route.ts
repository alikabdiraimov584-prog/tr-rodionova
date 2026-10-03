import { db } from "@/lib/db";
import { siteUrl } from "@/lib/seo";

export const revalidate = 1800;

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** RSS журнала: для Яндекс Дзен, агрегаторов и быстрого обхода новых статей. */
export async function GET() {
  const base = siteUrl();
  const articles = await db.article.findMany({
    where: { publishedAt: { not: null, lte: new Date() } },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: { slug: true, title: true, excerpt: true, coverUrl: true, category: true, publishedAt: true },
  });
  const items = articles
    .map(
      (a) => `<item>
  <title>${esc(a.title)}</title>
  <link>${base}/journal/${a.slug}</link>
  <guid isPermaLink="true">${base}/journal/${a.slug}</guid>
  <pubDate>${a.publishedAt!.toUTCString()}</pubDate>
  ${a.category ? `<category>${esc(a.category)}</category>` : ""}
  ${a.excerpt ? `<description>${esc(a.excerpt)}</description>` : ""}
  ${a.coverUrl ? `<enclosure url="${base}${a.coverUrl}" type="image/jpeg" />` : ""}
</item>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Журнал T.Rodionova</title>
  <link>${base}/journal</link>
  <atom:link href="${base}/journal/feed.xml" rel="self" type="application/rss+xml" />
  <description>Заметки ателье T.Rodionova: ткани, уход за вещами, стиль, интервью.</description>
  <language>ru</language>
  ${items}
</channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
}
