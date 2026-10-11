import "server-only";
import { db } from "@/lib/db";
import { PROVIDER } from "@/lib/ads/direct";

/**
 * Сводки по рекламе для CRM: расход и клики из Директа (AdStat) плюс заказы и выручка собственной аналитики,
 * привязанные к кампании по utm_campaign визита (последний клик). CAC и ДРР считаются по реальным оплаченным заказам.
 */

const PAID_STATUSES = ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] as const;

export type Period = { from: Date; to: Date };

/** Дата отчёта Директа (YYYY-MM-DD) как полуночь UTC — так Prisma хранит @db.Date. */
export const dayUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const toDay = (d: Date) => d.toISOString().slice(0, 10);

export type UtmOrders = { orders: number; revenue: number };

/** Оплаченные заказы из Директа за период по utm_campaign; ключ «other» — визиты yandex/cpc без известной кампании. */
export async function ordersByUtm(p: Period, utms: string[]): Promise<Map<string, UtmOrders>> {
  const rows = await db.order.findMany({
    where: { createdAt: { gte: p.from, lt: p.to }, status: { in: [...PAID_STATUSES] }, session: { OR: [{ campaign: { in: utms } }, { source: "yandex", medium: { in: ["cpc", "ppc", "paid"] } }] } },
    select: { total: true, session: { select: { campaign: true } } },
  });
  const map = new Map<string, UtmOrders>();
  for (const o of rows) {
    const key = o.session?.campaign && utms.includes(o.session.campaign) ? o.session.campaign : "other";
    const acc = map.get(key) ?? { orders: 0, revenue: 0 };
    acc.orders++;
    acc.revenue += o.total;
    map.set(key, acc);
  }
  return map;
}

export type CampaignRow = {
  id: string;
  externalId: string;
  name: string;
  kind: string;
  category: string | null;
  state: string | null;
  status: string | null;
  statusPayment: string | null;
  strategy: string | null;
  weeklyBudget: number | null;
  plannedWeekly: number | null;
  targetCpa: number | null;
  utmCampaign: string | null;
  managed: boolean;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  orders: number;
  revenue: number;
};

export async function campaignRows(p: Period): Promise<CampaignRow[]> {
  const campaigns = await db.adCampaign.findMany({ where: { provider: PROVIDER, OR: [{ state: null }, { state: { not: "DELETED" } }] }, orderBy: [{ managed: "desc" }, { createdAt: "asc" }] });
  const utms = campaigns.map((c) => c.utmCampaign).filter((u): u is string => !!u);
  const [stats, orders] = await Promise.all([
    db.adStat.groupBy({ by: ["campaignId"], where: { provider: PROVIDER, date: { gte: p.from, lt: p.to } }, _sum: { impressions: true, clicks: true, cost: true, conversions: true } }),
    ordersByUtm(p, utms),
  ]);
  const byId = new Map(stats.map((s) => [s.campaignId, s._sum]));
  return campaigns.map((c) => {
    const s = byId.get(c.externalId);
    const o = (c.utmCampaign && orders.get(c.utmCampaign)) || { orders: 0, revenue: 0 };
    return { ...c, impressions: s?.impressions ?? 0, clicks: s?.clicks ?? 0, cost: s?.cost ?? 0, conversions: s?.conversions ?? 0, orders: o.orders, revenue: o.revenue };
  });
}

export async function adsOverview(p: Period, rows: CampaignRow[]) {
  const prevFrom = new Date(p.from.getTime() - (p.to.getTime() - p.from.getTime()));
  const prev = await db.adStat.aggregate({ where: { provider: PROVIDER, date: { gte: prevFrom, lt: p.from } }, _sum: { cost: true, clicks: true } });
  const sum = (k: "impressions" | "clicks" | "cost" | "conversions" | "orders" | "revenue") => rows.reduce((s, r) => s + r[k], 0);
  const utms = rows.map((r) => r.utmCampaign).filter((u): u is string => !!u);
  const other = (await ordersByUtm(p, utms)).get("other") ?? { orders: 0, revenue: 0 };
  return { impressions: sum("impressions"), clicks: sum("clicks"), cost: sum("cost"), conversions: sum("conversions"), orders: sum("orders") + other.orders, revenue: sum("revenue") + other.revenue, prevCost: prev._sum.cost ?? 0, prevClicks: prev._sum.clicks ?? 0 };
}

/** Расход и заказы по дням за период (для графика). */
export async function adsByDay(p: Period, utms: string[]) {
  const [stats, orders] = await Promise.all([
    db.adStat.groupBy({ by: ["date"], where: { provider: PROVIDER, date: { gte: p.from, lt: p.to } }, _sum: { cost: true, clicks: true } }),
    db.order.findMany({ where: { createdAt: { gte: p.from, lt: p.to }, status: { in: [...PAID_STATUSES] }, session: { OR: [{ campaign: { in: utms } }, { source: "yandex", medium: { in: ["cpc", "ppc", "paid"] } }] } }, select: { createdAt: true } }),
  ]);
  const cost = new Map(stats.map((s) => [toDay(s.date), { cost: s._sum.cost ?? 0, clicks: s._sum.clicks ?? 0 }]));
  const byDay = new Map<string, number>();
  for (const o of orders) {
    // день заказа по Москве, как и статистика Директа
    const d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(o.createdAt);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const out: { label: string; day: string; cost: number; clicks: number; orders: number }[] = [];
  for (let t = p.from.getTime(); t < p.to.getTime(); t += 86_400_000) {
    const day = toDay(new Date(t));
    const c = cost.get(day);
    out.push({ day, label: `${day.slice(8, 10)}.${day.slice(5, 7)}`, cost: c?.cost ?? 0, clicks: c?.clicks ?? 0, orders: byDay.get(day) ?? 0 });
  }
  return out;
}
