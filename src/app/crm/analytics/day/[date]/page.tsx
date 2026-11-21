import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/auth";
import { byDay, dayKey, dayVisits } from "@/lib/analytics-reports";
import { formatMoney } from "@/lib/money";
import { TRAFFIC_CHANNEL } from "@/lib/labels";
import { Badge, Empty, PageTitle, Stat } from "@/components/ui";
import { Pager, qs, str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Аналитика: день" };

const PER_PAGE = 50;

/** Действия визита; просмотр страниц — фон, остальное — целевые действия. */
const EVENT: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "gold" }> = {
  PAGEVIEW: { label: "Страница", tone: "neutral" },
  PRODUCT_VIEW: { label: "Смотрела товар", tone: "info" },
  WISHLIST: { label: "В избранное", tone: "gold" },
  WAITLIST: { label: "Лист ожидания", tone: "gold" },
  ADD_TO_CART: { label: "В корзину", tone: "warning" },
  CHECKOUT_START: { label: "Начала оформление", tone: "warning" },
  REGISTER: { label: "Регистрация", tone: "gold" },
  ORDER: { label: "Заказ", tone: "success" },
};

const time = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** Один день аналитики: сводка, переход к соседним дням и каждый визит с его действиями по порядку. */
export default async function AnalyticsDayPage({ params, searchParams }: PageProps<"/crm/analytics/day/[date]">) {
  await requireSection("analytics");
  const { date } = await params;
  const sp = await searchParams;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const from = new Date(`${date}T00:00:00`);
  if (Number.isNaN(from.getTime()) || dayKey(from) !== date) notFound();
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  const prev = new Date(from);
  prev.setDate(prev.getDate() - 1);
  const goalsOnly = str(sp.goals) === "1";
  const page = Math.max(1, Number(str(sp.page)) || 1);

  const [[day], visits] = await Promise.all([byDay({ from, to }), dayVisits({ from, to }, { goalsOnly, skip: (page - 1) * PER_PAGE, take: PER_PAGE })]);
  const pages = Math.max(1, Math.ceil(visits.total / PER_PAGE));
  const title = from.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
  // следующий день показывается, только если он уже наступил
  const hasNext = dayKey(to) <= dayKey(new Date());
  const href = (p: { goals?: boolean; page?: number }) => qs(`/crm/analytics/day/${date}`, { goals: (p.goals ?? goalsOnly) ? 1 : undefined, page: p.page && p.page > 1 ? p.page : undefined });

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Аналитика сайта"
        title={title}
        actions={
          <>
            <Link href="/crm/analytics" className="btn btn-sm border border-line">← Все дни</Link>
            <Link href={`/crm/analytics/day/${dayKey(prev)}`} className="btn btn-sm border border-line">Предыдущий день</Link>
            {hasNext && <Link href={`/crm/analytics/day/${dayKey(to)}`} className="btn btn-sm border border-line">Следующий день</Link>}
          </>
        }
      >
        Каждый визит этого дня: откуда пришла посетительница, с какого устройства и что сделала на сайте — по порядку. Время — московское.
      </PageTitle>

      {day && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-7">
          <Stat label="Визиты" value={day.visits} hint={`${day.visitors} посетителей`} />
          <Stat label="Смотрели товар" value={day.views} />
          <Stat label="В корзину" value={day.carts} />
          <Stat label="Оформление" value={day.checkouts} />
          <Stat label="Регистрации" value={day.registers} />
          <Stat label="Заказы" value={day.orders} />
          <Stat label="Выручка" value={formatMoney(day.revenue)} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ goals: false, page: 1 })} className={`badge ${!goalsOnly ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>Все визиты</Link>
        <Link href={href({ goals: true, page: 1 })} className={`badge ${goalsOnly ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>Только с целевыми действиями</Link>
        <span className="text-xs text-muted">Показано {visits.sessions.length} из {visits.total}</span>
      </div>

      {visits.sessions.length === 0 ? (
        <Empty title={goalsOnly ? "Целевых действий в этот день не было" : "Визитов в этот день не было"}>Визиты учитываются после согласия посетительницы на cookie.</Empty>
      ) : (
        <div className="space-y-3">
          {visits.sessions.map((s) => {
            const goals = s.events.filter((e) => e.type !== "PAGEVIEW");
            const source = s.source ? `${s.source}${s.medium ? ` / ${s.medium}` : ""}` : s.referrerHost ?? null;
            return (
              <div key={s.id} className="card p-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold">{time(s.startedAt)}{s.lastSeenAt.getTime() - s.startedAt.getTime() > 60_000 ? `–${time(s.lastSeenAt)}` : ""}</span>
                  <span>{TRAFFIC_CHANNEL[s.channel] ?? s.channel}{source ? <span className="text-muted"> · {source}</span> : null}</span>
                  {s.campaign && <span className="text-muted">кампания {s.campaign}</span>}
                  <span className="text-muted">{[s.device, s.os, s.browser].filter(Boolean).join(", ") || "устройство не определено"}</span>
                  <span className="text-muted">{s.pageviews} {s.pageviews === 1 ? "страница" : s.pageviews < 5 ? "страницы" : "страниц"}</span>
                  {s.user ? (
                    <Link href={`/crm/customers/${s.user.id}`} className="underline-offset-4 hover:underline">{[s.user.firstName, s.user.lastName].filter(Boolean).join(" ") || "Клиентка"}</Link>
                  ) : (
                    <span className="text-muted">гость</span>
                  )}
                  {goals.length > 0 && <Badge tone="success">{goals.length} {goals.length === 1 ? "целевое действие" : goals.length < 5 ? "целевых действия" : "целевых действий"}</Badge>}
                </div>
                <div className="mt-1 truncate text-xs text-muted">Вход: {s.landingPath}</div>
                {s.events.length > 0 && (
                  <ol className="mt-3 space-y-1.5 border-l border-line pl-4 text-sm">
                    {s.events.map((e) => {
                      const meta = EVENT[e.type] ?? { label: e.type, tone: "neutral" as const };
                      const product = e.productId ? visits.products.get(e.productId) : null;
                      const order = e.orderId ? visits.orders.get(e.orderId) : null;
                      return (
                        <li key={e.id} className={`flex flex-wrap items-baseline gap-x-2 ${e.type === "PAGEVIEW" ? "text-muted" : ""}`}>
                          <span className="w-11 shrink-0 tabular-nums text-xs text-muted">{time(e.createdAt)}</span>
                          {e.type === "PAGEVIEW" ? <span className="text-xs">{meta.label}</span> : <Badge tone={meta.tone}>{meta.label}</Badge>}
                          {product && e.productId && <Link href={`/crm/products/${e.productId}`} className="underline-offset-4 hover:underline">{product}</Link>}
                          {order && e.orderId && <Link href={`/crm/orders/${e.orderId}`} className="underline-offset-4 hover:underline">№{order.number} · {formatMoney(order.total)}</Link>}
                          {!order && e.type === "ORDER" && e.value ? <span>{formatMoney(e.value)}</span> : null}
                          {e.path && !product && <span className="min-w-0 truncate text-xs text-muted">{e.path}</span>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Pager page={page} pages={pages} href={(p) => href({ page: p })} />
    </div>
  );
}
