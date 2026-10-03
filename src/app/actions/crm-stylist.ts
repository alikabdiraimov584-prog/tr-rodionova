"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { errorMessage, type ActionState } from "@/lib/action-result";

function revalidate(id?: string) {
  revalidatePath("/crm/stylist");
  if (id) revalidatePath(`/crm/stylist/${id}`);
  revalidatePath("/account/stylist");
  if (id) revalidatePath(`/account/stylist/${id}`);
}

const SelectionSchema = z.object({
  title: z.string().trim().min(1, "Введите название подборки").max(120),
  note: z.string().trim().max(2000).optional(),
});

export async function createSelectionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("stylist");
  const customerId = String(formData.get("customerId") ?? "");
  const parsed = SelectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const customer = await db.user.findFirst({ where: { id: customerId, role: "CUSTOMER" }, select: { id: true } });
  if (!customer) return { error: "Выберите клиентку" };
  const s = await db.selection.create({ data: { userId: customer.id, stylistId: staff.id, title: parsed.data.title, note: parsed.data.note || null } });
  await audit(staff.id, "selection.create", "Selection", s.id, { customerId });
  revalidate(s.id);
  redirect(`/crm/stylist/${s.id}`);
}

export async function updateSelectionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("stylist");
  const id = String(formData.get("id"));
  const parsed = SelectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.selection.update({ where: { id }, data: { title: parsed.data.title, note: parsed.data.note || null } });
  await audit(staff.id, "selection.update", "Selection", id, { title: parsed.data.title });
  revalidate(id);
  return { ok: true, message: "Сохранено" };
}

export async function addSelectionItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("stylist");
  const selectionId = String(formData.get("selectionId"));
  const productId = String(formData.get("productId") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (!productId) return { error: "Выберите товар" };
  const product = await db.product.findFirst({ where: { id: productId, status: "ACTIVE" }, select: { id: true, name: true, variants: { select: { id: true } } } });
  if (!product) return { error: "Товар недоступен" };
  if (variantId && !product.variants.some((v) => v.id === variantId)) return { error: "Размер не относится к этому товару" };
  const sel = await db.selection.findUnique({ where: { id: selectionId }, select: { id: true, status: true } });
  if (!sel) return { error: "Подборка не найдена" };
  if (sel.status === "ARCHIVED") return { error: "Подборка в архиве" };
  try {
    const last = await db.selectionItem.aggregate({ where: { selectionId }, _max: { order: true } });
    await db.selectionItem.create({ data: { selectionId, productId, variantId: variantId || null, comment: comment || null, order: (last._max.order ?? -1) + 1 } });
  } catch (e) {
    return { error: /Unique/i.test(String(e)) ? "Этот товар уже в подборке" : errorMessage(e) };
  }
  await audit(staff.id, "selection.addItem", "Selection", selectionId, { productId, variantId: variantId || null });
  revalidate(selectionId);
  return { ok: true, message: `Добавлено: ${product.name}` };
}

export async function removeSelectionItemAction(formData: FormData) {
  const staff = await requireSection("stylist");
  const id = String(formData.get("itemId"));
  const item = await db.selectionItem.findUnique({ where: { id } });
  if (!item) return;
  await db.selectionItem.delete({ where: { id } });
  await audit(staff.id, "selection.removeItem", "Selection", item.selectionId, { productId: item.productId });
  revalidate(item.selectionId);
}

export async function moveSelectionItemAction(formData: FormData) {
  await requireSection("stylist");
  const id = String(formData.get("itemId"));
  const dir = String(formData.get("dir")) === "up" ? -1 : 1;
  const item = await db.selectionItem.findUnique({ where: { id } });
  if (!item) return;
  const items = await db.selectionItem.findMany({ where: { selectionId: item.selectionId }, orderBy: [{ order: "asc" }, { id: "asc" }] });
  const idx = items.findIndex((i) => i.id === id);
  const swap = items[idx + dir];
  if (!swap) return;
  // Перенумеровываем по месту: так порядок остаётся плотным даже после удалений
  const reordered = [...items];
  reordered[idx] = swap;
  reordered[idx + dir] = item;
  await db.$transaction(reordered.map((i, order) => db.selectionItem.update({ where: { id: i.id }, data: { order } })));
  revalidate(item.selectionId);
}

/** Отправить клиентке: статус SENT и сообщение в её чат на сайте (как в уведомлениях о поступлении). */
export async function sendSelectionAction(formData: FormData) {
  const staff = await requireSection("stylist");
  const id = String(formData.get("id"));
  const s = await db.selection.findUnique({ where: { id }, include: { user: true, _count: { select: { items: true } } } });
  if (!s || s._count.items === 0 || s.status === "SENT" || s.status === "VIEWED") return;
  const text = `${s.user.firstName}, я собрала для вас подборку «${s.title}» — посмотрите в кабинете: /account/stylist/${s.id}`;
  await db.$transaction(async (tx) => {
    await tx.selection.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), stylistId: s.stylistId ?? staff.id } });
    const contact = await tx.contact.upsert({
      where: { channel_externalId: { channel: "WEBSITE", externalId: s.userId } },
      update: {},
      create: { channel: "WEBSITE", externalId: s.userId, name: `${s.user.firstName} ${s.user.lastName ?? ""}`.trim(), email: s.user.email, phone: s.user.phone, userId: s.userId },
    });
    let conv = await tx.conversation.findFirst({ where: { contactId: contact.id }, orderBy: { lastMessageAt: "desc" } });
    if (!conv) conv = await tx.conversation.create({ data: { channel: "WEBSITE", contactId: contact.id, customerId: s.userId, status: "PENDING", tags: ["стилист"] } });
    await tx.message.create({ data: { conversationId: conv.id, direction: "OUT", text, status: "SENT", authorId: staff.id } });
    await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date(), status: conv.status === "OPEN" ? "OPEN" : "PENDING", closedAt: null } });
    await audit(staff.id, "selection.send", "Selection", id, { customerId: s.userId, items: s._count.items }, tx);
  });
  revalidate(id);
  revalidatePath("/account/support");
  revalidatePath("/crm/support");
}

export async function archiveSelectionAction(formData: FormData) {
  const staff = await requireSection("stylist");
  const id = String(formData.get("id"));
  const s = await db.selection.findUnique({ where: { id } });
  if (!s || s.status === "ARCHIVED") return;
  await db.selection.update({ where: { id }, data: { status: "ARCHIVED" } });
  await audit(staff.id, "selection.archive", "Selection", id, { from: s.status });
  revalidate(id);
}
