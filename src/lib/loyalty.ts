import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import type { Prisma } from "@/generated/prisma/client";
import type { PointsType } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

/** Начислить / списать баллы. amount > 0 — начисление, < 0 — списание. */
export async function addPoints(
  tx: Tx,
  userId: string,
  type: PointsType,
  amount: number,
  opts: { orderId?: string | null; comment?: string; createdBy?: string | null; expiresAt?: Date | null } = {},
) {
  if (!amount) return null;
  // Баланс меняем одним UPDATE с условием: при одновременных списаниях он не уйдёт в минус
  const updated = await tx.user.updateMany({
    where: { id: userId, ...(amount < 0 ? { pointsBalance: { gte: -amount } } : {}) },
    data: { pointsBalance: { increment: amount } },
  });
  if (updated.count === 0) {
    const exists = await tx.user.count({ where: { id: userId } });
    throw new Error(exists ? "Недостаточно баллов" : "Клиент не найден");
  }
  let expiresAt = opts.expiresAt;
  if (amount > 0 && expiresAt === undefined) {
    const s = await getSetting("loyalty");
    expiresAt = new Date(Date.now() + s.pointsExpireDays * 24 * 60 * 60 * 1000);
  }
  return tx.pointsTransaction.create({
    data: {
      userId,
      type,
      amount,
      orderId: opts.orderId ?? null,
      comment: opts.comment,
      createdBy: opts.createdBy ?? null,
      expiresAt: expiresAt ?? null,
    },
  });
}

/** Пересчитать уровень по сумме покупок за 12 месяцев и за всё время. */
export async function recalcTier(tx: Tx, userId: string) {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const countable = ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] as const;
  const orders = await tx.order.findMany({
    where: { userId, status: { in: [...countable] } },
    select: { total: true, deliveryCost: true, createdAt: true, items: { select: { price: true, returnedQty: true } } },
  });
  let lifetime = 0;
  let year = 0;
  for (const o of orders) {
    const returned = o.items.reduce((s, i) => s + i.price * i.returnedQty, 0);
    const paid = Math.max(0, o.total - o.deliveryCost - returned);
    lifetime += paid;
    if (o.createdAt >= since) year += paid;
  }
  const tiers = await tx.loyaltyTier.findMany({ orderBy: { threshold: "asc" } });
  const tier = [...tiers].reverse().find((t) => year >= t.threshold) ?? tiers[0];
  await tx.user.update({
    where: { id: userId },
    data: { lifetimeSpent: lifetime, yearSpent: year, loyaltyTierId: tier?.id ?? null },
  });
  return tier;
}

/** Сколько баллов максимально можно списать на заказ с данной суммой (после скидок). */
export async function maxPointsForOrder(userId: string, payableKopecks: number) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { loyaltyTier: true } });
  const s = await getSetting("loyalty");
  const maxPct = user.loyaltyTier?.maxPayPct ?? 20;
  const byPct = Math.floor((payableKopecks * maxPct) / 100 / s.pointValueKopecks);
  return Math.max(0, Math.min(user.pointsBalance, byPct));
}

/** Расчётная база начисления: оплаченная деньгами часть без доставки, за вычетом возвращённых позиций. */
export function earnBase(order: { total: number; deliveryCost: number; subtotal: number }, returnedValue: number) {
  const paidGoods = Math.max(0, order.total - order.deliveryCost);
  if (!order.subtotal) return paidGoods;
  const keptShare = Math.max(0, 1 - returnedValue / order.subtotal);
  return Math.floor(paidGoods * keptShare);
}

/**
 * Начисление за завершённый заказ (через 14 дней после доставки, как у 12 STOREEZ и Charuel).
 * Так баллы не приходится отзывать при возврате.
 */
export async function earnForOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true, user: { include: { loyaltyTier: true } } },
  });
  if (!order.user || order.pointsEarned > 0) return 0;
  const s = await getSetting("loyalty");
  const pct = order.user.loyaltyTier?.cashbackPct ?? 3;
  const returned = order.items.reduce((sum, i) => sum + i.price * i.returnedQty, 0);
  const points = Math.floor((earnBase(order, returned) * pct) / 100 / s.pointValueKopecks);
  if (points > 0) {
    await addPoints(tx, order.user.id, "EARN_PURCHASE", points, {
      orderId,
      comment: `Заказ №${order.number}: ${pct}% баллами`,
    });
    await tx.order.update({ where: { id: orderId }, data: { pointsEarned: points } });
  }
  return points;
}

/** Баллы, которые будут начислены по ещё не завершённым заказам клиента. */
export async function pendingPoints(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { loyaltyTier: true } });
  const s = await getSetting("loyalty");
  const pct = user.loyaltyTier?.cashbackPct ?? 3;
  const orders = await db.order.findMany({
    where: { userId, pointsEarned: 0, status: { in: ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED"] } },
    include: { items: true },
  });
  return orders.reduce((sum, o) => {
    const returned = o.items.reduce((r, i) => r + i.price * i.returnedQty, 0);
    return sum + Math.floor((earnBase(o, returned) * pct) / 100 / s.pointValueKopecks);
  }, 0);
}

/** Отмена начисленных баллов и возврат списанных при отмене/возврате заказа. */
export async function revertOrderPoints(tx: Tx, orderId: string, createdBy?: string | null) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!order.userId) return;
  if (order.pointsEarned > 0) {
    // часть начисления могла быть отозвана раньше при частичных возвратах
    const reverted = await tx.pointsTransaction.aggregate({ where: { orderId, type: "REVERT" }, _sum: { amount: true } });
    const left = order.pointsEarned + (reverted._sum.amount ?? 0);
    const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
    const revert = -Math.max(0, Math.min(left, user.pointsBalance));
    if (revert) {
      await addPoints(tx, order.userId, "REVERT", revert, {
        orderId,
        comment: `Отмена начисления по заказу №${order.number}`,
        createdBy,
        expiresAt: null,
      });
    }
  }
  if (order.pointsUsed > 0) {
    const already = await tx.pointsTransaction.aggregate({ where: { orderId, type: "EARN_MANUAL", comment: { startsWith: "Возврат баллов" } }, _sum: { amount: true } });
    const left = order.pointsUsed - (already._sum.amount ?? 0);
    if (left > 0) {
      await addPoints(tx, order.userId, "EARN_MANUAL", left, {
        orderId,
        comment: `Возврат баллов по заказу №${order.number}`,
        createdBy,
      });
    }
  }
}

/** Реферальный бонус пригласившей после первого завершённого заказа приглашённой. */
export async function grantReferralBonus(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { user: true } });
  const u = order.user;
  if (!u?.referredById) return;
  const completedBefore = await tx.order.count({
    where: { userId: u.id, id: { not: orderId }, status: "COMPLETED" },
  });
  if (completedBefore > 0) return;
  const granted = await tx.pointsTransaction.findFirst({
    where: { userId: u.referredById, type: "EARN_REFERRAL", comment: { contains: u.id } },
  });
  if (granted) return;
  const s = await getSetting("loyalty");
  await addPoints(tx, u.referredById, "EARN_REFERRAL", s.referralPoints, {
    comment: `Приглашённая ${u.firstName} сделала первую покупку (${u.id})`,
  });
}

/**
 * Сжечь просроченные баллы по принципу FIFO: списания (покупки, отмены, прошлые сгорания)
 * сначала гасят начисления с ближайшим сроком действия, сгорает только неизрасходованный остаток.
 * Идемпотентно: повторный запуск ничего не спишет повторно.
 */
export async function expirePoints(tx: Tx, now = new Date()) {
  const users = await tx.pointsTransaction.findMany({
    where: { amount: { gt: 0 }, expiresAt: { lt: now } },
    distinct: ["userId"],
    select: { userId: true },
  });
  if (users.length === 0) return 0;
  // история баллов и балансы всех затронутых клиенток — двумя запросами, а не по два на каждую
  const ids = users.map((u) => u.userId);
  const history = await tx.pointsTransaction.findMany({ where: { userId: { in: ids } }, orderBy: { createdAt: "asc" } });
  const byUser = new Map<string, typeof history>();
  for (const t of history) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t]);
  const balances = new Map((await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, pointsBalance: true } })).map((u) => [u.id, u.pointsBalance]));
  let n = 0;
  for (const { userId } of users) {
    const all = byUser.get(userId) ?? [];
    const batches = all
      .filter((t) => t.amount > 0)
      .map((t) => ({ expiresAt: t.expiresAt, left: t.amount }))
      .sort((x, y) => (x.expiresAt?.getTime() ?? Infinity) - (y.expiresAt?.getTime() ?? Infinity));
    let spent = -all.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    for (const b of batches) {
      const take = Math.min(b.left, spent);
      b.left -= take;
      spent -= take;
      if (spent <= 0) break;
    }
    const burn = batches.filter((b) => b.expiresAt && b.expiresAt < now).reduce((s, b) => s + b.left, 0);
    const amount = Math.min(burn, balances.get(userId) ?? 0);
    if (amount > 0) {
      await addPoints(tx, userId, "EXPIRE", -amount, { comment: "Срок действия баллов истёк", expiresAt: null });
      n++;
    }
  }
  return n;
}

export function tierProgress(
  yearSpent: number,
  tiers: { code: string; name: string; threshold: number }[],
  currentCode?: string,
) {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  const idx = Math.max(0, sorted.findIndex((t) => t.code === currentCode));
  const next = sorted[idx + 1] ?? null;
  const cur = sorted[idx] ?? sorted[0];
  const span = next ? next.threshold - cur.threshold : 1;
  const progress = next ? Math.min(100, Math.round(((yearSpent - cur.threshold) / span) * 100)) : 100;
  return { current: cur, next, progress, remaining: next ? Math.max(0, next.threshold - yearSpent) : 0 };
}
