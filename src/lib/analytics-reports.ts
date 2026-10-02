import "server-only";
import { db } from "@/lib/db";
import type { TrafficChannel } from "@/generated/prisma/enums";

const PAID_STATUSES = ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] as const;

export type Period = { from: Date; to: Date };

export async function overview(p: Period) {
  const [visits, visitors, pageviews, orders, prev] = await Promise.all([
    db.visitorSession.count({ where: { startedAt: { gte: p.from, lt: p.to } } }),
    db.visitorSession.findMany({ where: { startedAt: { gte: p.from, lt: p.to } }, distinct: ["visitorId"], select: { visitorId: true } }).then((r) => r.length),
    db.analyticsEvent.count({ where: { createdAt: { gte: p.from, lt: p.to }, type: { in: ["PAGEVIEW", "PRODUCT_VIEW", "CHECKOUT_START"] } } }),
    db.order.aggregate({ where: { createdAt: { gte: p.from, lt: p.to }, sessionId: { not: null }, status: { in: [...PAID_STATUSES] } }, _count: true, _sum: { total: true } }),
    db.visitorSession.count({ where: { startedAt: { gte: new Date(p.from.getTime() - (p.to.getTime() - p.from.getTime())), lt: p.from } } }),
  ]);
  const revenue = orders._sum.total ?? 0;
  return { visits, visitors, pageviews, orders: orders._count, revenue, conversion: visits ? Math.round((orders._count / visits) * 1000) / 10 : 0, revenuePerVisit: visits ? Math.round(revenue / visits) : 0, prevVisits: prev };
}

export async function byDay(p: Period) {
  const rows = await db.$queryRaw<{ d: Date; visits: bigint; orders: bigint }[]>`
    SELECT d::date AS d,
      (SELECT count(*) FROM "VisitorSession" s WHERE s."startedAt" >= d AND s."startedAt" < d + interval '1 day')::bigint AS visits,
      (SELECT count(*) FROM "Order" o WHERE o."sessionId" IS NOT NULL AND o."createdAt" >= d AND o."createdAt" < d + interval '1 day'
         AND o.status IN ('PAID','CONFIRMED','PACKING','SHIPPED','DELIVERED','COMPLETED'))::bigint AS orders
    FROM generate_series(${p.from}::date, (${p.to}::date - interval '1 day'), interval '1 day') d ORDER BY d`;
  return rows.map((r) => ({ label: r.d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }), visits: Number(r.visits), orders: Number(r.orders) }));
}

export type Dim = "channel" | "source" | "campaign" | "landingPath" | "referrerHost" | "device" | "trackingLinkId";

export async function breakdown(p: Period, dim: Dim, limit = 15) {
  const sessions = await db.visitorSession.findMany({
    where: { startedAt: { gte: p.from, lt: p.to } },
    select: { id: true, channel: true, source: true, campaign: true, medium: true, landingPath: true, referrerHost: true, device: true, trackingLinkId: true, pageviews: true, userId: true, orders: { where: { status: { in: [...PAID_STATUSES] } }, select: { total: true } }, events: { where: { type: "REGISTER" }, select: { id: true } } },
  });
  const map = new Map<string, { key: string; visits: number; pageviews: number; bounces: number; registrations: number; orders: number; revenue: number }>();
  for (const s of sessions) {
    let key: string;
    if (dim === "source") key = s.source ? `${s.source}${s.medium ? ` / ${s.medium}` : ""}` : s.channel === "DIRECT" ? "(прямой заход)" : s.referrerHost ?? "(не определён)";
    else if (dim === "campaign") key = s.campaign ?? "(без кампании)";
    else key = (s[dim] as string | null) ?? "(нет)";
    const e = map.get(key) ?? { key, visits: 0, pageviews: 0, bounces: 0, registrations: 0, orders: 0, revenue: 0 };
    e.visits++;
    e.pageviews += s.pageviews;
    if (s.pageviews <= 1) e.bounces++;
    e.registrations += s.events.length;
    e.orders += s.orders.length;
    e.revenue += s.orders.reduce((a, o) => a + o.total, 0);
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.visits - a.visits).slice(0, limit);
}

export async function funnel(p: Period) {
  const rows = await db.$queryRaw<{ type: string; n: bigint }[]>`
    SELECT type::text, count(DISTINCT "sessionId")::bigint AS n FROM "AnalyticsEvent"
    WHERE "createdAt" >= ${p.from} AND "createdAt" < ${p.to} GROUP BY 1`;
  const g = (t: string) => Number(rows.find((r) => r.type === t)?.n ?? 0);
  const visits = await db.visitorSession.count({ where: { startedAt: { gte: p.from, lt: p.to } } });
  return [
    { label: "Визиты", value: visits },
    { label: "Смотрели товар", value: g("PRODUCT_VIEW") },
    { label: "Добавили в корзину", value: g("ADD_TO_CART") },
    { label: "Начали оформление", value: g("CHECKOUT_START") },
    { label: "Оформили заказ", value: g("ORDER") },
  ];
}

export async function productInterest(p: Period, limit = 10) {
  const rows = await db.$queryRaw<{ productId: string; name: string; views: bigint; carts: bigint; wish: bigint; wait: bigint }[]>`
    SELECT e."productId", pr.name,
      count(*) FILTER (WHERE e.type = 'PRODUCT_VIEW')::bigint AS views,
      count(*) FILTER (WHERE e.type = 'ADD_TO_CART')::bigint AS carts,
      count(*) FILTER (WHERE e.type = 'WISHLIST')::bigint AS wish,
      count(*) FILTER (WHERE e.type = 'WAITLIST')::bigint AS wait
    FROM "AnalyticsEvent" e JOIN "Product" pr ON pr.id = e."productId"
    WHERE e."createdAt" >= ${p.from} AND e."createdAt" < ${p.to} AND e."productId" IS NOT NULL
    GROUP BY 1, 2 ORDER BY views DESC LIMIT ${limit}`;
  return rows.map((r) => ({ productId: r.productId, name: r.name, views: Number(r.views), carts: Number(r.carts), wish: Number(r.wish), wait: Number(r.wait) }));
}

/** Первое касание: откуда пришли клиенты, которые потом купили. */
export async function firstTouch() {
  const rows = await db.user.groupBy({ by: ["firstChannel"], where: { role: "CUSTOMER", firstChannel: { not: null } }, _count: true, _sum: { lifetimeSpent: true } });
  return rows.map((r) => ({ channel: r.firstChannel as TrafficChannel, customers: r._count, revenue: r._sum.lifetimeSpent ?? 0 })).sort((a, b) => b.revenue - a.revenue);
}

export async function trackingLinks(p: Period) {
  const links = await db.trackingLink.findMany({ orderBy: { createdAt: "desc" }, include: { sessions: { where: { startedAt: { gte: p.from, lt: p.to } }, select: { id: true, orders: { where: { status: { in: [...PAID_STATUSES] } }, select: { total: true } } } } } });
  return links.map((l) => ({ ...l, visits: l.sessions.length, orders: l.sessions.reduce((a, s) => a + s.orders.length, 0), revenue: l.sessions.reduce((a, s) => a + s.orders.reduce((x, o) => x + o.total, 0), 0) }));
}
