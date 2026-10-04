"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { setOrderStatus, partialReturn, createManualOrder, addOrderEvent } from "@/lib/orders";
import { errorMessage, type ActionState } from "@/lib/action-result";
import { toKopecks } from "@/lib/money";
import { audit } from "@/lib/audit";
import type { DeliveryMethod, OrderStatus, PaymentMethod } from "@/generated/prisma/enums";
import { notifyOrder } from "@/lib/notifications";

export async function changeOrderStatusAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  const status = String(formData.get("status")) as OrderStatus;
  const tracking = formData.get("trackingNumber");
  const note = String(formData.get("note") ?? "").trim();
  try {
    await setOrderStatus(orderId, status, {
      createdBy: staff.id,
      trackingNumber: typeof tracking === "string" && tracking.trim() ? tracking.trim() : undefined,
      note: note || undefined,
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/crm/orders/${orderId}`);
  revalidatePath("/crm", "layout");
  return { ok: true, message: "Статус обновлён" };
}

export async function updateOrderInfoAction(formData: FormData) {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim() || null;
  const managerNote = String(formData.get("managerNote") ?? "").trim() || null;
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { trackingNumber, managerNote } });
    await addOrderEvent(tx, orderId, trackingNumber ? `Данные обновлены, трек ${trackingNumber}` : "Данные заказа обновлены", null, staff.id);
  });
  await audit(staff.id, "order.update", "Order", orderId, { trackingNumber, managerNote });
  revalidatePath(`/crm/orders/${orderId}`);
}

export async function partialReturnAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  const lines: { orderItemId: string; qty: number }[] = [];
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("ret_")) {
      const qty = Number(v);
      if (qty > 0) lines.push({ orderItemId: k.slice(4), qty });
    }
  }
  if (lines.length === 0) return { error: "Укажите количество к возврату" };
  try {
    await partialReturn(orderId, lines, {
      reason: String(formData.get("reason") ?? "") || "Возврат от клиента",
      createdBy: staff.id,
      restock: formData.get("restock") === "on",
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/crm/orders/${orderId}`);
  return { ok: true, message: "Возврат оформлен" };
}

export async function createManualOrderAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const customerId = String(formData.get("customerId") ?? "");
  const customer = customerId ? await db.user.findUnique({ where: { id: customerId } }) : null;
  const firstName = String(formData.get("firstName") ?? "").trim() || customer?.firstName || "";
  const phone = String(formData.get("phone") ?? "").trim() || customer?.phone || "";
  const email = String(formData.get("email") ?? "").trim() || customer?.email || "";
  if (!firstName || !phone) return { error: "Укажите клиента или имя и телефон покупателя" };
  const lines: { variantId: string; quantity: number; price: number | null }[] = [];
  for (let i = 0; i < 10; i++) {
    const variantId = String(formData.get(`variant_${i}`) ?? "");
    if (!variantId) continue;
    const priceRaw = String(formData.get(`price_${i}`) ?? "").trim();
    lines.push({ variantId, quantity: Number(formData.get(`qty_${i}`) ?? 1) || 1, price: priceRaw ? toKopecks(priceRaw) : null });
  }
  let id: string;
  try {
    const order = await createManualOrder({
      userId: customer?.id ?? null,
      firstName,
      lastName: customer?.lastName ?? null,
      email: email || "showroom@tr-rodionova.ru",
      phone,
      lines,
      paymentMethod: String(formData.get("paymentMethod") ?? "CARD") as PaymentMethod,
      deliveryMethod: String(formData.get("deliveryMethod") ?? "PICKUP") as DeliveryMethod,
      addressText: String(formData.get("addressText") ?? "").trim() || null,
      pointsToUse: Number(formData.get("pointsToUse") ?? 0) || 0,
      discount: toKopecks(String(formData.get("discount") ?? "0") || "0"),
      comment: String(formData.get("comment") ?? "").trim() || null,
      markPaid: formData.get("markPaid") === "on",
      createdBy: staff.id,
    });
    id = order.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/crm", "layout");
  redirect(`/crm/orders/${id}`);
}


/** «Курьер будет в течение часа»: SMS и письмо клиентке из карточки заказа. */
export async function courierSoonAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order || !["PACKING", "SHIPPED"].includes(order.status)) return { error: "Сообщение отправляется заказу в сборке или в доставке" };
  await notifyOrder(orderId, "COURIER_SOON");
  await db.$transaction((tx) => addOrderEvent(tx, orderId, "Клиентке отправлено: курьер будет в течение часа", null, staff.id));
  revalidatePath(`/crm/orders/${orderId}`);
  return { ok: true, message: "Клиентка предупреждена" };
}

/** Повторная отправка чека в CloudKassir (если при вручении касса не ответила). */
export async function issueReceiptAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  const kind = String(formData.get("kind")) === "prepayment" ? "prepayment" : "settlement";
  const { issueReceipt } = await import("@/lib/payments/fiscal");
  const r = await issueReceipt(orderId, kind, { createdBy: staff.id });
  revalidatePath(`/crm/orders/${orderId}`);
  if (!r.ok) return { error: r.error };
  return { ok: true, message: r.skipped ? `Чек не отправлен: ${r.skipped}` : `Чек отправлен в кассу${r.id ? ` (${r.id})` : ""}` };
}
