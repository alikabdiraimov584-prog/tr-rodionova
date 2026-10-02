import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { markOrderPaid } from "@/lib/orders";
import type { PaymentMethod } from "@/generated/prisma/enums";

/**
 * ЮKassa (API v3). Ключи: YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.
 * Без ключей работает демо-режим: заказ отмечается оплаченным по кнопке в кабинете.
 */
export function yookassaEnabled() {
  return !!(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
}

const METHODS: Partial<Record<PaymentMethod, string>> = { CARD: "bank_card", SBP: "sbp", INSTALLMENT: "installments" };

async function api<T>(path: string, body?: unknown, idempotenceKey?: string): Promise<T> {
  const auth = Buffer.from(`${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`).toString("base64");
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
    createHash("sha256").update(`${payment.id}:${order.total}`).digest("hex").slice(0, 36) || randomUUID(),
  );
  const url = created.confirmation?.confirmation_url;
  if (!url) throw new Error("ЮKassa не вернула ссылку на оплату");
  await db.payment.update({ where: { id: payment.id }, data: { externalId: created.id, payload: { confirmation_url: url, status: created.status } } });
  await db.order.update({ where: { id: orderId }, data: { paymentUrl: url } });
  return url;
}

/** Обработать уведомление ЮKassa. Статус перепроверяется запросом к API, не доверяем телу. */
export async function handleYookassaEvent(body: { event?: string; object?: { id?: string } }) {
  const id = body.object?.id;
  if (!id) return { ok: false, reason: "no id" };
  const fresh = await api<YPayment>(`/payments/${id}`);
  const payment = await db.payment.findFirst({ where: { externalId: id }, include: { order: true } });
  if (!payment) return { ok: false, reason: "unknown payment" };
  if (fresh.status === "succeeded" && fresh.paid) {
    if (payment.order.status === "NEW") await markOrderPaid(payment.orderId, { externalId: id });
    return { ok: true, status: "paid" };
  }
  if (fresh.status === "canceled") {
    await db.payment.update({ where: { id: payment.id }, data: { payload: { status: "canceled" } } });
    return { ok: true, status: "canceled" };
  }
  return { ok: true, status: fresh.status };
}

/** Синхронизировать статус при возврате клиента с платёжной страницы (на случай задержки вебхука). */
export async function syncOrderPayment(orderId: string) {
  if (!yookassaEnabled()) return;
  const payment = await db.payment.findFirst({ where: { orderId, status: "PENDING", externalId: { not: null } } });
  if (!payment?.externalId) return;
  await handleYookassaEvent({ object: { id: payment.externalId } });
}
