import { syncAllCdekShipments } from "@/lib/delivery/cdek";
import { syncActiveYandexClaims } from "@/lib/delivery/yandex";
import "server-only";
import { db } from "@/lib/db";
import { setOrderStatus, RETURN_WINDOW_DAYS } from "@/lib/orders";
import { audit } from "@/lib/audit";
import { runDueCampaigns } from "@/lib/campaigns";
import { notifyAbandonedCarts, notifyReviewRequests, notifyUnpaidOrders } from "@/lib/notifications";
import { cancelOrder } from "@/lib/orders";
import { purgeRateLimits } from "@/lib/ratelimit";
import { purgeGuestCarts } from "@/lib/guest-cart";

/** Завершить заказы, у которых прошёл срок возврата. */
export async function completeDeliveredOrders(now = new Date()) {
  const border = new Date(now.getTime() - RETURN_WINDOW_DAYS * 86_400_000);
  const due = await db.order.findMany({ where: { status: "DELIVERED", deliveredAt: { lte: border } }, select: { id: true } });
  let done = 0;
  for (const o of due) {
    // один проблемный заказ не должен останавливать завершение остальных и дневные задачи
    try {
      await setOrderStatus(o.id, "COMPLETED", { note: `Срок возврата ${RETURN_WINDOW_DAYS} дней истёк` });
      done++;
    } catch (e) {
      console.error("completeDeliveredOrders", o.id, e);
    }
  }
  return done;
}

/** Обновить суммы покупок в CRM по скользящему периоду. */
export async function refreshCustomerSpending() {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const [users, orders] = await Promise.all([
    db.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true, lifetimeSpent: true, yearSpent: true } }),
    db.order.findMany({
      where: { userId: { not: null }, status: { in: ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] } },
      select: { userId: true, total: true, deliveryCost: true, createdAt: true, items: { select: { price: true, returnedQty: true } } },
    }),
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
    if (u.lifetimeSpent === s.lifetime && u.yearSpent === s.year) continue;
    updates.push(db.user.update({ where: { id: u.id }, data: { lifetimeSpent: s.lifetime, yearSpent: s.year } }));
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

/** Ежечасные задачи: напоминания об оплате, снятие просроченного резерва, рассылки и статьи по расписанию. */
export async function runHourlyJobs() {
  const paymentReminders = await notifyUnpaidOrders();
  const unpaidCancelled = await cancelUnpaidOrders();
  // запланированные рассылки уходят в ближайший час после назначенного времени, а не только ночью
  const dueCampaigns = await runDueCampaigns(process.env.APP_URL ?? "https://tr-rodionova.ru").catch((e) => ({ error: e instanceof Error ? e.message : "campaigns" }));
  // письма ящика поддержки: основной опрос — каждые 5 минут (job=mail), здесь страховка на случай, если он не настроен
  const mail = await (await import("@/lib/support/mail-imap")).pollMailbox().catch((e) => ({ error: e instanceof Error ? e.message : "mail" }));
  // утренняя сводка задач в Telegram: сама решает, что сейчас 09:00 по Москве и что сводка за день ещё не уходила
  const taskDigest = await (await import("@/lib/tasks")).remindOverdueTasks().catch((e) => ({ sent: false, error: e instanceof Error ? e.message : "tasks" }));
  // статьи журнала с отложенной датой: в час выхода их адреса уходят в Яндекс и Bing через IndexNow
  const scheduledArticles = await (await import("@/lib/indexnow")).pingScheduledArticles().catch((e) => ({ sent: 0, error: e instanceof Error ? e.message : "indexnow" }));
  return { paymentReminders, unpaidCancelled, dueCampaigns, mail, taskDigest, scheduledArticles };
}

export async function runDailyJobs(actorId: string | null = null) {
  // каждая задача изолирована: сбой одной не отменяет остальные, ошибки попадают в итог
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
  const customerSpending = await step("customerSpending", refreshCustomerSpending, 0);
  const campaigns = await step("campaigns", () => runDueCampaigns(process.env.APP_URL ?? "https://tr-rodionova.ru"), 0);
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
  const result = { completed, customerSpending, campaigns, cartReminders, reviewRequests, ...hourly, purged, guestCarts, shipments, oldSessions, ads, ...(Object.keys(errors).length ? { errors } : {}) };
  await audit(actorId, "jobs.daily", "System", null, result);
  return result;
}
