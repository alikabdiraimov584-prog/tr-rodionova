import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
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

export const ANALYTICS_TIME_ZONE = "Europe/Moscow";
export const DAY_MS = 86_400_000;
const dayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: ANALYTICS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Дата дня в отчёте и адресе детализации по Москве. */
export function dayKey(d: Date) {
  return dayFormatter.format(d);
}

export function analyticsDayStart(day: string) {
  return new Date(`${day}T00:00:00+03:00`);
}

/** По дням: визиты, посетители, целевые действия (число визитов, где действие было), оплаченные заказы и выручка. */
export async function byDay(p: Period) {
  const rows = await db.$queryRaw<{ d: Date; visits: bigint; visitors: bigint; views: bigint; carts: bigint; checkouts: bigint; registers: bigint; orders: bigint; revenue: bigint | null }[]>`
    SELECT d,
      (SELECT count(*) FROM "VisitorSession" s WHERE s."startedAt" >= d AND s."startedAt" < d + interval '1 day')::bigint AS visits,
      (SELECT count(DISTINCT s."visitorId") FROM "VisitorSession" s WHERE s."startedAt" >= d AND s."startedAt" < d + interval '1 day')::bigint AS visitors,
      (SELECT count(DISTINCT e."sessionId") FROM "AnalyticsEvent" e WHERE e.type = 'PRODUCT_VIEW' AND e."createdAt" >= d AND e."createdAt" < d + interval '1 day')::bigint AS views,
      (SELECT count(DISTINCT e."sessionId") FROM "AnalyticsEvent" e WHERE e.type = 'ADD_TO_CART' AND e."createdAt" >= d AND e."createdAt" < d + interval '1 day')::bigint AS carts,
      (SELECT count(DISTINCT e."sessionId") FROM "AnalyticsEvent" e WHERE e.type = 'CHECKOUT_START' AND e."createdAt" >= d AND e."createdAt" < d + interval '1 day')::bigint AS checkouts,
      (SELECT count(DISTINCT e."sessionId") FROM "AnalyticsEvent" e WHERE e.type = 'REGISTER' AND e."createdAt" >= d AND e."createdAt" < d + interval '1 day')::bigint AS registers,
      (SELECT count(*) FROM "Order" o WHERE o."sessionId" IS NOT NULL AND o."createdAt" >= d AND o."createdAt" < d + interval '1 day'
         AND o.status IN ('PAID','CONFIRMED','PACKING','SHIPPED','DELIVERED','COMPLETED'))::bigint AS orders,
      (SELECT sum(o.total) FROM "Order" o WHERE o."sessionId" IS NOT NULL AND o."createdAt" >= d AND o."createdAt" < d + interval '1 day'
         AND o.status IN ('PAID','CONFIRMED','PACKING','SHIPPED','DELIVERED','COMPLETED'))::bigint AS revenue
    FROM generate_series(${p.from}::timestamp, (${p.to}::timestamp - interval '1 day'), interval '1 day') d ORDER BY d`;
  return rows.map((r) => ({
    date: dayKey(r.d),
    label: r.d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: ANALYTICS_TIME_ZONE }),
    visits: Number(r.visits),
    visitors: Number(r.visitors),
    views: Number(r.views),
    carts: Number(r.carts),
    checkouts: Number(r.checkouts),
    registers: Number(r.registers),
    orders: Number(r.orders),
    revenue: Number(r.revenue ?? 0),
  }));
}

/** Визиты одного дня с их действиями по порядку; goalsOnly — только визиты, где было что-то кроме просмотра страниц. */
export async function dayVisits(p: Period, opts: { goalsOnly: boolean; skip: number; take: number }) {
  const where = {
    startedAt: { gte: p.from, lt: p.to },
    ...(opts.goalsOnly ? { events: { some: { type: { not: "PAGEVIEW" as const } } } } : {}),
  };
  const [total, sessions] = await Promise.all([
    db.visitorSession.count({ where }),
    db.visitorSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: opts.skip,
      take: opts.take,
      select: {
        id: true, visitorId: true, startedAt: true, lastSeenAt: true, pageviews: true, landingPath: true, referrerHost: true,
        channel: true, source: true, medium: true, campaign: true, device: true, browser: true, os: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, path: true, productId: true, orderId: true, value: true, createdAt: true } },
      },
    }),
  ]);
  const productIds = [...new Set(sessions.flatMap((s) => s.events.map((e) => e.productId).filter((x): x is string => !!x)))];
  const orderIds = [...new Set(sessions.flatMap((s) => s.events.map((e) => e.orderId).filter((x): x is string => !!x)))];
  const [products, orders] = await Promise.all([
    productIds.length ? db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : [],
    orderIds.length ? db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true, total: true, status: true } }) : [],
  ]);
  return { total, sessions, products: new Map(products.map((x) => [x.id, x.name])), orders: new Map(orders.map((o) => [o.id, o])) };
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

type JournalReach = {
  dimension: "total" | "day" | "article" | "category" | "channel";
  key: string;
  views: number;
  visits: number;
  readers: number;
};

export async function journalAnalytics(p: { from: Date | null; to: Date }) {
  const [articles, reach, orders] = await Promise.all([
    db.article.findMany({
      where: { publishedAt: { lte: new Date() } },
      select: { slug: true, title: true, category: true, publishedAt: true },
      orderBy: [{ publishedAt: "desc" }, { slug: "asc" }],
    }),
    db.$queryRaw<JournalReach[]>`
      WITH hits AS (
        SELECT a.slug, COALESCE(NULLIF(a.category, ''), 'Без рубрики') AS category,
          s.id AS visit, s."visitorId", s.channel::text AS channel,
          to_char((e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${ANALYTICS_TIME_ZONE}, 'YYYY-MM-DD') AS day
        FROM "AnalyticsEvent" e
        JOIN "Article" a ON rtrim(split_part(split_part(e.path, '?', 1), '#', 1), '/') = '/journal/' || a.slug
        JOIN "VisitorSession" s ON s.id = e."sessionId"
        WHERE e.type = 'PAGEVIEW' AND e.path LIKE '/journal/%'
          AND e."createdAt" >= COALESCE(${p.from}::timestamp, '-infinity'::timestamp)
          AND e."createdAt" < ${p.to} AND e."createdAt" >= a."publishedAt"
      )
      SELECT CASE
          WHEN GROUPING(day) = 0 THEN 'day'
          WHEN GROUPING(slug) = 0 THEN 'article'
          WHEN GROUPING(category) = 0 THEN 'category'
          WHEN GROUPING(channel) = 0 THEN 'channel'
          ELSE 'total'
        END AS dimension,
        COALESCE(day, slug, category, channel, '') AS key,
        count(*)::int AS views, count(DISTINCT visit)::int AS visits, count(DISTINCT "visitorId")::int AS readers
      FROM hits
      GROUP BY GROUPING SETS ((), (day), (slug), (category), (channel))
    `,
    db.$queryRaw<{ orders: number; revenue: bigint }[]>`
      SELECT count(*)::int AS orders, COALESCE(sum(o.total), 0)::bigint AS revenue
      FROM "Order" o
      WHERE o."createdAt" >= COALESCE(${p.from}::timestamp, '-infinity'::timestamp)
        AND o."createdAt" < ${p.to}
        AND o.status IN (${Prisma.join(PAID_STATUSES.map((status) => Prisma.sql`${status}::"OrderStatus"`))})
        AND EXISTS (
          SELECT 1 FROM "AnalyticsEvent" e
          JOIN "Article" a ON rtrim(split_part(split_part(e.path, '?', 1), '#', 1), '/') = '/journal/' || a.slug
          WHERE e."sessionId" = o."sessionId" AND e.type = 'PAGEVIEW'
            AND e.path LIKE '/journal/%'
            AND e."createdAt" >= COALESCE(${p.from}::timestamp, '-infinity'::timestamp)
            AND e."createdAt" >= a."publishedAt" AND e."createdAt" <= o."createdAt"
        )
    `,
  ]);
  return { articles, reach, orders: orders[0].orders, revenue: Number(orders[0].revenue) };
}
