import "server-only";
import { db } from "@/lib/db";
import { addPoints, expirePoints, recalcTier } from "@/lib/loyalty";
import { setOrderStatus, RETURN_WINDOW_DAYS } from "@/lib/orders";
import { audit } from "@/lib/audit";
import { runDueCampaigns } from "@/lib/campaigns";
import { notifyExpiringPoints, notifyPoints } from "@/lib/notifications";

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
  const users = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User"
    WHERE role = 'CUSTOMER' AND birthday IS NOT NULL
      AND EXTRACT(MONTH FROM birthday) = ${month} AND EXTRACT(DAY FROM birthday) = ${day}`;
  const yearStart = new Date(now.getFullYear(), 0, 1);
  let n = 0;
  for (const { id } of users) {
    const already = await db.pointsTransaction.findFirst({ where: { userId: id, type: "EARN_BIRTHDAY", createdAt: { gte: yearStart } } });
    if (already) continue;
    const user = await db.user.findUniqueOrThrow({ where: { id }, include: { loyaltyTier: true } });
    const bonus = user.loyaltyTier?.birthdayBonus ?? 0;
    if (bonus <= 0) continue;
    await db.$transaction(async (tx) => {
      // Подарочные баллы действуют 30 дней
      await addPoints(tx, id, "EARN_BIRTHDAY", bonus, {
        comment: `С днём рождения! Подарок уровня ${user.loyaltyTier?.name}`,
        expiresAt: new Date(now.getTime() + 30 * 86_400_000),
      });
    });
    await notifyPoints(id, "POINTS_BIRTHDAY", { points: bonus });
    n++;
  }
  return n;
}

/** Пересчитать уровни всех клиентов (уровень зависит от покупок за скользящие 12 месяцев). */
export async function recalcAllTiers() {
  const users = await db.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true } });
  for (const u of users) await db.$transaction((tx) => recalcTier(tx, u.id));
  return users.length;
}

export async function runDailyJobs(actorId: string | null = null) {
  const completed = await completeDeliveredOrders();
  const birthdays = await grantBirthdayBonuses();
  const expired = await db.$transaction((tx) => expirePoints(tx), { timeout: 60_000 });
  const tiers = await recalcAllTiers();
  const campaigns = await runDueCampaigns(process.env.APP_URL ?? "https://t-rodionova.ru");
  const expiringNotified = await notifyExpiringPoints(7);
  const result = { completed, birthdays, expired, tiers, campaigns, expiringNotified };
  await audit(actorId, "jobs.daily", "System", null, result);
  return result;
}
