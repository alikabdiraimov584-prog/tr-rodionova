import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { requireSection } from "@/lib/auth";
import { overview, byDay, breakdown, funnel, productInterest, firstTouch, trackingLinks, type Dim } from "@/lib/analytics-reports";
import { formatMoney, pct } from "@/lib/money";
import { TRAFFIC_CHANNEL } from "@/lib/labels";
import { Badge, Eyebrow, PageTitle, Stat } from "@/components/ui";
import { BarChart, HBar } from "@/components/crm/charts";
import { TrackingLinkForm } from "@/components/crm/analytics-forms";
import { SubmitButton } from "@/components/form";
import { toggleTrackingLinkAction } from "@/app/actions/crm-analytics";
import { qs, str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Аналитика сайта" };

const DIMS: { key: Dim; label: string }[] = [
  { key: "channel", label: "Каналы" },
  { key: "source", label: "Источники" },
  { key: "campaign", label: "Кампании" },
  { key: "landingPath", label: "Страницы входа" },
  { key: "referrerHost", label: "Рефереры" },
  { key: "device", label: "Устройства" },
];

export default async function AnalyticsPage({ searchParams }: PageProps<"/crm/analytics">) {
  await requireSection("analytics");
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(str(sp.days))) ? Number(str(sp.days)) : 30;
  const dim = (DIMS.find((d) => d.key === str(sp.dim))?.key ?? "channel") as Dim;
  const to = new Date();
  to.setHours(24, 0, 0, 0);
  const from = new Date(to.getTime() - days * 86_400_000);
  const p = { from, to };
  const [ov, daily, rows, fun, products, first, links] = await Promise.all([overview(p), byDay(p), breakdown(p, dim), funnel(p), productInterest(p), firstTouch(), trackingLinks(p)]);
  const h = await headers();
  const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const label = (k: string) => (dim === "channel" ? TRAFFIC_CHANNEL[k] ?? k : k);
  return (
    <div className="space-y-6">
      <PageTitle
        title="Аналитика сайта"
        actions={[7, 30, 90].map((d) => <Link key={d} href={qs("/crm/analytics", { days: d, dim })} className={`btn btn-sm ${days === d ? "bg-ink text-ivory" : "border border-line"}`}>{d} дн.</Link>)}
      >
        Собственный счётчик без передачи данных третьим лицам: визиты учитываются после согласия на cookie. Заказы привязываются к визиту (последний клик), клиенты — к первому источнику.
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Визиты" value={ov.visits} hint={ov.prevVisits ? `${ov.visits >= ov.prevVisits ? "+" : ""}${pct(ov.visits - ov.prevVisits, ov.prevVisits)}% к пред. периоду` : undefined} />
        <Stat label="Посетители" value={ov.visitors} />
        <Stat label="Просмотры" value={ov.pageviews} hint={ov.visits ? `${(ov.pageviews / ov.visits).toFixed(1)} на визит` : undefined} />
        <Stat label="Заказы с сайта" value={ov.orders} />
        <Stat label="Конверсия" value={`${ov.conversion}%`} hint="визит → оплаченный заказ" />
        <Stat label="Выручка на визит" value={formatMoney(ov.revenuePerVisit)} hint={formatMoney(ov.revenue)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="card min-w-0 p-5">
          <Eyebrow>Визиты и заказы по дням</Eyebrow>
          <div className="mt-4"><BarChart money={false} data={daily.map((d) => ({ label: days > 30 ? "" : d.label, value: d.visits, sub: d.orders }))} /></div>
          <div className="mt-2 flex gap-4 text-xs text-muted"><span><span className="mr-1 inline-block h-2 w-2 bg-taupe" />визиты</span><span><span className="mr-1 inline-block h-2 w-2 bg-champagne" />заказы</span></div>
        </div>
        <div className="card p-5">
          <Eyebrow>Воронка</Eyebrow>
          <div className="mt-4 space-y-3">
            {fun.map((s, i) => (
              <div key={s.label} className="text-sm">
                <div className="flex justify-between"><span>{s.label}</span><span className="text-muted">{s.value}{i > 0 && fun[0].value ? ` · ${pct(s.value, fun[0].value)}%` : ""}</span></div>
                <div className="mt-1 h-2 bg-sand"><div className="h-2 bg-taupe" style={{ width: `${fun[0].value ? (s.value / fun[0].value) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto" tabIndex={0}>
        <div className="flex flex-wrap items-center gap-2 p-5 pb-2">
          <Eyebrow>Источники трафика</Eyebrow>
          {DIMS.map((d) => <Link key={d.key} href={qs("/crm/analytics", { days, dim: d.key })} className={`badge ${dim === d.key ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>{d.label}</Link>)}
        </div>
        <table className="table">
          <thead><tr><th>{DIMS.find((d) => d.key === dim)?.label}</th><th className="text-right">Визиты</th><th className="text-right">Доля</th><th className="text-right">Стр./визит</th><th className="text-right">Отказы</th><th className="text-right">Регистрации</th><th className="text-right">Заказы</th><th className="text-right">Конверсия</th><th className="text-right">Выручка</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="max-w-xs truncate">{label(r.key)}</td>
                <td className="text-right">{r.visits}</td>
                <td className="text-right text-muted">{pct(r.visits, ov.visits)}%</td>
                <td className="text-right text-muted">{(r.pageviews / r.visits).toFixed(1)}</td>
                <td className="text-right text-muted">{pct(r.bounces, r.visits)}%</td>
                <td className="text-right">{r.registrations || "—"}</td>
                <td className="text-right">{r.orders || "—"}</td>
                <td className="text-right">{r.orders ? `${Math.round((r.orders / r.visits) * 1000) / 10}%` : "—"}</td>
                <td className="whitespace-nowrap text-right">{r.revenue ? formatMoney(r.revenue) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted">Данных за период пока нет. Счётчик начинает собирать визиты после согласия посетителя на cookie.</p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card overflow-x-auto" tabIndex={0}>
          <div className="p-5 pb-2"><Eyebrow>Интерес к товарам</Eyebrow></div>
          <table className="table">
            <thead><tr><th>Товар</th><th className="text-right">Просмотры</th><th className="text-right">В корзину</th><th className="text-right">Избранное</th><th className="text-right">Ждут</th></tr></thead>
            <tbody>
              {products.map((r) => (
                <tr key={r.productId}>
                  <td><Link href={`/crm/products/${r.productId}`} className="underline">{r.name}</Link></td>
                  <td className="text-right">{r.views}</td>
                  <td className="text-right">{r.carts || "—"}{r.views ? <span className="ml-1 text-xs text-muted">{pct(r.carts, r.views)}%</span> : null}</td>
                  <td className="text-right">{r.wish || "—"}</td>
                  <td className="text-right">{r.wait || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && <p className="p-5 text-sm text-muted">Пока нет просмотров.</p>}
        </div>
        <div className="card p-5">
          <Eyebrow>Откуда приходят покупательницы (первое касание)</Eyebrow>
          <div className="mt-4"><HBar items={first.map((f) => ({ label: `${TRAFFIC_CHANNEL[f.channel]} · ${f.customers}`, value: f.revenue, display: formatMoney(f.revenue) }))} /></div>
          {first.length === 0 && <p className="mt-2 text-sm text-muted">Появится, когда зарегистрируются клиенты с учтённым источником.</p>}
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <Eyebrow>Трекинговые ссылки</Eyebrow>
          <p className="mt-1 text-xs text-muted">Короткая ссылка для сторис, блогеров, QR-кодов в шоуруме и рассылок. Считает клики, визиты, заказы и выручку.</p>
        </div>
        <TrackingLinkForm />
        <div className="-mx-5 overflow-x-auto px-5" tabIndex={0}>
        <table className="table">
          <thead><tr><th>Ссылка</th><th>Метки</th><th className="text-right">Клики</th><th className="text-right">Визиты</th><th className="text-right">Заказы</th><th className="text-right">Выручка</th><th /></tr></thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id} className={l.isActive ? "" : "opacity-50"}>
                <td>{l.name}<div className="font-mono text-xs text-muted">{base}/go/{l.slug}</div></td>
                <td className="text-xs text-muted">{l.source} / {l.medium}{l.campaign ? ` / ${l.campaign}` : ""} → {l.targetPath}</td>
                <td className="text-right">{l.clicks}</td>
                <td className="text-right">{l.visits}</td>
                <td className="text-right">{l.orders || "—"}</td>
                <td className="whitespace-nowrap text-right">{l.revenue ? formatMoney(l.revenue) : "—"}</td>
                <td className="whitespace-nowrap">
                  <Badge tone={l.isActive ? "success" : "neutral"}>{l.isActive ? "активна" : "выкл"}</Badge>{" "}
                  <form action={toggleTrackingLinkAction} className="inline"><input type="hidden" name="id" value={l.id} /><SubmitButton className="text-xs underline">{l.isActive ? "выключить" : "включить"}</SubmitButton></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
