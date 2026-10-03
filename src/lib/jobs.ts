import "server-only";
import { db } from "@/lib/db";
import { addPoints, expirePoints } from "@/lib/loyalty";
import { setOrderStatus, RETURN_WINDOW_DAYS } from "@/lib/orders";
import { audit } from "@/lib/audit";
import { runDueCampaigns } from "@/lib/campaigns";
import { notifyExpiringPoints, notifyPoints } from "@/lib/notifications";
import { purgeRateLimits } from "@/lib/ratelimit";

/** Завершить заказы, у которых прошёл срок возврата. При завершении начисляются баллы. */
export async function completeDeliveredOrders(now = new Date()) {
  const border = new Date(now.getTime() - RETURN_WINDOW_DAYS * 86_400_000);
  const due = await db.order.findMany({ where: { status: "DELIVERED", deliveredAt: { lte: border } }, select: { id: true } });
  for (const o of due) {
    await setOrderStatus(o.id, "COMPLETED", { note: `Срок возврата ${RETURN_WINDOW_DAYS} дней истёк, баллы начислены` });
  }
  return due.length;
}

/** Подарочные баллы ко дню рождения (раз в год, по уровню). */
export async function grantBirthdayBonuses(now = new Date()) {
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User"
    WHERE role = 'CUSTOMER' AND birthday IS NOT NULL
      AND EXTRACT(MONTH FROM birthday) = ${month} AND EXTRACT(DAY FROM birthday) = ${day}`;
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  // кто уже получил подарок в этом году и уровни именинниц — по одному запросу на всех
  const granted = new Set((await db.pointsTransaction.findMany({ where: { userId: { in: ids }, type: "EARN_BIRTHDAY", createdAt: { gte: yearStart } }, select: { userId: true } })).map((t) => t.userId));
  const users = await db.user.findMany({ where: { id: { in: ids } }, include: { loyaltyTier: true } });
  let n = 0;
  for (const user of users) {
    if (granted.has(user.id)) continue;
    const bonus = user.loyaltyTier?.birthdayBonus ?? 0;
    if (bonus <= 0) continue;
    await db.$transaction(async (tx) => {
      // Подарочные баллы действуют 30 дней
      await addPoints(tx, user.id, "EARN_BIRTHDAY", bonus, {
        comment: `С днём рождения! Подарок уровня ${user.loyaltyTier?.name}`,
        expiresAt: new Date(now.getTime() + 30 * 86_400_000),
      });
    });
    await notifyPoints(user.id, "POINTS_BIRTHDAY", { points: bonus });
    n++;
  }
  return n;
}

/**
 * Пересчитать уровни всех клиентов (уровень зависит от покупок за скользящие 12 месяцев).
 * Заказы всех клиенток читаются одним запросом, обновляются только те, у кого что-то изменилось.
 */
export async function recalcAllTiers() {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const [users, orders, tiers] = await Promise.all([
    db.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true, lifetimeSpent: true, yearSpent: true, loyaltyTierId: true } }),
    db.order.findMany({
      where: { userId: { not: null }, status: { in: ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] } },
      select: { userId: true, total: true, deliveryCost: true, createdAt: true, items: { select: { price: true, returnedQty: true } } },
    }),
    db.loyaltyTier.findMany({ orderBy: { threshold: "asc" } }),
  ]);
  const spent = new Map<string, { lifetime: number; year: number }>();
  for (const o of orders) {
    const returned = o.items.reduce((s, i) => s + i.price * i.returnedQty, 0);
    const paid = Math.max(0, o.total - o.deliveryCost - returned);
    const acc = spent.get(o.userId!) ?? { lifetime: 0, year: 0 };
    acc.lifetime += paid;
    if (o.createdAt >= since) acc.year += paid;
    spent.set(o.userId!, acc);
  }
  const updates = [];
  for (const u of users) {
    const s = spent.get(u.id) ?? { lifetime: 0, year: 0 };
    const tier = [...tiers].reverse().find((t) => s.year >= t.threshold) ?? tiers[0];
    const tierId = tier?.id ?? null;
    if (u.lifetimeSpent === s.lifetime && u.yearSpent === s.year && u.loyaltyTierId === tierId) continue;
    updates.push(db.user.update({ where: { id: u.id }, data: { lifetimeSpent: s.lifetime, yearSpent: s.year, loyaltyTierId: tierId } }));
  }
  for (let i = 0; i < updates.length; i += 200) await db.$transaction(updates.slice(i, i + 200));
  return updates.length;
}

export async function runDailyJobs(actorId: string | null = null) {
  const completed = await completeDeliveredOrders();
  const birthdays = await grantBirthdayBonuses();
  const expired = await db.$transaction((tx) => expirePoints(tx), { timeout: 60_000 });
  const tiers = await recalcAllTiers();
  const campaigns = await runDueCampaigns(process.env.APP_URL ?? "https://t-rodionova.ru");
  const expiringNotified = await notifyExpiringPoints(7);
  const purged = await purgeRateLimits();
  // веб-аналитика старше 24 месяцев удаляется: срок хранения по политике ПДн
  const analyticsBorder = new Date(Date.now() - 730 * 86_400_000);
  await db.analyticsEvent.deleteMany({ where: { createdAt: { lt: analyticsBorder } } });
  const oldSessions = await db.visitorSession.deleteMany({ where: { startedAt: { lt: analyticsBorder } } });
  const result = { completed, birthdays, expired, tiers, campaigns, expiringNotified, purged, oldSessions: oldSessions.count };
  await audit(actorId, "jobs.daily", "System", null, result);
  return result;
}
