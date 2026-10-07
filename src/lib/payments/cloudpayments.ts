import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { markOrderPaid } from "@/lib/orders";
import { activateGiftCard } from "@/lib/gift-payment";
import { activeIntegration } from "@/lib/integrations/store";
import { customerReceipt, receiptLines } from "@/lib/payments/fiscal";

/**
 * CloudPayments: платёжная страница по счёту (orders/create), чеки CloudKassir, вебхуки Pay/Fail/Refund
 * с проверкой подписи Content-HMAC. Ключи — CRM → Интеграции → CloudPayments (Public ID и API Secret).
 * Номер счёта (InvoiceId): id платежа заказа или gift:<id сертификата>.
 */

const API = "https://api.cloudpayments.ru";

async function credentials() {
  const i = await activeIntegration("cloudpayments");
  if (i?.config.publicId && i.config.apiSecret) return { publicId: i.config.publicId, apiSecret: i.config.apiSecret, taxationSystem: i.config.taxationSystem || "" };
  return null;
}

export async function cloudpaymentsEnabled() {
  return !!(await credentials());
}

type CpResponse<T> = { Success: boolean; Message?: string | null; Model?: T };

async function api<T>(path: string, body: unknown, creds?: { publicId: string; apiSecret: string }): Promise<CpResponse<T>> {
  const c = creds ?? (await credentials());
  if (!c) throw new Error("CloudPayments не подключён: добавьте ключи в CRM → Интеграции");
  const auth = Buffer.from(`${c.publicId}:${c.apiSecret}`).toString("base64");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({ Success: false, Message: `HTTP ${res.status}` }))) as CpResponse<T>;
  if (!res.ok) throw new Error(json.Message ?? `CloudPayments: HTTP ${res.status}`);
  return json;
}

/** Проверка ключей: POST /test возвращает Success при верной паре Public ID / API Secret. */
export async function testCredentials(publicId: string, apiSecret: string) {
  const r = await api<unknown>("/test", {}, { publicId, apiSecret });
  return r.Success ? { ok: true as const, info: r.Message ?? "Ключи приняты" } : { ok: false as const, error: r.Message ?? "CloudPayments отклонил ключи" };
}

/** Чек сертификата: аванс (method 3), предмет расчёта 10 — платёж. */
function giftReceipt(amount: number, customer: { email?: string | null; phone?: string | null }, taxationSystem: string) {
  return customerReceipt([{ label: "Подарочный сертификат", price: amount, quantity: 1, amount, object: 10, method: 3 }], customer, taxationSystem, { electronic: amount, advancePayment: 0 });
}

type CpOrder = { Id: string; Number: number; Amount: number; Url: string };

/** Создать счёт на оплату заказа и вернуть ссылку на платёжную страницу CloudPayments. */
export async function createOrderPayment(orderId: string, returnUrl: string) {
  const c = await credentials();
  if (!c) throw new Error("CloudPayments не подключён");
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { where: { status: "PENDING" }, take: 1 }, items: true } });
  if (order.status !== "NEW") throw new Error("Заказ уже оплачен или отменён");
  const payment = order.payments[0];
  if (!payment) throw new Error("Платёж не найден");
  const saved = payment.payload as { confirmation_url?: string; provider?: string } | null;
  if (saved?.provider === "cloudpayments" && saved.confirmation_url) return saved.confirmation_url;
  const r = await api<CpOrder>("/orders/create", {
    Amount: order.total / 100,
    Currency: "RUB",
    Description: `Заказ №${order.number} T.Rodionova`,
    Email: order.email,
    Phone: order.phone,
    InvoiceId: payment.id,
    AccountId: order.userId ?? order.email,
    SendEmail: false,
    SuccessRedirectUrl: returnUrl,
    FailRedirectUrl: returnUrl,
    JsonData: {
      orderId,
      paymentId: payment.id,
      cloudPayments: {
        // первый чек: предоплата 100% за товары к доставке; второй (полный расчёт) уйдёт при вручении — src/lib/payments/fiscal.ts
        customerReceipt: customerReceipt(receiptLines(order, 1), { email: order.email, phone: order.phone }, c.taxationSystem, { electronic: order.total, advancePayment: order.giftUsed }),
      },
    },
  });
  const url = r.Model?.Url;
  if (!r.Success || !url) throw new Error(r.Message ?? "CloudPayments не вернул ссылку на оплату");
  await db.payment.update({ where: { id: payment.id }, data: { payload: { provider: "cloudpayments", confirmation_url: url, invoiceId: payment.id, orderRef: r.Model?.Id } } });
  await db.order.update({ where: { id: orderId }, data: { paymentUrl: url } });
  return url;
}

/** Счёт на оплату подарочного сертификата. */
export async function createGiftCardPayment(cardId: string, returnUrl: string) {
  const c = await credentials();
  if (!c) throw new Error("CloudPayments не подключён");
  const card = await db.giftCard.findUniqueOrThrow({ where: { id: cardId }, include: { purchaser: { select: { email: true, phone: true } } } });
  if (card.status !== "PENDING") throw new Error("Сертификат уже оплачен или отменён");
  const invoiceId = `gift:${card.id}`;
  const r = await api<CpOrder>("/orders/create", {
    Amount: card.amount / 100,
    Currency: "RUB",
    Description: "Подарочный сертификат T.Rodionova",
    Email: card.purchaser?.email,
    InvoiceId: invoiceId,
    AccountId: card.purchaserId ?? card.purchaser?.email ?? card.id,
    SendEmail: false,
    SuccessRedirectUrl: returnUrl,
    FailRedirectUrl: returnUrl,
    JsonData: {
      giftCardId: card.id,
      cloudPayments: { customerReceipt: giftReceipt(card.amount, { email: card.purchaser?.email, phone: card.purchaser?.phone }, c.taxationSystem) },
    },
  });
  const url = r.Model?.Url;
  if (!r.Success || !url) throw new Error(r.Message ?? "CloudPayments не вернул ссылку на оплату");
  // до оплаты в paymentId лежит номер счёта, чтобы вебхук и сверка нашли сертификат
  await db.giftCard.update({ where: { id: card.id }, data: { paymentId: invoiceId } });
  return url;
}

/** Подпись уведомления: Content-HMAC = base64(HMAC-SHA256(тело, API Secret)). */
export async function verifySignature(rawBody: string, header: string | null) {
  const c = await credentials();
  if (!c || !header) return false;
  const expected = createHmac("sha256", c.apiSecret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

type CpTransaction = { TransactionId: number; Amount: number; Currency: string; InvoiceId?: string | null; Status: "Authorized" | "Completed" | "Cancelled" | "Declined"; Email?: string };

/** Подтвердить оплату по счёту, перепроверив транзакцию запросом к API (телу уведомления не доверяем). */
async function settleByInvoice(invoiceId: string, transactionId: number) {
  const fresh = await api<CpTransaction>("/payments/get", { TransactionId: transactionId });
  const t = fresh.Model;
  if (!fresh.Success || !t) return { ok: false, reason: fresh.Message ?? "transaction not found" };
  if ((t.InvoiceId ?? "") !== invoiceId) return { ok: false, reason: "invoice mismatch" };
  const paid = t.Status === "Completed" || t.Status === "Authorized";
  const amount = Math.round(t.Amount * 100);
  if (invoiceId.startsWith("gift:")) {
    const card = await db.giftCard.findFirst({ where: { id: invoiceId.slice(5) } });
    if (!card) return { ok: false, reason: "unknown gift card" };
    if (!paid) return { ok: true, status: t.Status };
    if (amount !== card.amount) return { ok: false, reason: "amount mismatch" };
    if (card.status === "PENDING") await activateGiftCard(card.id, String(t.TransactionId));
    return { ok: true, status: "paid" };
  }
  const payment = await db.payment.findFirst({ where: { id: invoiceId }, include: { order: true } });
  if (!payment) return { ok: false, reason: "unknown payment" };
  if (!paid) {
    if (t.Status === "Declined" || t.Status === "Cancelled") await db.payment.update({ where: { id: payment.id }, data: { payload: { ...((payment.payload as object) ?? {}), status: t.Status } } });
    return { ok: true, status: t.Status };
  }
  if (amount !== payment.order.total) return { ok: false, reason: "amount mismatch" };
  if (payment.order.status === "NEW") await markOrderPaid(payment.orderId, { externalId: String(t.TransactionId) });
  return { ok: true, status: "paid" };
}

/** Уведомления Pay / Fail / Refund. Ответ CloudPayments ждёт в виде {"code":0}. */
export async function handleWebhook(kind: "pay" | "fail" | "refund", fields: Record<string, string>) {
  const invoiceId = fields.InvoiceId ?? "";
  const transactionId = Number(fields.TransactionId);
  if (!invoiceId || !transactionId) return { ok: false, reason: "no invoice" };
  const r = await handleWebhookInner(kind, invoiceId, transactionId, fields);
  // след в ленте заказа: видно в CRM, дошло ли уведомление и чем кончилось, без логов сервера
  if (!invoiceId.startsWith("gift:")) {
    const payment = await db.payment.findFirst({ where: { id: invoiceId }, select: { orderId: true } });
    const label = kind === "pay" ? "оплата" : kind === "fail" ? "отказ" : "возврат";
    const outcome = r.ok ? ("status" in r && r.status === "paid" ? "заказ оплачен" : `статус ${"status" in r ? r.status : "принято"}`) : `не принято: ${"reason" in r ? r.reason : ""}`;
    if (payment) await db.orderEvent.create({ data: { orderId: payment.orderId, message: `CloudPayments: уведомление «${label}», транзакция ${transactionId} — ${outcome}` } }).catch(() => undefined);
  }
  return r;
}

async function handleWebhookInner(kind: "pay" | "fail" | "refund", invoiceId: string, transactionId: number, fields: Record<string, string>) {
  if (kind === "pay") return settleByInvoice(invoiceId, transactionId);
  if (kind === "fail") {
    if (!invoiceId.startsWith("gift:")) {
      const payment = await db.payment.findFirst({ where: { id: invoiceId } });
      if (payment) await db.payment.update({ where: { id: payment.id }, data: { payload: { ...((payment.payload as object) ?? {}), status: "Declined", reason: fields.Reason ?? null } } });
    }
    return { ok: true, status: "failed" };
  }
  // возврат инициируется из CRM и отражается в учёте там; уведомление только подтверждаем
  return { ok: true, status: "refund" };
}

/** При возврате клиентки с платёжной страницы: найти транзакцию по номеру счёта, если вебхук ещё не дошёл. */
async function syncInvoice(invoiceId: string) {
  const r = await api<CpTransaction[]>("/payments/find", { InvoiceId: invoiceId });
  const t = r.Model?.find((x) => x.Status === "Completed" || x.Status === "Authorized") ?? r.Model?.[0];
  if (!r.Success || !t) return;
  await settleByInvoice(invoiceId, t.TransactionId);
}

export async function syncOrderPayment(orderId: string) {
  if (!(await cloudpaymentsEnabled())) return;
  const payment = await db.payment.findFirst({ where: { orderId, status: "PENDING" } });
  const payload = payment?.payload as { provider?: string } | null;
  if (!payment || payload?.provider !== "cloudpayments") return;
  await syncInvoice(payment.id);
}

export async function syncGiftCardPayment(cardId: string) {
  if (!(await cloudpaymentsEnabled())) return;
  const card = await db.giftCard.findFirst({ where: { id: cardId, status: "PENDING", paymentId: `gift:${cardId}` } });
  if (!card) return;
  await syncInvoice(`gift:${cardId}`);
}
