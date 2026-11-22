"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/action-result";

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

// Действия с задачами переехали в crm-tasks.ts (доска, этапы, чеклист, комментарии)

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
