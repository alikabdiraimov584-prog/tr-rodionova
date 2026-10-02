"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { addInternalNote, ingestInbound, ingestWebsite, replyToConversation, retryMessage } from "@/lib/support/inbox";
import { audit } from "@/lib/audit";
import { errorMessage, type ActionState } from "@/lib/action-result";
import type { Channel, ConversationStatus, Priority } from "@/generated/prisma/enums";

const path = "/crm/support";

export async function replyAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("support");
  const conversationId = String(formData.get("conversationId"));
  const text = String(formData.get("text") ?? "").trim();
  const mode = String(formData.get("mode") ?? "send");
  if (!text) return { error: "Пустое сообщение" };
  if (text.length > 4000) return { error: "Сообщение слишком длинное" };
  try {
    if (mode === "note") {
      await addInternalNote(conversationId, me.id, text);
    } else {
      const msg = await replyToConversation(conversationId, me.id, text, { close: mode === "close" });
      if (msg.status === "FAILED") return { error: `Не доставлено: ${msg.error}`, ok: true };
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(path);
  return { ok: true };
}

export async function retryMessageAction(formData: FormData) {
  await requireSection("support");
  await retryMessage(String(formData.get("messageId")));
  revalidatePath(path);
}

export async function markReadAction(conversationId: string) {
  await requireSection("support");
  await db.conversation.updateMany({ where: { id: conversationId, unread: { gt: 0 } }, data: { unread: 0 } });
}

export async function updateConversationAction(formData: FormData) {
  const me = await requireSection("support");
  const id = String(formData.get("conversationId"));
  const data: { status?: ConversationStatus; closedAt?: Date | null; priority?: Priority; assigneeId?: string | null; tags?: string[]; waitingSince?: null } = {};
  const status = formData.get("status");
  if (status) {
    data.status = String(status) as ConversationStatus;
    data.closedAt = status === "CLOSED" ? new Date() : null;
    if (status !== "OPEN") data.waitingSince = null;
  }
  const priority = formData.get("priority");
  if (priority) data.priority = String(priority) as Priority;
  if (formData.has("assigneeId")) data.assigneeId = String(formData.get("assigneeId")) || null;
  if (formData.has("tags")) {
    data.tags = [...new Set(String(formData.get("tags")).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
  }
  await db.conversation.update({ where: { id }, data });
  if (data.assigneeId !== undefined) {
    const who = data.assigneeId ? await db.user.findUnique({ where: { id: data.assigneeId }, select: { firstName: true } }) : null;
    await addInternalNote(id, me.id, who ? `Диалог передан: ${who.firstName}` : "Диалог снят с сотрудника");
  }
  revalidatePath(path);
}

export async function linkCustomerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("support");
  const id = String(formData.get("conversationId"));
  const q = String(formData.get("query") ?? "").trim();
  if (!q) return { error: "Введите email или телефон клиента" };
  const digits = q.replace(/\D/g, "").slice(-10);
  const user = await db.user.findFirst({
    where: {
      role: "CUSTOMER",
      OR: [{ email: { equals: q, mode: "insensitive" } }, ...(digits.length === 10 ? [{ phone: { contains: digits.slice(-7) } }] : [])],
    },
  });
  if (!user) return { error: "Клиент не найден" };
  const conv = await db.conversation.update({ where: { id }, data: { customerId: user.id } });
  await db.contact.update({ where: { id: conv.contactId }, data: { userId: user.id } });
  await addInternalNote(id, me.id, `Диалог связан с клиентом ${user.firstName} ${user.lastName ?? ""}`);
  revalidatePath(path);
  return { ok: true, message: "Связано" };
}

export async function unlinkCustomerAction(formData: FormData) {
  await requireSection("support");
  const id = String(formData.get("conversationId"));
  const conv = await db.conversation.update({ where: { id }, data: { customerId: null } });
  await db.contact.update({ where: { id: conv.contactId }, data: { userId: null } });
  revalidatePath(path);
}

const SimSchema = z.object({
  channel: z.enum(["TELEGRAM", "WHATSAPP", "INSTAGRAM", "VK", "EMAIL", "WEBSITE"]),
  name: z.string().trim().min(1, "Имя"),
  handle: z.string().trim().min(1, "Телефон, email или ID"),
  text: z.string().trim().min(1, "Текст"),
});

/** Тестовое входящее — проверить маршрутизацию без подключения каналов. */
export async function simulateInboundAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("support");
  if (!can(me.role, "ordersEdit")) return { error: "Нет прав" };
  const parsed = SimSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Заполните поле «${parsed.error.issues[0].message}»` };
  const d = parsed.data;
  const isEmail = d.handle.includes("@");
  const isPhone = /^\+?[\d\s()-]{10,}$/.test(d.handle);
  const res = await ingestInbound(d.channel as Channel, {
    contactExternalId: isPhone ? d.handle.replace(/\D/g, "") : d.handle.toLowerCase(),
    name: d.name,
    email: isEmail ? d.handle.toLowerCase() : null,
    phone: isPhone ? d.handle : null,
    username: !isEmail && !isPhone ? d.handle : null,
    text: d.text,
    messageExternalId: `sim_${Date.now()}`,
  });
  await audit(me.id, "support.simulate", "Conversation", res.conversationId);
  revalidatePath(path);
  return { ok: true, message: "Сообщение получено" };
}

const TemplateSchema = z.object({ title: z.string().trim().min(1), shortcut: z.string().trim().optional(), text: z.string().trim().min(1) });

export async function saveTemplateAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("ordersEdit");
  const parsed = TemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Заполните название и текст" };
  const id = String(formData.get("id") ?? "");
  const data = { title: parsed.data.title, text: parsed.data.text, shortcut: parsed.data.shortcut ? (parsed.data.shortcut.startsWith("/") ? parsed.data.shortcut : `/${parsed.data.shortcut}`) : null };
  try {
    if (id) await db.replyTemplate.update({ where: { id }, data });
    else await db.replyTemplate.create({ data });
  } catch {
    return { error: "Такая команда уже есть" };
  }
  revalidatePath("/crm/support", "layout");
  return { ok: true, message: "Сохранено" };
}

export async function deleteTemplateAction(formData: FormData) {
  await requireSection("ordersEdit");
  await db.replyTemplate.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/crm/support", "layout");
}

// ───────────── Клиент: чат на сайте ─────────────

export async function sendWebsiteMessageAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/support");
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Напишите сообщение" };
  if (text.length > 2000) return { error: "Слишком длинное сообщение" };
  await ingestWebsite(user.id, text);
  revalidatePath("/account/support");
  return { ok: true };
}
