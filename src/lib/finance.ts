import "server-only";
import { db } from "@/lib/db";
import type { LedgerType } from "@/generated/prisma/enums";

export type PnlRow = {
  key: string;
  label: string;
  sales: number;
  otherIncome: number;
  refunds: number;
  netRevenue: number;
  cogs: number;
  gross: number;
  grossPct: number;
  acquiring: number;
  shipping: number;
  marketing: number;
  production: number;
  salary: number;
  rent: number;
  other: number;
  opex: number;
  operating: number;
  operatingPct: number;
};

export async function pnlByMonth(months = 12): Promise<PnlRow[]> {
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  from.setMonth(from.getMonth() - (months - 1));
  const rows = await db.$queryRaw<{ m: Date; type: LedgerType; amount: bigint }[]>`
    SELECT date_trunc('month', date) AS m, type, sum(amount)::bigint AS amount FROM "LedgerEntry"
    WHERE date >= ${from} GROUP BY 1, 2`;
  const map = new Map<string, Partial<Record<LedgerType, number>>>();
  for (const r of rows) {
    const k = r.m.toISOString().slice(0, 7);
    const e = map.get(k) ?? {};
    e[r.type] = Number(r.amount);
    map.set(k, e);
  }
  const out: PnlRow[] = [];
  const d = new Date(from);
  for (let i = 0; i < months; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const e = map.get(key) ?? {};
    const g = (t: LedgerType) => e[t] ?? 0;
    const netRevenue = g("INCOME_SALE") + g("INCOME_OTHER") - g("REFUND");
    const gross = netRevenue - g("EXPENSE_COGS");
    const opex = g("EXPENSE_ACQUIRING") + g("EXPENSE_SHIPPING") + g("EXPENSE_MARKETING") + g("EXPENSE_PRODUCTION") + g("EXPENSE_SALARY") + g("EXPENSE_RENT") + g("EXPENSE_OTHER");
    out.push({
      key,
      label: d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }).replace(" г.", ""),
      sales: g("INCOME_SALE"),
      otherIncome: g("INCOME_OTHER"),
      refunds: g("REFUND"),
      netRevenue,
      cogs: g("EXPENSE_COGS"),
      gross,
      grossPct: netRevenue ? Math.round((gross / netRevenue) * 100) : 0,
      acquiring: g("EXPENSE_ACQUIRING"),
      shipping: g("EXPENSE_SHIPPING"),
      marketing: g("EXPENSE_MARKETING"),
      production: g("EXPENSE_PRODUCTION"),
      salary: g("EXPENSE_SALARY"),
      rent: g("EXPENSE_RENT"),
      other: g("EXPENSE_OTHER"),
      opex,
      operating: gross - opex,
      operatingPct: netRevenue ? Math.round(((gross - opex) / netRevenue) * 100) : 0,
    });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export function sumRows(rows: PnlRow[]): PnlRow {
  const keys = ["sales", "otherIncome", "refunds", "netRevenue", "cogs", "gross", "acquiring", "shipping", "marketing", "production", "salary", "rent", "other", "opex", "operating"] as const;
  const t = { key: "total", label: "Итого", grossPct: 0, operatingPct: 0 } as PnlRow;
  for (const k of keys) t[k] = rows.reduce((s, r) => s + r[k], 0);
  t.grossPct = t.netRevenue ? Math.round((t.gross / t.netRevenue) * 100) : 0;
  t.operatingPct = t.netRevenue ? Math.round((t.operating / t.netRevenue) * 100) : 0;
  return t;
}

/** Юнит-экономика за период. */
export async function unitEconomics(from: Date) {
  const [orders, newBuyers, marketing, ltv] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: from }, status: { in: ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] } }, select: { total: true, deliveryCost: true, items: { select: { quantity: true, returnedQty: true, costPrice: true, price: true } } } }),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM (
        SELECT "userId", min("createdAt") AS first FROM "Order"
        WHERE "userId" IS NOT NULL AND status IN ('PAID','CONFIRMED','PACKING','SHIPPED','DELIVERED','COMPLETED') GROUP BY 1
      ) t WHERE first >= ${from}`,
    db.ledgerEntry.aggregate({ where: { type: "EXPENSE_MARKETING", date: { gte: from } }, _sum: { amount: true } }),
    db.user.aggregate({ where: { role: "CUSTOMER", lifetimeSpent: { gt: 0 } }, _avg: { lifetimeSpent: true } }),
  ]);
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const items = orders.flatMap((o) => o.items);
  const units = items.reduce((s, i) => s + i.quantity, 0);
  const returned = items.reduce((s, i) => s + i.returnedQty, 0);
  const cogs = items.reduce((s, i) => s + (i.costPrice ?? 0) * (i.quantity - i.returnedQty), 0);
  const nb = Number(newBuyers[0]?.n ?? 0);
  const mkt = marketing._sum.amount ?? 0;
  return {
    orders: orders.length,
    aov: orders.length ? Math.round(revenue / orders.length) : 0,
    upt: orders.length ? Math.round((units / orders.length) * 10) / 10 : 0,
    returnRate: units ? Math.round((returned / units) * 100) : 0,
    grossPerOrder: orders.length ? Math.round((revenue - cogs) / orders.length) : 0,
    newBuyers: nb,
    cac: nb ? Math.round(mkt / nb) : 0,
    ltv: Math.round(ltv._avg.lifetimeSpent ?? 0),
  };
}

export async function paymentMix(from: Date) {
  const rows = await db.payment.groupBy({ by: ["method"], where: { createdAt: { gte: from }, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } }, _sum: { amount: true }, _count: true });
  return rows.map((r) => ({ method: r.method, amount: r._sum.amount ?? 0, count: r._count }));
}

export async function balanceSheetLite() {
  const [inv, points, receivables] = await Promise.all([
    db.$queryRaw<{ cost: bigint; retail: bigint }[]>`
      SELECT coalesce(sum(v.stock * coalesce(p."costPrice", 0)), 0)::bigint AS cost, coalesce(sum(v.stock * coalesce(v.price, p.price)), 0)::bigint AS retail
      FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"`,
    db.user.aggregate({ where: { role: "CUSTOMER" }, _sum: { pointsBalance: true } }),
    db.order.aggregate({ where: { status: "NEW" }, _sum: { total: true }, _count: true }),
  ]);
  return {
    inventoryCost: Number(inv[0]?.cost ?? 0),
    inventoryRetail: Number(inv[0]?.retail ?? 0),
    pointsLiability: (points._sum.pointsBalance ?? 0) * 100,
    unpaidOrders: receivables._sum.total ?? 0,
    unpaidCount: receivables._count,
  };
}
