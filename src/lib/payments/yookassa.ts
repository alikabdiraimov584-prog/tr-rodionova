import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { markOrderPaid } from "@/lib/orders";
import { activateGiftCard } from "@/lib/gift-payment";
import { activeIntegration } from "@/lib/integrations/store";
import type { PaymentMethod } from "@/generated/prisma/enums";

/**
 * ЮKassa (API v3). Ключи: YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.
 * Без ключей работает демо-режим: заказ отмечается оплаченным по кнопке в кабинете.
 */
/** Ключи: CRM → Интеграции → ЮKassa (приоритет), иначе переменные окружения. */
async function credentials() {
  const i = await activeIntegration("yookassa");
  if (i?.config.shopId && i.config.secretKey) return { shopId: i.config.shopId, secretKey: i.config.secretKey };
  if (process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) return { shopId: process.env.YOOKASSA_SHOP_ID, secretKey: process.env.YOOKASSA_SECRET_KEY };
  return null;
}

export async function yookassaEnabled() {
  return !!(await credentials());
}

/**
 * Демо-оплата (кнопка «Оплатить (демо)») разрешена только вне продакшена или при явном
 * ALLOW_DEMO_PAYMENTS=1. В продакшене без ключей ЮKassa оплата недоступна, а не бесплатна.
 */
export async function demoPaymentsAllowed() {
  if (await yookassaEnabled()) return false;
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_PAYMENTS === "1";
}

/**
 * Способ оплаты для ЮKassa. Для карты и рассрочки тип не фиксируем: умная платёжная страница ЮKassa сама покажет
 * всё, что подключено в кабинете магазина (карта, SberPay, T-Pay, Mir Pay, «Плати частями» sber_bnpl, Сплит, Долями).
 * Старый тип "installments" ЮKassa отключила с 1 июля 2024 года.
 */
const METHODS: Partial<Record<PaymentMethod, string>> = { SBP: "sbp" };

async function api<T>(path: string, body?: unknown, idempotenceKey?: string): Promise<T> {
  const c = await credentials();
  if (!c) throw new Error("ЮKassa не подключена: добавьте ключи в CRM → Интеграции");
  const auth = Buffer.from(`${c.shopId}:${c.secretKey}`).toString("base64");
  const res = await fetch(`https://api.yookassa.ru/v3${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...(idempotenceKey ? { "Idempotence-Key": idempotenceKey } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as T & { type?: string; description?: string };
  if (!res.ok) throw new Error(json.description ?? `ЮKassa: HTTP ${res.status}`);
  return json;
}

type YPayment = { id: string; status: "pending" | "waiting_for_capture" | "succeeded" | "canceled"; paid: boolean; amount: { value: string; currency: string }; confirmation?: { confirmation_url?: string }; metadata?: Record<string, string> };

/** Создать платёж и вернуть ссылку на страницу оплаты. */
export async function createOrderPayment(orderId: string, returnUrl: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { where: { status: "PENDING" }, take: 1 }, items: true } });
  if (order.status !== "NEW") throw new Error("Заказ уже оплачен или отменён");
  const payment = order.payments[0];
  if (!payment) throw new Error("Платёж не найден");
  if (payment.externalId && payment.payload && (payment.payload as { confirmation_url?: string }).confirmation_url) {
    return (payment.payload as { confirmation_url: string }).confirmation_url;
  }
  const amount = (order.total / 100).toFixed(2);
  // ключ идемпотентности — на попытку: после отменённого платежа ЮKassa иначе вернула бы тот же (мёртвый) платёж в течение суток
  const attempt = (((payment.payload as { attempt?: number } | null)?.attempt ?? 0) + 1);
  const created = await api<YPayment>(
    "/payments",
    {
      amount: { value: amount, currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: returnUrl },
      description: `Заказ №${order.number} T.Rodionova`,
      metadata: { orderId, paymentId: payment.id },
      ...(METHODS[payment.method] ? { payment_method_data: { type: METHODS[payment.method] } } : {}),
      receipt: {
        customer: { email: order.email, phone: order.phone.replace(/\D/g, "") },
        items: [
          ...order.items.map((i) => ({ description: `${i.productName} ${i.size}`.slice(0, 128), quantity: String(i.quantity), amount: { value: (i.price / 100).toFixed(2), currency: "RUB" }, vat_code: 1, payment_subject: "commodity", payment_mode: "full_payment" })),
          ...(order.deliveryCost ? [{ description: "Доставка", quantity: "1", amount: { value: (order.deliveryCost / 100).toFixed(2), currency: "RUB" }, vat_code: 1, payment_subject: "service", payment_mode: "full_payment" }] : []),
        ],
      },
    },
    createHash("sha256").update(`${payment.id}:${order.total}:${attempt}`).digest("hex").slice(0, 36),
  );
  const url = created.confirmation?.confirmation_url;
  if (!url) throw new Error("ЮKassa не вернула ссылку на оплату");
  await db.payment.update({ where: { id: payment.id }, data: { externalId: created.id, payload: { confirmation_url: url, status: created.status, attempt } } });
  await db.order.update({ where: { id: orderId }, data: { paymentUrl: url } });
  return url;
}

/** Создать платёж за подарочный сертификат и вернуть ссылку на страницу оплаты. */
export async function createGiftCardPayment(cardId: string, returnUrl: string) {
  const card = await db.giftCard.findUniqueOrThrow({ where: { id: cardId }, include: { purchaser: { select: { email: true, phone: true } } } });
  if (card.status !== "PENDING") throw new Error("Сертификат уже оплачен или отменён");
  const created = await api<YPayment>(
    "/payments",
    {
      amount: { value: (card.amount / 100).toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: returnUrl },
      description: `Подарочный сертификат T.Rodionova`,
      metadata: { giftCardId: card.id },
      receipt: {
        customer: { email: card.purchaser?.email, ...(card.purchaser?.phone ? { phone: card.purchaser.phone.replace(/\D/g, "") } : {}) },
        items: [{ description: "Подарочный сертификат", quantity: "1", amount: { value: (card.amount / 100).toFixed(2), currency: "RUB" }, vat_code: 1, payment_subject: "payment", payment_mode: "advance" }],
      },
    },
    createHash("sha256").update(`gift:${card.id}:${card.amount}`).digest("hex").slice(0, 36),
  );
  const url = created.confirmation?.confirmation_url;
  if (!url) throw new Error("ЮKassa не вернула ссылку на оплату");
  // до подтверждения оплаты храним id платежа ЮKassa, чтобы вебхук нашёл сертификат
  await db.giftCard.update({ where: { id: card.id }, data: { paymentId: created.id } });
  return url;
}

/** Обработать уведомление ЮKassa. Статус перепроверяется запросом к API, не доверяем телу. */
export async function handleYookassaEvent(body: { event?: string; object?: { id?: string } }) {
  const id = body.object?.id;
  if (!id) return { ok: false, reason: "no id" };
  const fresh = await api<YPayment>(`/payments/${id}`);
  const giftCardId = fresh.metadata?.giftCardId;
  if (giftCardId) {
    const card = await db.giftCard.findFirst({ where: { id: giftCardId, paymentId: id } });
    if (!card) return { ok: false, reason: "unknown gift card" };
    if (fresh.status === "succeeded" && fresh.paid) {
      if (Math.round(Number(fresh.amount.value) * 100) !== card.amount) return { ok: false, reason: "amount mismatch" };
      await activateGiftCard(card.id, id);
      return { ok: true, status: "paid" };
    }
    return { ok: true, status: fresh.status };
  }
  const payment = await db.payment.findFirst({ where: { externalId: id }, include: { order: true } });
  if (!payment) return { ok: false, reason: "unknown payment" };
  if (fresh.status === "succeeded" && fresh.paid && Math.round(Number(fresh.amount.value) * 100) !== payment.order.total) {
    return { ok: false, reason: "amount mismatch" };
  }
  if (fresh.status === "succeeded" && fresh.paid) {
    if (payment.order.status === "NEW") await markOrderPaid(payment.orderId, { externalId: id });
    return { ok: true, status: "paid" };
  }
  if (fresh.status === "canceled") {
    const attempt = (payment.payload as { attempt?: number } | null)?.attempt ?? 1;
    await db.payment.update({ where: { id: payment.id }, data: { payload: { status: "canceled", attempt } } });
    return { ok: true, status: "canceled" };
  }
  return { ok: true, status: fresh.status };
}

/** То же для сертификата: при возврате с платёжной страницы подтянуть статус, если вебхук ещё не пришёл. */
export async function syncGiftCardPayment(cardId: string) {
  if (!(await yookassaEnabled())) return;
  const card = await db.giftCard.findFirst({ where: { id: cardId, status: "PENDING", paymentId: { not: null } } });
  if (!card?.paymentId) return;
  await handleYookassaEvent({ object: { id: card.paymentId } });
}

/** Синхронизировать статус при возврате клиента с платёжной страницы (на случай задержки вебхука). */
export async function syncOrderPayment(orderId: string) {
  if (!(await yookassaEnabled())) return;
  const payment = await db.payment.findFirst({ where: { orderId, status: "PENDING", externalId: { not: null } } });
  if (!payment?.externalId) return;
  await handleYookassaEvent({ object: { id: payment.externalId } });
}
