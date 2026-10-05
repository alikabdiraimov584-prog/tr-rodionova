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
  services: number;
  tax: number;
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
    const cogs = g("EXPENSE_COGS") - g("COGS_REVERSAL");
    const gross = netRevenue - cogs;
    const opex = g("EXPENSE_ACQUIRING") + g("EXPENSE_SHIPPING") + g("EXPENSE_MARKETING") + g("EXPENSE_PRODUCTION") + g("EXPENSE_SALARY") + g("EXPENSE_RENT") + g("EXPENSE_SERVICES") + g("EXPENSE_TAX") + g("EXPENSE_OTHER");
    out.push({
      key,
      label: d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }).replace(" г.", ""),
      sales: g("INCOME_SALE"),
      otherIncome: g("INCOME_OTHER"),
      refunds: g("REFUND"),
      netRevenue,
      cogs,
      gross,
      grossPct: netRevenue ? Math.round((gross / netRevenue) * 100) : 0,
      acquiring: g("EXPENSE_ACQUIRING"),
      shipping: g("EXPENSE_SHIPPING"),
      marketing: g("EXPENSE_MARKETING"),
      production: g("EXPENSE_PRODUCTION"),
      salary: g("EXPENSE_SALARY"),
      rent: g("EXPENSE_RENT"),
      other: g("EXPENSE_OTHER"),
      services: g("EXPENSE_SERVICES"),
      tax: g("EXPENSE_TAX"),
      opex,
      operating: gross - opex,
      operatingPct: netRevenue ? Math.round(((gross - opex) / netRevenue) * 100) : 0,
    });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export function sumRows(rows: PnlRow[]): PnlRow {
  const keys = ["sales", "otherIncome", "refunds", "netRevenue", "cogs", "gross", "acquiring", "shipping", "marketing", "production", "salary", "rent", "services", "tax", "other", "opex", "operating"] as const;
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

// ───────────── ДДС: движение денег по месяцам ─────────────

/** Статьи, не являющиеся движением денег: себестоимость списывается при продаже, деньги за ткани и пошив идут через «Производство». */
const NON_CASH: LedgerType[] = ["EXPENSE_COGS", "COGS_REVERSAL"];
const OWNER_FLOWS: LedgerType[] = ["OWNER_WITHDRAWAL", "OWNER_CONTRIBUTION"];

export type CashRow = {
  key: string;
  label: string;
  inSales: number; // оплаты заказов
  inOther: number; // прочие поступления
  outRefunds: number;
  outProduction: number;
  outMarketing: number;
  outShipping: number;
  outSalary: number;
  outRent: number;
  outServices: number;
  outTax: number;
  outAcquiring: number;
  outOther: number;
  inflow: number;
  outflow: number;
  operating: number; // чистый поток от операций
  ownerIn: number;
  ownerOut: number;
  net: number; // с учётом взносов и выводов
  balance: number; // остаток на конец месяца от начального остатка
};

export function monthRange(months: number) {
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  from.setMonth(from.getMonth() - (months - 1));
  return from;
}

export async function cashFlowByMonth(months: number, opening: { openingBalance: number; openingDate: string }) {
  const from = monthRange(months);
  const openingAt = opening.openingDate ? new Date(opening.openingDate) : null;
  const rows = await db.$queryRaw<{ m: Date; type: LedgerType; amount: bigint }[]>`
    SELECT date_trunc('month', date) AS m, type, sum(amount)::bigint AS amount FROM "LedgerEntry"
    WHERE date >= ${from} GROUP BY 1, 2`;
  // остаток к началу периода: начальный остаток + все денежные проводки от даты начала учёта до начала периода
  let balance = opening.openingBalance;
  if (openingAt) {
    const before = await db.$queryRaw<{ type: LedgerType; amount: bigint }[]>`
      SELECT type, sum(amount)::bigint AS amount FROM "LedgerEntry" WHERE date >= ${openingAt} AND date < ${from} GROUP BY 1`;
    for (const r of before) if (!NON_CASH.includes(r.type)) balance += Number(r.amount) * (r.type.startsWith("INCOME") || r.type === "OWNER_CONTRIBUTION" ? 1 : -1);
  }
  const map = new Map<string, Partial<Record<LedgerType, number>>>();
  for (const r of rows) {
    const k = r.m.toISOString().slice(0, 7);
    const e = map.get(k) ?? {};
    e[r.type] = Number(r.amount);
    map.set(k, e);
  }
  const out: CashRow[] = [];
  const d = new Date(from);
  for (let i = 0; i < months; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const e = map.get(key) ?? {};
    const g = (t: LedgerType) => e[t] ?? 0;
    const row: CashRow = {
      key,
      label: d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }).replace(" г.", ""),
      inSales: g("INCOME_SALE"),
      inOther: g("INCOME_OTHER"),
      outRefunds: g("REFUND"),
      outProduction: g("EXPENSE_PRODUCTION"),
      outMarketing: g("EXPENSE_MARKETING"),
      outShipping: g("EXPENSE_SHIPPING"),
      outSalary: g("EXPENSE_SALARY"),
      outRent: g("EXPENSE_RENT"),
      outServices: g("EXPENSE_SERVICES"),
      outTax: g("EXPENSE_TAX"),
      outAcquiring: g("EXPENSE_ACQUIRING"),
      outOther: g("EXPENSE_OTHER"),
      inflow: 0,
      outflow: 0,
      operating: 0,
      ownerIn: g("OWNER_CONTRIBUTION"),
      ownerOut: g("OWNER_WITHDRAWAL"),
      net: 0,
      balance: 0,
    };
    row.inflow = row.inSales + row.inOther;
    row.outflow = row.outRefunds + row.outProduction + row.outMarketing + row.outShipping + row.outSalary + row.outRent + row.outServices + row.outTax + row.outAcquiring + row.outOther;
    row.operating = row.inflow - row.outflow;
    row.net = row.operating + row.ownerIn - row.ownerOut;
    // до даты начала учёта остаток не считается: показываем только с неё
    const counted = !openingAt || new Date(key + "-01") >= new Date(openingAt.getFullYear(), openingAt.getMonth(), 1);
    balance = counted ? balance + row.net : balance;
    row.balance = counted ? balance : NaN;
    out.push(row);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export function sumCash(rows: CashRow[]): CashRow {
  const keys = ["inSales", "inOther", "outRefunds", "outProduction", "outMarketing", "outShipping", "outSalary", "outRent", "outServices", "outTax", "outAcquiring", "outOther", "inflow", "outflow", "operating", "ownerIn", "ownerOut", "net"] as const;
  const t = { key: "total", label: "Итого", balance: NaN } as CashRow;
  for (const k of keys) t[k] = rows.reduce((s, r) => s + r[k], 0);
  const last = [...rows].reverse().find((r) => !Number.isNaN(r.balance));
  t.balance = last ? last.balance : NaN;
  return t;
}

/** Расходы за период по статьям и категориям (что ввели вручную плюс эквайринг и доставка по заказам). */
export async function expenseBreakdown(from: Date, to: Date) {
  const rows = await db.ledgerEntry.groupBy({
    by: ["type", "category"],
    where: { date: { gte: from, lt: to }, type: { notIn: ["INCOME_SALE", "INCOME_OTHER", "REFUND", "COGS_REVERSAL", ...OWNER_FLOWS] } },
    _sum: { amount: true },
    _count: true,
  });
  return rows
    .map((r) => ({ type: r.type, category: r.category ?? "", amount: r._sum.amount ?? 0, count: r._count }))
    .sort((a, b) => b.amount - a.amount);
}

/** Подсказки для формы: категории и контрагенты, которые уже вводили. */
export async function ledgerSuggestions() {
  const [cats, parties] = await Promise.all([
    db.ledgerEntry.findMany({ where: { category: { not: null }, orderId: null }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" }, take: 100 }),
    db.ledgerEntry.findMany({ where: { counterparty: { not: null } }, distinct: ["counterparty"], select: { counterparty: true }, orderBy: { counterparty: "asc" }, take: 100 }),
  ]);
  return { categories: cats.map((c) => c.category!).filter(Boolean), counterparties: parties.map((c) => c.counterparty!).filter(Boolean) };
}

// ───────────── Склад в деньгах ─────────────

export type StockMonth = { key: string; label: string; receiptQty: number; receiptCost: number; saleQty: number; saleCost: number; returnQty: number; returnCost: number; writeOffQty: number; writeOffCost: number; adjustQty: number; adjustCost: number };

/** Остатки по вещам (себестоимость и розница) и движение за период по месяцам в штуках и по себестоимости. */
export async function stockReport(months: number) {
  const from = monthRange(months);
  const [items, moves] = await Promise.all([
    db.product.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true, sku: true, price: true, costPrice: true, isPreloved: true, category: { select: { name: true } }, variants: { select: { size: true, stock: true, reserved: true, price: true } } },
      orderBy: { name: "asc" },
    }),
    db.$queryRaw<{ m: Date; type: string; qty: bigint; cost: bigint }[]>`
      SELECT date_trunc('month', sm."createdAt") AS m, sm.type::text AS type, sum(sm.quantity)::bigint AS qty,
             sum(sm.quantity * coalesce(sm."unitCost", p."costPrice", 0))::bigint AS cost
      FROM "StockMovement" sm JOIN "ProductVariant" v ON v.id = sm."variantId" JOIN "Product" p ON p.id = v."productId"
      WHERE sm."createdAt" >= ${from} AND sm.type IN ('RECEIPT','SALE','RETURN','WRITE_OFF','ADJUSTMENT') GROUP BY 1, 2`,
  ]);
  const products = items
    .map((p) => {
      const qty = p.variants.reduce((s, v) => s + v.stock, 0);
      const reserved = p.variants.reduce((s, v) => s + v.reserved, 0);
      const retail = p.variants.reduce((s, v) => s + v.stock * (v.price ?? p.price), 0);
      const cost = qty * (p.costPrice ?? 0);
      return { id: p.id, name: p.name, sku: p.sku, category: p.category?.name ?? "", isPreloved: p.isPreloved, qty, reserved, cost, retail, costPrice: p.costPrice, lowStock: p.variants.filter((v) => v.stock - v.reserved <= 1).map((v) => v.size) };
    })
    .filter((p) => p.qty > 0 || p.reserved > 0);
  const byMonth = new Map<string, StockMonth>();
  const d = new Date(from);
  for (let i = 0; i < months; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, { key, label: d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }).replace(" г.", ""), receiptQty: 0, receiptCost: 0, saleQty: 0, saleCost: 0, returnQty: 0, returnCost: 0, writeOffQty: 0, writeOffCost: 0, adjustQty: 0, adjustCost: 0 });
    d.setMonth(d.getMonth() + 1);
  }
  for (const r of moves) {
    const row = byMonth.get(r.m.toISOString().slice(0, 7));
    if (!row) continue;
    const qty = Number(r.qty);
    const cost = Number(r.cost);
    if (r.type === "RECEIPT") { row.receiptQty += qty; row.receiptCost += cost; }
    else if (r.type === "SALE") { row.saleQty += Math.abs(qty); row.saleCost += Math.abs(cost); }
    else if (r.type === "RETURN") { row.returnQty += qty; row.returnCost += cost; }
    else if (r.type === "WRITE_OFF") { row.writeOffQty += Math.abs(qty); row.writeOffCost += Math.abs(cost); }
    else if (r.type === "ADJUSTMENT") { row.adjustQty += qty; row.adjustCost += cost; }
  }
  const total = { qty: products.reduce((s, p) => s + p.qty, 0), cost: products.reduce((s, p) => s + p.cost, 0), retail: products.reduce((s, p) => s + p.retail, 0), withoutCost: products.filter((p) => p.costPrice == null).length };
  return { products, months: [...byMonth.values()], total };
}
