import { syncAllCdekShipments } from "@/lib/delivery/cdek";
import { syncActiveYandexClaims } from "@/lib/delivery/yandex";
import "server-only";
import { db } from "@/lib/db";
import { addPoints, expirePoints } from "@/lib/loyalty";
import { setOrderStatus, RETURN_WINDOW_DAYS } from "@/lib/orders";
import { audit } from "@/lib/audit";
import { runDueCampaigns } from "@/lib/campaigns";
import { notifyAbandonedCarts, notifyExpiringPoints, notifyPoints, notifyReviewRequests, notifyUnpaidOrders } from "@/lib/notifications";
import { cancelOrder } from "@/lib/orders";
import { purgeRateLimits } from "@/lib/ratelimit";
import { purgeGuestCarts } from "@/lib/guest-cart";

/** Завершить заказы, у которых прошёл срок возврата. При завершении начисляются баллы. */
export async function completeDeliveredOrders(now = new Date()) {
  const border = new Date(now.getTime() - RETURN_WINDOW_DAYS * 86_400_000);
  const due = await db.order.findMany({ where: { status: "DELIVERED", deliveredAt: { lte: border } }, select: { id: true } });
  let done = 0;
  for (const o of due) {
    // один проблемный заказ не должен останавливать завершение остальных и дневные задачи
    try {
      await setOrderStatus(o.id, "COMPLETED", { note: `Срок возврата ${RETURN_WINDOW_DAYS} дней истёк, баллы начислены` });
      done++;
    } catch (e) {
      console.error("completeDeliveredOrders", o.id, e);
    }
  }
  return done;
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

/** Снятие резерва: неоплаченные онлайн-заказы старше 24 часов отменяются, товар возвращается в продажу (оферта, п. 6.4). */
export async function cancelUnpaidOrders(now = new Date()) {
  const border = new Date(now.getTime() - 24 * 3_600_000);
  const due = await db.order.findMany({
    where: { status: "NEW", total: { gt: 0 }, createdAt: { lt: border }, payments: { some: { status: "PENDING", method: { in: ["CARD", "SBP", "INSTALLMENT"] } } } },
    select: { id: true },
  });
  let n = 0;
  for (const o of due) {
    try {
      await cancelOrder(o.id, { reason: "Резерв снят: заказ не оплачен в течение 24 часов" });
      n++;
    } catch {
      // заказ мог быть оплачен между выборкой и отменой
    }
  }
  return n;
}

/** Ежечасные задачи: напоминания об оплате и снятие просроченного резерва. */
export async function runHourlyJobs() {
  const paymentReminders = await notifyUnpaidOrders();
  const unpaidCancelled = await cancelUnpaidOrders();
  // запланированные рассылки уходят в ближайший час после назначенного времени, а не только ночью
  const dueCampaigns = await runDueCampaigns(process.env.APP_URL ?? "https://tr-rodionova.ru").catch((e) => ({ error: e instanceof Error ? e.message : "campaigns" }));
  // письма ящика поддержки: основной опрос — каждые 5 минут (job=mail), здесь страховка на случай, если он не настроен
  const mail = await (await import("@/lib/support/mail-imap")).pollMailbox().catch((e) => ({ error: e instanceof Error ? e.message : "mail" }));
  // утренняя сводка задач в Telegram: сама решает, что сейчас 09:00 по Москве и что сводка за день ещё не уходила
  const taskDigest = await (await import("@/lib/tasks")).remindOverdueTasks().catch((e) => ({ sent: false, error: e instanceof Error ? e.message : "tasks" }));
  return { paymentReminders, unpaidCancelled, dueCampaigns, mail, taskDigest };
}

export async function runDailyJobs(actorId: string | null = null) {
  // каждая задача изолирована: сбой одной (например, начисления по заказу) не отменяет остальные, ошибки попадают в итог
  const errors: Record<string, string> = {};
  const step = async <T,>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      errors[name] = e instanceof Error ? e.message : String(e);
      console.error("jobs.daily", name, e);
      return fallback;
    }
  };
  const completed = await step("completed", completeDeliveredOrders, 0);
  const birthdays = await step("birthdays", grantBirthdayBonuses, 0);
  const expired = await step("expired", () => db.$transaction((tx) => expirePoints(tx), { timeout: 60_000 }), 0);
  const tiers = await step("tiers", recalcAllTiers, 0);
  const campaigns = await step("campaigns", () => runDueCampaigns(process.env.APP_URL ?? "https://tr-rodionova.ru"), 0);
  const expiringNotified = await step("expiringNotified", () => notifyExpiringPoints(7), 0);
  const cartReminders = await step("cartReminders", notifyAbandonedCarts, 0);
  const reviewRequests = await step("reviewRequests", notifyReviewRequests, 0);
  const purged = await step("purged", purgeRateLimits, 0);
  const guestCarts = await step("guestCarts", purgeGuestCarts, 0);
  const shipments = await step(
    "shipments",
    async () => {
      const [cdek, yandex] = [await syncAllCdekShipments(), await syncActiveYandexClaims()];
      return { checked: cdek.checked + yandex.checked, changed: cdek.changed + yandex.changed };
    },
    { checked: 0, changed: 0 },
  );
  // веб-аналитика старше 24 месяцев удаляется: срок хранения по политике ПДн
  const analyticsBorder = new Date(Date.now() - 730 * 86_400_000);
  const oldSessions = await step("oldSessions", async () => {
    await db.analyticsEvent.deleteMany({ where: { createdAt: { lt: analyticsBorder } } });
    return (await db.visitorSession.deleteMany({ where: { startedAt: { lt: analyticsBorder } } })).count;
  }, 0);
  // реклама: статистика Директа за неделю, зеркало кампаний и оптимизатор (автопилот — по настройке интеграции)
  const ads = await step("ads", async () => (await import("@/lib/ads/sync")).syncAds({ days: 7 }), { skipped: "ошибка" } as Awaited<ReturnType<typeof import("@/lib/ads/sync").syncAds>>);
  const hourly = await step("hourly", runHourlyJobs, {} as Awaited<ReturnType<typeof runHourlyJobs>>);
  const result = { completed, birthdays, expired, tiers, campaigns, expiringNotified, cartReminders, reviewRequests, ...hourly, purged, guestCarts, shipments, oldSessions, ads, ...(Object.keys(errors).length ? { errors } : {}) };
  await audit(actorId, "jobs.daily", "System", null, result);
  return result;
}
