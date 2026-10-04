import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { activeIntegration } from "@/lib/integrations/store";

/**
 * Чеки 54-ФЗ через CloudKassir (облачная касса CloudPayments, метод kkt/receipt).
 *
 * Дистанционная продажа с оплатой до передачи товара оформляется двумя чеками:
 *  1. при оплате — «предоплата 100%» (признак способа расчёта 1), деньги электронные;
 *  2. при вручении — «полный расчёт» (признак 4) с зачётом предоплаты (amounts.advancePayment), денег нет.
 * Для платежей через CloudPayments первый чек касса пробивает сама по customerReceipt в счёте;
 * для Долями и других внешних способов первый чек отправляем отсюда. Второй чек — всегда отсюда.
 *
 * Скидка по промокоду и оплата баллами уменьшают цены позиций (распределяются пропорционально);
 * часть, закрытая подарочным сертификатом, идёт как зачёт аванса (сертификат был пробит чеком «аванс»).
 */

export type ReceiptLine = { label: string; price: number; quantity: number; amount: number; object: number; method: number };

type OrderForReceipt = {
  total: number;
  deliveryCost: number;
  giftUsed: number;
  items: { productName: string; size: string; price: number; quantity: number }[];
};

/** Позиции чека на сумму total + giftUsed: товары со скидкой, распределённой пропорционально, и доставка. */
export function receiptLines(order: OrderForReceipt, method: number): ReceiptLine[] {
  const goods = order.items.filter((i) => i.quantity > 0);
  const goodsSum = goods.reduce((s, i) => s + i.price * i.quantity, 0);
  const target = Math.max(0, order.total + order.giftUsed - order.deliveryCost);
  const lines: ReceiptLine[] = [];
  if (goodsSum <= target || goodsSum === 0) {
    for (const i of goods) lines.push({ label: `${i.productName} ${i.size}`.trim(), price: i.price, quantity: i.quantity, amount: i.price * i.quantity, object: 1, method });
  } else {
    // скидка: каждая единица отдельной строкой, чтобы цена × количество сходилась с суммой в копейках
    const units = goods.flatMap((i) => Array.from({ length: i.quantity }, () => ({ label: `${i.productName} ${i.size}`.trim(), price: i.price })));
    let left = target;
    units.forEach((u, idx) => {
      const amount = idx === units.length - 1 ? left : Math.round((u.price / goodsSum) * target);
      left -= amount;
      lines.push({ label: u.label, price: amount, quantity: 1, amount, object: 1, method });
    });
  }
  if (order.deliveryCost > 0) lines.push({ label: "Доставка", price: order.deliveryCost, quantity: 1, amount: order.deliveryCost, object: 4, method });
  return lines;
}

/** Тело CustomerReceipt для CloudKassir (суммы в рублях). */
export function customerReceipt(lines: ReceiptLine[], customer: { email?: string | null; phone?: string | null }, taxationSystem: string, amounts: { electronic: number; advancePayment: number }) {
  return {
    Items: lines.map((l) => ({ label: l.label.slice(0, 128), price: l.price / 100, quantity: l.quantity, amount: l.amount / 100, vat: null, method: l.method, object: l.object })),
    ...(taxationSystem ? { taxationSystem: Number(taxationSystem) } : {}),
    ...(customer.email ? { email: customer.email } : {}),
    ...(customer.phone ? { phone: customer.phone.replace(/\D/g, "") } : {}),
    amounts: { electronic: amounts.electronic / 100, advancePayment: amounts.advancePayment / 100, credit: 0, provision: 0 },
  };
}

async function kassir() {
  const i = await activeIntegration("cloudpayments");
  if (!i?.config.publicId || !i.config.apiSecret) return null;
  const seller = await getSetting("seller");
  const inn = (seller.inn ?? "").replace(/\D/g, "");
  if (!inn) return null;
  return { publicId: i.config.publicId, apiSecret: i.config.apiSecret, taxationSystem: i.config.taxationSystem || "", inn };
}

export async function kassirAvailable() {
  return !!(await kassir());
}

type KktResponse = { Success: boolean; Message?: string | null; Model?: { Id?: string; ErrorCode?: number; Error?: string } };

export type ReceiptKind = "prepayment" | "settlement";

/**
 * Отправить чек по заказу. Идемпотентно: результат хранится в payload платежа (receipts.<kind>),
 * а X-Request-ID = kind:paymentId не даёт кассе пробить дубль при повторе.
 */
export async function issueReceipt(orderId: string, kind: ReceiptKind, opts: { createdBy?: string | null } = {}): Promise<{ ok: true; id: string | null; skipped?: string } | { ok: false; error: string }> {
  const k = await kassir();
  if (!k) return { ok: true, id: null, skipped: "CloudKassir не подключён или не указан ИНН продавца" };
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, payments: { where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } }, orderBy: { updatedAt: "desc" }, take: 1 } } });
  if (!order) return { ok: false, error: "Заказ не найден" };
  const payment = order.payments[0];
  if (!payment) return { ok: true, id: null, skipped: "нет успешного платежа" };
  const payload = (payment.payload as Record<string, unknown> | null) ?? {};
  const receipts = (payload.receipts as Record<string, { id: string | null; at: string }> | undefined) ?? {};
  if (receipts[kind]) return { ok: true, id: receipts[kind].id, skipped: "чек уже отправлен" };
  // наличные при получении и ручная оплата пробиваются офлайн-кассой курьера/шоурума
  if (payment.method === "CASH_ON_DELIVERY" || payment.method === "MANUAL") return { ok: true, id: null, skipped: "оплата не онлайн" };
  if (order.total + order.giftUsed <= 0) return { ok: true, id: null, skipped: "нулевая сумма" };

  const method = kind === "prepayment" ? 1 : 4;
  const lines = receiptLines(order, method);
  const amounts = kind === "prepayment" ? { electronic: order.total, advancePayment: order.giftUsed } : { electronic: 0, advancePayment: order.total + order.giftUsed };
  const body = {
    Inn: k.inn,
    Type: "Income",
    InvoiceId: payment.id,
    AccountId: order.userId ?? order.email,
    CustomerReceipt: customerReceipt(lines, { email: order.email, phone: order.phone }, k.taxationSystem, amounts),
  };
  const auth = Buffer.from(`${k.publicId}:${k.apiSecret}`).toString("base64");
  let res: KktResponse;
  try {
    const r = await fetch("https://api.cloudpayments.ru/kkt/receipt", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", "X-Request-ID": `${kind}:${payment.id}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    res = (await res_json(r)) as KktResponse;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "CloudKassir недоступен" };
  }
  if (!res.Success) return { ok: false, error: res.Model?.Error ?? res.Message ?? "CloudKassir отклонил чек" };
  const id = res.Model?.Id ?? null;
  await db.payment.update({ where: { id: payment.id }, data: { payload: { ...payload, receipts: { ...receipts, [kind]: { id, at: new Date().toISOString() } } } } });
  await db.orderEvent.create({ data: { orderId, message: kind === "prepayment" ? `Чек предоплаты отправлен в кассу${id ? ` (${id})` : ""}` : `Чек полного расчёта отправлен в кассу${id ? ` (${id})` : ""}`, createdBy: opts.createdBy ?? null } });
  return { ok: true, id };
}

async function res_json(r: Response) {
  try {
    return await r.json();
  } catch {
    return { Success: false, Message: `HTTP ${r.status}` };
  }
}

/** Фоновый вызов из смены статуса: ошибки не ломают основное действие, а остаются в истории заказа. */
export async function issueReceiptInBackground(orderId: string, kind: ReceiptKind, createdBy?: string | null) {
  try {
    const r = await issueReceipt(orderId, kind, { createdBy });
    if (!r.ok) {
      console.error("fiscal", kind, orderId, r.error);
      await db.orderEvent.create({ data: { orderId, message: `Чек ${kind === "prepayment" ? "предоплаты" : "полного расчёта"} не отправлен: ${r.error}. Повторите из карточки заказа.`, createdBy: createdBy ?? null } });
    }
  } catch (e) {
    console.error("fiscal", kind, orderId, e);
  }
}
