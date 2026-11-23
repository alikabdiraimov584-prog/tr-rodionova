import type { Metadata } from "next";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { analyticsDayStart, dayKey, DAY_MS, journalAnalytics } from "@/lib/analytics-reports";
import { formatDate, formatMoney } from "@/lib/money";
import { TRAFFIC_CHANNEL } from "@/lib/labels";
import { Eyebrow, PageTitle, Stat } from "@/components/ui";
import { BarChart } from "@/components/crm/charts";

export const metadata: Metadata = { title: "Аналитика журнала" };

const periods = ["7", "30", "90", "all"] as const;
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const zero = { views: 0, visits: 0, readers: 0 };

export default async function JournalAnalyticsPage({ searchParams }: PageProps<"/crm/analytics/journal">) {
  await requireSection("analytics");
  const { days } = await searchParams;
  const period = periods.find((value) => value === days) ?? "30";
  const today = analyticsDayStart(dayKey(new Date()));
  const to = new Date(today.getTime() + DAY_MS);
  const from = period === "all" ? null : new Date(to.getTime() - Number(period) * DAY_MS);
  const { articles, reach, orders, revenue } = await journalAnalytics({ from, to });
  const totals = reach.find((row) => row.dimension === "total") ?? zero;
  const articleReach = new Map(reach.filter((row) => row.dimension === "article").map((row) => [row.key, row]));
  const daily = new Map(reach.filter((row) => row.dimension === "day").map((row) => [row.key, row]));
  const rows = articles.map((article) => ({ ...article, ...(articleReach.get(article.slug) ?? zero) }))
    .sort((a, b) => b.readers - a.readers || b.views - a.views);
  const counts = new Map<string, number>();
  for (const article of rows) {
    const category = article.category || "Без рубрики";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const categories = new Map(reach.filter((row) => row.dimension === "category").map((row) => [row.key, row]));
  const formats = [...counts].map(([label, count]) => ({
    label, count, ...(categories.get(label) ?? zero),
  })).sort((a, b) => b.readers - a.readers || b.views - a.views);
  const channels = reach.filter((row) => row.dimension === "channel").sort((a, b) => b.visits - a.visits);
  const firstDay = [...daily.keys()].sort()[0];
  const chartStart = from ?? (firstDay ? analyticsDayStart(firstDay) : today);
  const chart = Array.from({ length: Math.round((to.getTime() - chartStart.getTime()) / DAY_MS) }, (_, i) => {
    const date = dayKey(new Date(chartStart.getTime() + i * DAY_MS));
    return { date, ...(daily.get(date) ?? zero) };
  });

  return (
    <div className="space-y-6">
      <PageTitle title="Аналитика журнала" actions={<>
        <Link href="/crm/analytics" className="btn-outline btn-sm">Вся аналитика</Link>
        {periods.map((value) => <Link
          key={value} href={`/crm/analytics/journal?days=${value}`}
          aria-current={period === value ? "page" : undefined}
          className={`btn btn-sm ${period === value ? "bg-ink text-ivory" : "border border-line"}`}
        >{value === "all" ? "За всё время" : `${value} дн.`}</Link>)}
      </>}>
        Статистика просмотров отдельных статей. Дни считаются по Москве. Посетители определяются по идентификатору счётчика.
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Визиты" value={totals.visits} />
        <Stat label="Посетители" value={totals.readers} />
        <Stat label="Просмотры" value={totals.views} />
        <Stat label="Оплаченные заказы" value={orders} hint="В визитах после просмотра статьи" />
        <Stat label="Заказов на 100 визитов" value={number.format(totals.visits ? orders / totals.visits * 100 : 0)} />
        <Stat label="Выручка" value={formatMoney(revenue)} hint="По оплаченным заказам из этих визитов" />
      </div>
      {!totals.views && <p className="text-sm text-muted">Счётчик не зарегистрировал просмотров статей за выбранный период.</p>}

      <section className="card min-w-0 p-5" aria-label="Посещения по дням">
        <Eyebrow>Визиты и просмотры по дням</Eyebrow>
        <BarChart money={false} data={chart.map(({ date, views, visits }) => ({
          label: `${date.slice(8)}.${date.slice(5, 7)}`, value: visits, sub: views,
          title: `${date}: визиты — ${visits}, просмотры — ${views}`,
        }))} />
        <div className="mt-2 flex gap-4 text-xs text-muted">
          <span><span className="mr-1 inline-block h-2 w-2 bg-taupe" />визиты</span>
          <span><span className="mr-1 inline-block h-2 w-2 bg-champagne" />просмотры</span>
        </div>
      </section>

      <section className="card overflow-x-auto" aria-label="Каналы трафика">
        <div className="p-5 pb-2"><Eyebrow>Каналы трафика</Eyebrow></div>
        <table className="table">
          <thead><tr><th>Канал</th><th className="text-right">Визиты</th><th className="text-right">Посетители</th><th className="text-right">Просмотры</th></tr></thead>
          <tbody>{channels.map((row) => <tr key={row.key}>
            <td>{TRAFFIC_CHANNEL[row.key] ?? row.key}</td><td className="text-right">{number.format(row.visits)}</td>
            <td className="text-right">{number.format(row.readers)}</td><td className="text-right">{number.format(row.views)}</td>
          </tr>)}</tbody>
        </table>
        {!channels.length && <p className="p-5 text-sm text-muted">За период пока нет данных о каналах.</p>}
      </section>

      <section className="card overflow-x-auto" aria-label="Охват по рубрикам">
        <div className="p-5 pb-2"><Eyebrow>Сравнение рубрик</Eyebrow></div>
        <table className="table">
          <thead><tr><th>Рубрика</th><th className="text-right">Статей</th><th className="text-right">Посетители</th><th className="text-right">Визиты</th><th className="text-right">Просмотры</th><th className="text-right">Просмотров на статью</th></tr></thead>
          <tbody>{formats.map((row) => <tr key={row.label}>
            <td>{row.label}</td><td className="text-right">{number.format(row.count)}</td>
            <td className="text-right">{number.format(row.readers)}</td><td className="text-right">{number.format(row.visits)}</td>
            <td className="text-right">{number.format(row.views)}</td><td className="text-right">{number.format(row.views / row.count)}</td>
          </tr>)}</tbody>
        </table>
      </section>

      <section className="card overflow-x-auto" aria-label="Охват по статьям">
        <div className="p-5 pb-2"><Eyebrow>По статьям</Eyebrow></div>
        <table className="table">
          <thead><tr><th>Статья</th><th>Рубрика</th><th>Выпуск</th><th className="text-right">Посетители</th><th className="text-right">Визиты</th><th className="text-right">Просмотры</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.slug}>
            <td><Link href={`/journal/${row.slug}`} className="underline">{row.title}</Link></td>
            <td>{row.category || "—"}</td><td className="whitespace-nowrap">{formatDate(row.publishedAt)}</td>
            <td className="text-right">{number.format(row.readers)}</td><td className="text-right">{number.format(row.visits)}</td>
            <td className="text-right">{number.format(row.views)}</td>
          </tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
