import "server-only";
import { db } from "@/lib/db";

const PAID = ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] as const;

export async function kpis(from: Date, to = new Date()) {
  const [orders, newCustomers, returns] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: from, lt: to }, status: { in: [...PAID, "RETURNED"] } }, select: { total: true, userId: true, status: true, items: { select: { price: true, returnedQty: true } } } }),
    db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: from, lt: to } } }),
    db.ledgerEntry.aggregate({ where: { type: "REFUND", date: { gte: from, lt: to } }, _sum: { amount: true } }),
  ]);
  const revenue = orders.reduce((s, o) => s + o.total, 0) - (returns._sum.amount ?? 0);
  const count = orders.length;
  const buyers = new Set(orders.map((o) => o.userId).filter(Boolean)).size;
  return { revenue, count, aov: count ? Math.round(orders.reduce((s, o) => s + o.total, 0) / count) : 0, buyers, newCustomers, refunds: returns._sum.amount ?? 0 };
}

export async function revenueByMonth(months = 12) {
  const rows = await db.$queryRaw<{ m: Date; revenue: bigint; orders: bigint }[]>`
    SELECT date_trunc('month', "createdAt") AS m, sum(total)::bigint AS revenue, count(*)::bigint AS orders
    FROM "Order"
    WHERE status IN ('PAID','CONFIRMED','PACKING','SHIPPED','DELIVERED','COMPLETED','RETURNED')
      AND "createdAt" >= date_trunc('month', now()) - make_interval(months => ${months - 1})
    GROUP BY 1 ORDER BY 1`;
  const map = new Map(rows.map((r) => [r.m.toISOString().slice(0, 7), { revenue: Number(r.revenue), orders: Number(r.orders) }]));
  const out: { key: string; label: string; revenue: number; orders: number }[] = [];
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (months - 1));
  for (let i = 0; i < months; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""), ...(map.get(key) ?? { revenue: 0, orders: 0 }) });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export async function topProducts(from: Date, limit = 6) {
  const rows = await db.$queryRaw<{ name: string; qty: bigint; revenue: bigint }[]>`
    SELECT i."productName" AS name, sum(i.quantity - i."returnedQty")::bigint AS qty, sum((i.quantity - i."returnedQty") * i.price)::bigint AS revenue
    FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
    WHERE o.status IN ('PAID','CONFIRMED','PACKING','SHIPPED','DELIVERED','COMPLETED') AND o."createdAt" >= ${from}
    GROUP BY 1 ORDER BY revenue DESC LIMIT ${limit}`;
  return rows.map((r) => ({ name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) }));
}

export async function repeatRate() {
  const rows = await db.$queryRaw<{ buyers: bigint; repeaters: bigint }[]>`
    SELECT count(*)::bigint AS buyers, count(*) FILTER (WHERE n > 1)::bigint AS repeaters FROM (
      SELECT "userId", count(*) AS n FROM "Order"
      WHERE "userId" IS NOT NULL AND status IN ('PAID','CONFIRMED','PACKING','SHIPPED','DELIVERED','COMPLETED')
      GROUP BY 1) t`;
  const r = rows[0];
  const buyers = Number(r?.buyers ?? 0);
  return { buyers, repeaters: Number(r?.repeaters ?? 0), rate: buyers ? Math.round((Number(r.repeaters) / buyers) * 100) : 0 };
}

/** Данные для RFM по всем клиентам. */
export async function customerStats() {
  const rows = await db.$queryRaw<{ id: string; last: Date | null; n: bigint }[]>`
    SELECT u.id, max(o."createdAt") AS last, count(o.id)::bigint AS n
    FROM "User" u LEFT JOIN "Order" o ON o."userId" = u.id AND o.status IN ('PAID','CONFIRMED','PACKING','SHIPPED','DELIVERED','COMPLETED')
    WHERE u.role = 'CUSTOMER' GROUP BY u.id`;
  return new Map(rows.map((r) => [r.id, { lastOrderAt: r.last, ordersCount: Number(r.n) }]));
}
