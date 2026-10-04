import "server-only";
import * as yookassa from "@/lib/payments/yookassa";
import * as cloudpayments from "@/lib/payments/cloudpayments";
import * as dolyame from "@/lib/payments/dolyame";
import { db } from "@/lib/db";

/**
 * Выбор платёжного провайдера: включённая интеграция в CRM → Интеграции.
 * Если включены обе, приоритет у CloudPayments (в нём больше сервисов оплаты частями).
 */
export type PaymentProvider = "cloudpayments" | "yookassa";

export async function activeProvider(): Promise<PaymentProvider | null> {
  if (await cloudpayments.cloudpaymentsEnabled()) return "cloudpayments";
  if (await yookassa.yookassaEnabled()) return "yookassa";
  return null;
}

/** Онлайн-оплата доступна, если подключена касса (карта, СБП) или хотя бы Долями. */
export async function paymentsEnabled() {
  return (await activeProvider()) !== null || (await dolyame.dolyameEnabled());
}

/** Демо-оплата разрешена только без провайдера и вне продакшена (или при ALLOW_DEMO_PAYMENTS=1). */
export async function demoPaymentsAllowed() {
  if (await paymentsEnabled()) return false;
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_PAYMENTS === "1";
}

export async function createOrderPayment(orderId: string, returnUrl: string) {
  // «Частями» по прямому договору с Долями, если интеграция включена; иначе через платёжную страницу кассы
  const pending = await db.payment.findFirst({ where: { orderId, status: "PENDING" }, select: { method: true } });
  if (pending?.method === "INSTALLMENT" && (await dolyame.dolyameEnabled())) return dolyame.createOrderPayment(orderId, returnUrl);
  const p = await activeProvider();
  if (p === "cloudpayments") return cloudpayments.createOrderPayment(orderId, returnUrl);
  if (p === "yookassa") return yookassa.createOrderPayment(orderId, returnUrl);
  if (await dolyame.dolyameEnabled()) throw new Error("Подключена только оплата частями через Долями: выберите способ «Частями»");
  throw new Error("Оплата не подключена: CRM → Интеграции");
}

export async function createGiftCardPayment(cardId: string, returnUrl: string) {
  const p = await activeProvider();
  if (p === "cloudpayments") return cloudpayments.createGiftCardPayment(cardId, returnUrl);
  if (p === "yookassa") return yookassa.createGiftCardPayment(cardId, returnUrl);
  throw new Error("Оплата не подключена: CRM → Интеграции");
}

/** Сверка при возврате с платёжной страницы: спрашиваем обоих провайдеров, каждый сверяет только свои платежи. */
export async function syncOrderPayment(orderId: string) {
  await cloudpayments.syncOrderPayment(orderId);
  await yookassa.syncOrderPayment(orderId);
  await dolyame.syncOrderPayment(orderId);
}

/** При отмене неоплаченного или ещё не отгруженного заказа: снять заявку Долями, чтобы с клиентки не списали первую часть. */
export async function onOrderCancelled(orderId: string) {
  await dolyame.cancelIfPending(orderId).catch((e) => console.error("dolyame cancel", orderId, e));
}

export async function syncGiftCardPayment(cardId: string) {
  await cloudpayments.syncGiftCardPayment(cardId);
  await yookassa.syncGiftCardPayment(cardId);
}
