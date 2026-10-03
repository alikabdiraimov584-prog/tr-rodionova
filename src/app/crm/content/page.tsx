import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { Badge, Empty, PageTitle } from "@/components/ui";
import { str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Лукбук и журнал" };

export default async function ContentPage({ searchParams }: PageProps<"/crm/content">) {
  await requireSection("content");
  const sp = await searchParams;
  const tab = str(sp.tab) === "journal" ? "journal" : "looks";
  const now = new Date();
  const [looks, articles] = await Promise.all([
    db.look.findMany({ orderBy: [{ order: "asc" }, { createdAt: "desc" }], include: { _count: { select: { items: true } } } }),
    db.article.findMany({ orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], include: { _count: { select: { products: true } } } }),
  ]);
  const tabClass = (t: string) => `badge ${tab === t ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`;
  return (
    <div>
      <PageTitle
        title="Лукбук и журнал"
        actions={
          tab === "looks" ? (
            <Link href="/crm/content/looks/new" className="btn-primary btn-sm">Новый образ</Link>
          ) : (
            <Link href="/crm/content/articles/new" className="btn-primary btn-sm">Новая статья</Link>
          )
        }
      >
        Образы показываются на странице «Лукбук», статьи — в «Журнале» после даты публикации.
      </PageTitle>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href="/crm/content?tab=looks" className={tabClass("looks")}>Образы · {looks.length}</Link>
        <Link href="/crm/content?tab=journal" className={tabClass("journal")}>Статьи · {articles.length}</Link>
      </div>

      {tab === "looks" &&
        (looks.length === 0 ? (
          <Empty title="Образов пока нет" action={<Link href="/crm/content/looks/new" className="btn-primary btn-sm">Создать образ</Link>} />
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Образ</th><th>Сезон</th><th>Адрес</th><th className="text-right">Вещей</th><th className="text-right">Порядок</th><th>Статус</th><th /></tr></thead>
              <tbody>
                {looks.map((l) => (
                  <tr key={l.id}>
                    <td><Link href={`/crm/content/looks/${l.id}`} className="underline underline-offset-4">{l.title}</Link></td>
                    <td className="text-muted">{l.season ?? "—"}</td>
                    <td className="text-xs text-muted">/lookbook/{l.slug}</td>
                    <td className="text-right">{l._count.items}</td>
                    <td className="text-right text-muted">{l.order}</td>
                    <td><Badge tone={l.isPublished ? "success" : "neutral"}>{l.isPublished ? "Опубликован" : "Скрыт"}</Badge></td>
                    <td className="text-right">{l.isPublished && <Link href={`/lookbook/${l.slug}`} target="_blank" className="text-xs underline">на сайте ↗</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "journal" &&
        (articles.length === 0 ? (
          <Empty title="Статей пока нет" action={<Link href="/crm/content/articles/new" className="btn-primary btn-sm">Написать статью</Link>} />
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Статья</th><th>Рубрика</th><th>Адрес</th><th className="text-right">Товаров</th><th>Публикация</th><th>Статус</th><th /></tr></thead>
              <tbody>
                {articles.map((a) => {
                  const live = !!a.publishedAt && a.publishedAt <= now;
                  const scheduled = !!a.publishedAt && a.publishedAt > now;
                  return (
                    <tr key={a.id}>
                      <td><Link href={`/crm/content/articles/${a.id}`} className="underline underline-offset-4">{a.title}</Link></td>
                      <td className="text-muted">{a.category ?? "—"}</td>
                      <td className="text-xs text-muted">/journal/{a.slug}</td>
                      <td className="text-right">{a._count.products}</td>
                      <td className="whitespace-nowrap text-xs text-muted">{a.publishedAt ? formatDate(a.publishedAt, true) : "—"}</td>
                      <td><Badge tone={live ? "success" : scheduled ? "info" : "neutral"}>{live ? "Опубликована" : scheduled ? "Запланирована" : "Черновик"}</Badge></td>
                      <td className="text-right">{live && <Link href={`/journal/${a.slug}`} target="_blank" className="text-xs underline">на сайте ↗</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
