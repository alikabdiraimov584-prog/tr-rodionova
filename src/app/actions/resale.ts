"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/action-result";
import { RESALE_ACTIVE, RESALE_CANCELLABLE, RESALE_CONDITIONS } from "@/lib/resale";

const RequestSchema = z.object({
  orderItemId: z.string().min(1, "Выберите вещь из ваших заказов"),
  condition: z.enum(RESALE_CONDITIONS.map((c) => c.value) as [string, ...string[]], { message: "Укажите состояние вещи" }),
  description: z.string().trim().min(10, "Опишите вещь подробнее: как носилась, есть ли дефекты (минимум 10 символов)").max(2000),
});

export async function createResaleRequestAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/resale");
  const parsed = RequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const item = await db.orderItem.findFirst({
    where: { id: d.orderItemId, order: { userId: user.id, status: { in: ["DELIVERED", "COMPLETED"] } } },
    include: { variant: { select: { productId: true } }, resales: { where: { status: { in: RESALE_ACTIVE } }, select: { id: true } } },
  });
  if (!item) return { error: "Вещь не найдена среди ваших доставленных заказов" };
  if (item.returnedQty >= item.quantity) return { error: "Эта вещь была возвращена" };
  if (item.resales.length > 0) return { error: "По этой вещи уже есть заявка" };
  const r = await db.resaleRequest.create({
    data: {
      userId: user.id,
      orderItemId: item.id,
      productId: item.variant.productId,
      condition: d.condition,
      description: d.description,
    },
  });
  await audit(user.id, "resale.request", "ResaleRequest", r.id, { orderItemId: item.id, condition: d.condition });
  revalidatePath("/account/resale");
  revalidatePath("/crm", "layout");
  return { ok: true, message: "Заявка отправлена. Менеджер оценит вещь и предложит сумму в баллах в течение 2 рабочих дней." };
}

export async function acceptResaleOfferAction(formData: FormData) {
  const user = await requireUser("/account/resale");
  const id = String(formData.get("id"));
  const r = await db.resaleRequest.findFirst({ where: { id, userId: user.id, status: "OFFERED" } });
  if (!r) return;
  await db.resaleRequest.update({ where: { id }, data: { status: "ACCEPTED" } });
  await audit(user.id, "resale.accept", "ResaleRequest", id, { offerPoints: r.offerPoints });
  revalidatePath("/account/resale");
  revalidatePath("/crm", "layout");
}

export async function cancelResaleAction(formData: FormData) {
  const user = await requireUser("/account/resale");
  const id = String(formData.get("id"));
  const r = await db.resaleRequest.findFirst({ where: { id, userId: user.id, status: { in: RESALE_CANCELLABLE } } });
  if (!r) return;
  await db.resaleRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit(user.id, "resale.cancel", "ResaleRequest", id, { from: r.status });
  revalidatePath("/account/resale");
  revalidatePath("/crm", "layout");
}
