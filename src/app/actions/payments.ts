"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { markOrderPaid } from "@/lib/orders";
import { createOrderPayment, yookassaEnabled } from "@/lib/payments/yookassa";
import { errorMessage, type ActionState } from "@/lib/action-result";

/** Кнопка «Оплатить»: при настроенной ЮKassa — переход на платёжную страницу, иначе демо-оплата. */
export async function payOrderAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/orders");
  const orderId = String(formData.get("orderId"));
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) return { error: "Заказ не найден" };
  if (order.status !== "NEW") return { error: "Заказ уже оплачен" };
  if (!yookassaEnabled()) {
    await markOrderPaid(order.id, { createdBy: null, externalId: "demo" });
    revalidatePath(`/account/orders/${order.id}`);
    return { ok: true, message: "Демо-оплата прошла" };
  }
  let url: string;
  try {
    const h = await headers();
    const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    url = await createOrderPayment(order.id, `${base}/account/orders/${order.id}?paid=1`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(url);
}
