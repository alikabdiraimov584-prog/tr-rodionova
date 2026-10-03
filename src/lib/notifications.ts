import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { ADAPTERS, type ChannelConfig } from "@/lib/support/channels";
import { formatMoney } from "@/lib/money";
import { DELIVERY_METHOD } from "@/lib/labels";
import type { Channel } from "@/generated/prisma/enums";

/**
 * Сервисные уведомления: статусы заказа и баллы. Это не рассылки, поэтому согласие на маркетинг
 * не требуется. Email уходит всегда, когда канал подключён; SMS — только для событий, где
 * важна скорость (отправка и доставка заказа). Каждая попытка пишется в Notification,
 * ошибки отправки никогда не ломают действие, которое их вызвало.
 */

export type OrderEventKind = "ORDER_CREATED" | "ORDER_PAID" | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "ORDER_COMPLETED" | "ORDER_CANCELLED";

const SMS_EVENTS: OrderEventKind[] = ["ORDER_SHIPPED", "ORDER_DELIVERED"];

function siteUrl() {
  return process.env.APP_URL ?? "https://t-rodionova.ru";
}

export async function sendVia(channel: Channel, address: string, text: string, subject: string | null): Promise<{ status: "SENT" | "FAILED" | "SKIPPED"; error?: string }> {
  const integration = await db.channelIntegration.findUnique({ where: { channel } });
  const adapter = ADAPTERS[channel];
  if (!integration?.enabled || !adapter) return { status: "SKIPPED", error: "Канал не подключён" };
  try {
    const r = await adapter.send(integration.config as ChannelConfig, address, text, subject);
    return r.ok ? { status: "SENT" } : { status: "FAILED", error: r.error };
  } catch (e) {
    return { status: "FAILED", error: e instanceof Error ? e.message : "Сеть недоступна" };
  }
}

async function dispatch(input: { userId?: string | null; orderId?: string | null; event: string; subject: string | null; text: string; email?: string | null; phone?: string | null; sms?: string | null }) {
  const targets: { channel: Channel; address: string; text: string; subject: string | null }[] = [];
  if (input.email) targets.push({ channel: "EMAIL", address: input.email, text: input.text, subject: input.subject });
  const digits = input.phone?.replace(/\D/g, "") ?? "";
  if (input.sms && digits.length >= 10) targets.push({ channel: "SMS", address: digits, text: input.sms, subject: null });
  for (const t of targets) {
    const r = await sendVia(t.channel, t.address, t.text, t.subject);
    await db.notification.create({
      data: { userId: input.userId ?? null, orderId: input.orderId ?? null, event: input.event, channel: t.channel, address: t.address, subject: t.subject, text: t.text, status: r.status, error: r.error ?? null },
    });
  }
}

function signature(brand: { name: string; phone: string; email: string }) {
  return `\n\n— ${brand.name}\n${brand.phone} · ${brand.email}`;
}

/** Уведомление по событию заказа. Вызывать после фиксации транзакции; ошибки гасятся. */
export async function notifyOrder(orderId: string, event: OrderEventKind) {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, user: { select: { id: true, pointsBalance: true } } } });
    if (!order) return;
    const brand = await getSetting("brand");
    const n = `№${order.number}`;
    const link = `${siteUrl()}/account/orders/${order.id}`;
    const items = order.items.map((i) => `· ${i.productName}, ${i.size}${i.color ? `, ${i.color}` : ""} × ${i.quantity}`).join("\n");
    const hi = `${order.firstName}, здравствуйте.`;
    let subject = "";
    let text = "";
    let sms: string | null = null;
    switch (event) {
      case "ORDER_CREATED":
        subject = `Заказ ${n} принят`;
        text = `${hi}\n\nМы приняли ваш заказ ${n} на ${formatMoney(order.total)}.\n\n${items}\n\n${order.status === "NEW" && order.total > 0 ? `Заказ ждёт оплаты: ${order.paymentUrl ?? link}` : `Подробности: ${link}`}`;
        break;
      case "ORDER_PAID":
        subject = `Заказ ${n} оплачен`;
        text = `${hi}\n\nОплата заказа ${n} получена, спасибо. Мы начали собирать посылку${order.isPreorder ? "; вещи по предзаказу отшиваются под вас" : ""}.\n\nСпособ получения: ${DELIVERY_METHOD[order.deliveryMethod].label}.\nСледить за статусом: ${link}`;
        break;
      case "ORDER_SHIPPED":
        subject = `Заказ ${n} передан в доставку`;
        text = `${hi}\n\nЗаказ ${n} передан в доставку (${DELIVERY_METHOD[order.deliveryMethod].label}).${order.trackingNumber ? `\nТрек-номер: ${order.trackingNumber}` : ""}\n\nСледить за статусом: ${link}`;
        sms = `T.Rodionova: заказ ${n} передан в доставку.${order.trackingNumber ? ` Трек ${order.trackingNumber}.` : ""}`;
        break;
      case "ORDER_DELIVERED":
        subject = `Заказ ${n} доставлен`;
        text = `${hi}\n\nЗаказ ${n} доставлен. Надеемся, вещи сели так, как вы ждали.\n\nЕсли что-то не подошло, вернуть можно в течение 14 дней: ${siteUrl()}/delivery. Баллы Circle начислятся после окончания срока возврата.`;
        sms = `T.Rodionova: заказ ${n} доставлен. Возврат — 14 дней.`;
        break;
      case "ORDER_COMPLETED":
        subject = `Баллы за заказ ${n} начислены`;
        text = `${hi}\n\nЗа заказ ${n} начислено ${order.pointsEarned} баллов Circle. ${order.user ? `На вашем счёте ${order.user.pointsBalance} баллов — ими можно оплатить часть следующей покупки.` : ""}\n\nЛичный кабинет: ${siteUrl()}/account/loyalty`;
        break;
      case "ORDER_CANCELLED":
        subject = `Заказ ${n} отменён`;
        text = `${hi}\n\nЗаказ ${n} отменён.${order.total > 0 && order.paidAt ? " Деньги вернутся на карту в течение 3–10 рабочих дней." : ""}${order.pointsUsed > 0 ? ` Списанные баллы (${order.pointsUsed}) возвращены на счёт.` : ""}\n\nЕсли отмена произошла по ошибке, ответьте на это письмо.`;
        break;
    }
    if (event === "ORDER_COMPLETED" && !(order.pointsEarned > 0)) return;
    await dispatch({ userId: order.userId, orderId: order.id, event, subject, text: text + signature(brand), email: order.email, phone: order.phone, sms: SMS_EVENTS.includes(event) ? sms : null });
  } catch (e) {
    console.error("notifyOrder", event, orderId, e);
  }
}

/** Уведомление клиентке по баллам (день рождения, скорое сгорание). */
export async function notifyPoints(userId: string, event: "POINTS_BIRTHDAY" | "POINTS_EXPIRING", data: { points: number; expiresAt?: Date | null }) {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, phone: true, firstName: true, pointsBalance: true } });
    if (!user) return;
    const brand = await getSetting("brand");
    const hi = `${user.firstName}, здравствуйте.`;
    const subject = event === "POINTS_BIRTHDAY" ? "С днём рождения! Подарок от T.Rodionova" : `${data.points} баллов сгорят ${data.expiresAt?.toLocaleDateString("ru-RU") ?? "скоро"}`;
    const text =
      event === "POINTS_BIRTHDAY"
        ? `${hi}\n\nС днём рождения! Мы начислили ${data.points} подарочных баллов — они действуют 30 дней. На счёте сейчас ${user.pointsBalance} баллов.\n\nВыбрать подарок себе: ${siteUrl()}/catalog`
        : `${hi}\n\n${data.points} баллов Circle сгорят ${data.expiresAt?.toLocaleDateString("ru-RU") ?? "в ближайшие дни"}. Ими можно оплатить до 30 % следующей покупки.\n\nКаталог: ${siteUrl()}/catalog`;
    await dispatch({ userId, event, subject, text: text + signature(brand), email: user.email, phone: user.phone, sms: null });
  } catch (e) {
    console.error("notifyPoints", event, userId, e);
  }
}

/** Баллы, которые сгорят в ближайшие days дней, — по одному письму на клиентку в неделю. */
export async function notifyExpiringPoints(days = 7, now = new Date()) {
  const until = new Date(now.getTime() + days * 86_400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await db.pointsTransaction.groupBy({
    by: ["userId"],
    where: { amount: { gt: 0 }, expiresAt: { gt: now, lte: until } },
    _sum: { amount: true },
    _min: { expiresAt: true },
  });
  if (rows.length === 0) return 0;
  const recent = await db.notification.findMany({ where: { event: "POINTS_EXPIRING", createdAt: { gte: weekAgo }, userId: { in: rows.map((r) => r.userId) } }, select: { userId: true } });
  const skip = new Set(recent.map((r) => r.userId));
  const balances = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, pointsBalance: true } });
  const balance = new Map(balances.map((b) => [b.id, b.pointsBalance]));
  let n = 0;
  for (const r of rows) {
    if (skip.has(r.userId)) continue;
    const points = Math.min(r._sum.amount ?? 0, balance.get(r.userId) ?? 0);
    if (points <= 0) continue;
    await notifyPoints(r.userId, "POINTS_EXPIRING", { points, expiresAt: r._min.expiresAt });
    n++;
  }
  return n;
}
