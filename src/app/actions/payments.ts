"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { markOrderPaid } from "@/lib/orders";
import { createOrderPayment, demoPaymentsAllowed, paymentsEnabled } from "@/lib/payments/provider";
import { errorMessage, type ActionState } from "@/lib/action-result";
import { publicAppUrl } from "@/lib/public-app-url";

/** Кнопка «Оплатить»: при подключённом провайдере — переход на платёжную страницу, иначе демо-оплата. */
export async function payOrderAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/orders");
  const orderId = String(formData.get("orderId"));
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) return { error: "Заказ не найден" };
  if (order.status !== "NEW") return { error: "Заказ уже оплачен" };
  if (!(await paymentsEnabled())) {
    if (!(await demoPaymentsAllowed())) return { error: "Оплата временно недоступна, напишите в службу заботы" };
    await markOrderPaid(order.id, { createdBy: null, externalId: `demo_${Date.now()}` });
    revalidatePath(`/account/orders/${order.id}`);
    return { ok: true, message: "Демо-оплата прошла" };
  }
  let url: string;
  try {
    const base = publicAppUrl();
    url = await createOrderPayment(order.id, `${base}/account/orders/${order.id}?paid=1`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(url);
}
