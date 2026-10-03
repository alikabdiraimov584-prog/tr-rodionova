"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { addPoints, recalcTier } from "@/lib/loyalty";
import { audit } from "@/lib/audit";
import { errorMessage, type ActionState } from "@/lib/action-result";

export async function addNoteAction(formData: FormData) {
  const staff = await requireSection("customers");
  const userId = String(formData.get("userId"));
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  await db.customerNote.create({ data: { userId, text, createdBy: staff.id } });
  revalidatePath(`/crm/customers/${userId}`);
}

export async function deleteNoteAction(formData: FormData) {
  await requireSection("customers");
  const id = String(formData.get("id"));
  const note = await db.customerNote.delete({ where: { id } });
  revalidatePath(`/crm/customers/${note.userId}`);
}

const TaskSchema = z.object({
  title: z.string().trim().min(1, "Введите задачу"),
  details: z.string().trim().optional(),
  dueAt: z.string().optional(),
  customerId: z.string().optional(),
  assigneeId: z.string().optional(),
});

export async function createTaskAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("tasks");
  const parsed = TaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  await db.crmTask.create({
    data: {
      title: d.title,
      details: d.details || null,
      dueAt: d.dueAt ? new Date(d.dueAt) : null,
      customerId: d.customerId || null,
      assigneeId: d.assigneeId || staff.id,
    },
  });
  revalidatePath("/crm", "layout");
  return { ok: true, message: "Задача создана" };
}

export async function setTaskStatusAction(formData: FormData) {
  await requireSection("tasks");
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as "OPEN" | "DONE" | "CANCELLED";
  await db.crmTask.update({ where: { id }, data: { status } });
  revalidatePath("/crm", "layout");
}

export async function adjustPointsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("points");
  const userId = String(formData.get("userId"));
  const amount = Math.trunc(Number(formData.get("amount")));
  const comment = String(formData.get("comment") ?? "").trim();
  if (!amount) return { error: "Укажите количество баллов (со знаком минус для списания)" };
  if (!comment) return { error: "Укажите причину — она видна клиенту" };
  if (staff.role !== "ADMIN" && Math.abs(amount) > 5000) return { error: "Менеджер может начислить или списать до 5 000 баллов. Больше — через администратора." };
  try {
    await db.$transaction(async (tx) => {
      await addPoints(tx, userId, amount > 0 ? "EARN_MANUAL" : "SPEND_PURCHASE", amount, { comment, createdBy: staff.id, ...(amount < 0 ? { expiresAt: null } : {}) });
      await audit(staff.id, "points.adjust", "User", userId, { amount, comment }, tx);
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/crm/customers/${userId}`);
  return { ok: true, message: amount > 0 ? `Начислено ${amount} баллов` : `Списано ${-amount} баллов` };
}

export async function updateCustomerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("customersEdit");
  const userId = String(formData.get("userId"));
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const birthday = String(formData.get("birthday") ?? "");
  const r = await db.user.updateMany({
    where: { id: userId, role: "CUSTOMER" },
    data: {
      tags: [...new Set(tags)],
      source: String(formData.get("source") ?? "").trim() || null,
      preferredSize: String(formData.get("preferredSize") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      birthday: birthday ? new Date(birthday) : null,
    },
  });
  if (r.count === 0) return { error: "Клиент не найден" };
  await audit(staff.id, "customer.update", "User", userId, { tags });
  revalidatePath(`/crm/customers/${userId}`);
  return { ok: true, message: "Сохранено" };
}

export async function recalcCustomerTierAction(formData: FormData) {
  await requireSection("customersEdit");
  const userId = String(formData.get("userId"));
  await db.$transaction((tx) => recalcTier(tx, userId));
  revalidatePath(`/crm/customers/${userId}`);
}

/**
 * Обезличивание клиента по запросу (право на удаление, 152-ФЗ): персональные данные затираются,
 * заказы и проводки остаются для бухгалтерии, вход в аккаунт становится невозможен.
 */
export async function anonymizeCustomerAction(formData: FormData) {
  const staff = await requireSection("customersEdit");
  const userId = String(formData.get("userId"));
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.role !== "CUSTOMER") throw new Error("Клиент не найден");
  const stub = `deleted-${u.id.slice(-8)}`;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `${stub}@anonymized.invalid`,
        phone: null,
        firstName: "Удалённый",
        lastName: "клиент",
        birthday: null,
        height: null, bust: null, waist: null, hips: null, preferredSize: null,
        marketingConsent: false,
        isActive: false,
        sessionVersion: { increment: 1 },
        anonymizedAt: new Date(),
        passwordHash: "!",
        tags: [],
      },
    });
    await tx.address.deleteMany({ where: { userId } });
    await tx.cartItem.deleteMany({ where: { userId } });
    await tx.wishlistItem.deleteMany({ where: { userId } });
    await tx.stockSubscription.deleteMany({ where: { userId } });
    await tx.order.updateMany({ where: { userId }, data: { email: `${stub}@anonymized.invalid`, phone: "", firstName: "Удалённый", lastName: "клиент", addressText: null } });
    await tx.contact.updateMany({ where: { userId }, data: { name: "Удалённый клиент", phone: null, email: null, username: null } });
    await tx.visitorSession.updateMany({ where: { userId }, data: { userId: null } });
    await tx.consent.create({ data: { userId, type: "PERSONAL_DATA", granted: false, version: "anonymized" } });
  });
  await audit(staff.id, "customer.anonymize", "User", userId);
  revalidatePath(`/crm/customers/${userId}`);
  revalidatePath("/crm/customers");
}
