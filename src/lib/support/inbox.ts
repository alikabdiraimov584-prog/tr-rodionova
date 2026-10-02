import "server-only";
import { db } from "@/lib/db";
import { getSetting, type SupportSettings } from "@/lib/settings";
import { ADAPTERS, type ChannelConfig, type Inbound } from "@/lib/support/channels";
import type { Channel, Priority } from "@/generated/prisma/enums";

// ───────────── Умная маршрутизация ─────────────

const TOPICS: [string, RegExp][] = [
  ["возврат", /возвра|обмен|верн(у|ит)|не подош|не сел/i],
  ["жалоба", /брак|испорч|дыр|пятн|жалоб|претенз|ужасн|разочар|обман/i],
  ["доставка", /доставк|курьер|трек|когда (придёт|приедет|привез)|сдэк|cdek|boxberry|самовывоз/i],
  ["размер", /размер|мерк|сядет|маломер|большемер|примерк|рост\s*\d/i],
  ["оплата", /оплат|рассрочк|чек|карт[аоу]|сбп|деньги/i],
  ["баллы", /балл|бонус|circle|уров(ень|ня)|промокод/i],
  ["наличие", /наличи|появится|предзаказ|когда будет|поступлен/i],
];
const URGENT = /брак|жалоб|претенз|срочно|верните деньги|обман|не пришл|потерял/i;

export function detectTopics(text: string) {
  return TOPICS.filter(([, re]) => re.test(text)).map(([t]) => t);
}

export function detectOrderNumbers(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/(?:заказ[а-я]*|order|№|#)\s*(?:№|#)?\s*(\d{1,7})\b/gi)) out.add(Number(m[1]));
  return [...out];
}

export function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.slice(-10);
}

export function isWorkingTime(s: SupportSettings, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "numeric", hour12: false, weekday: "short" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Mon") + 1;
  return s.workDays.includes(wd) && hour >= s.workFrom && hour < s.workTo;
}

/** Найти клиента по телефону или email. */
async function matchCustomer(phone?: string | null, email?: string | null) {
  if (email) {
    const u = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, role: "CUSTOMER" } });
    if (u) return u;
  }
  const p = normalizePhone(phone);
  if (p) {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "User" WHERE role = 'CUSTOMER' AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ${p} LIMIT 1`;
    if (rows[0]) return db.user.findUnique({ where: { id: rows[0].id } });
  }
  return null;
}

/** Наименее загруженный сотрудник поддержки; если поддержки нет — менеджер. Клиенту — тот же сотрудник, что и в прошлый раз. */
async function pickAssignee(customerId: string | null, contactId: string): Promise<string | null> {
  const prev = await db.conversation.findFirst({
    where: { assigneeId: { not: null }, OR: [{ contactId }, ...(customerId ? [{ customerId }] : [])], assignee: { isActive: true } },
    orderBy: { lastMessageAt: "desc" },
    select: { assigneeId: true },
  });
  if (prev?.assigneeId) return prev.assigneeId;
  for (const role of ["SUPPORT", "MANAGER"] as const) {
    const staff = await db.user.findMany({
      where: { role, isActive: true },
      select: { id: true, _count: { select: { assignedChats: { where: { status: "OPEN" } } } } },
    });
    if (staff.length) return staff.sort((a, b) => a._count.assignedChats - b._count.assignedChats)[0].id;
  }
  return null;
}

async function channelConfig(channel: Channel) {
  const i = await db.channelIntegration.findUnique({ where: { channel } });
  return i;
}

// ───────────── Входящие ─────────────

export async function ingestInbound(channel: Channel, msg: Inbound) {
  const settings = await getSetting("support");
  const now = new Date();

  // 1. Контакт и привязка к клиенту
  let contact = await db.contact.upsert({
    where: { channel_externalId: { channel, externalId: msg.contactExternalId } },
    update: {
      ...(msg.name ? { name: msg.name } : {}),
      ...(msg.username ? { username: msg.username } : {}),
      ...(msg.phone ? { phone: msg.phone } : {}),
      ...(msg.email ? { email: msg.email } : {}),
    },
    create: { channel, externalId: msg.contactExternalId, name: msg.name, username: msg.username, phone: msg.phone, email: msg.email },
  });
  if (!contact.userId) {
    const u = await matchCustomer(contact.phone, contact.email);
    if (u) contact = await db.contact.update({ where: { id: contact.id }, data: { userId: u.id } });
  }
  const customer = contact.userId ? await db.user.findUnique({ where: { id: contact.userId }, include: { loyaltyTier: true } }) : null;

  // 2. Диалог: продолжаем открытый, переоткрываем недавно закрытый, иначе создаём
  const reopenBorder = new Date(now.getTime() - settings.reopenDays * 86_400_000);
  let conv = await db.conversation.findFirst({
    where: { contactId: contact.id, OR: [{ status: { not: "CLOSED" } }, { closedAt: { gte: reopenBorder } }] },
    orderBy: { lastMessageAt: "desc" },
  });
  const wasClosed = conv?.status === "CLOSED";
  if (!conv) {
    conv = await db.conversation.create({
      data: { channel, contactId: contact.id, customerId: customer?.id ?? null, subject: msg.subject ?? null, assigneeId: await pickAssignee(customer?.id ?? null, contact.id) },
    });
  }

  // 3. Сообщение (вебхуки ретраятся — дедупликация по externalId)
  if (msg.messageExternalId) {
    const dup = await db.message.findUnique({ where: { conversationId_externalId: { conversationId: conv.id, externalId: msg.messageExternalId } } });
    if (dup) return { conversationId: conv.id, duplicate: true };
  }
  await db.message.create({
    data: { conversationId: conv.id, direction: "IN", text: msg.text, externalId: msg.messageExternalId ?? null, attachments: msg.attachments ?? undefined, status: "RECEIVED" },
  });

  // 4. Темы, номера заказов, приоритет
  const topics = detectTopics(msg.text);
  const numbers = detectOrderNumbers(msg.text);
  const validNumbers = numbers.length
    ? (await db.order.findMany({ where: { number: { in: numbers }, ...(customer ? { userId: customer.id } : {}) }, select: { number: true } })).map((o) => o.number)
    : [];
  const vip = customer?.loyaltyTier?.code === "PRIVE";
  const priority: Priority = conv.priority === "HIGH" || vip || URGENT.test(msg.text) ? "HIGH" : "NORMAL";

  conv = await db.conversation.update({
    where: { id: conv.id },
    data: {
      status: "OPEN",
      closedAt: null,
      priority,
      customerId: conv.customerId ?? customer?.id ?? null,
      tags: [...new Set([...conv.tags, ...topics, ...(vip ? ["privé"] : [])])],
      orderNumbers: [...new Set([...conv.orderNumbers, ...validNumbers])],
      unread: { increment: 1 },
      lastMessageAt: now,
      lastInboundAt: now,
      waitingSince: conv.waitingSince ?? now,
      assigneeId: conv.assigneeId ?? (await pickAssignee(customer?.id ?? null, contact.id)),
    },
  });
  if (wasClosed) {
    await db.message.create({ data: { conversationId: conv.id, direction: "NOTE", text: "Диалог переоткрыт: клиент написал снова", status: "SENT" } });
  }

  // 5. Автоответ в нерабочее время (не чаще раза в 12 часов на диалог)
  if (settings.autoReply && !isWorkingTime(settings, now)) {
    const recent = await db.message.findFirst({ where: { conversationId: conv.id, direction: "SYSTEM", createdAt: { gte: new Date(now.getTime() - 12 * 3_600_000) } } });
    if (!recent) await deliver(conv.id, settings.autoReplyText, { system: true });
  }
  return { conversationId: conv.id, duplicate: false };
}

// ───────────── Исходящие ─────────────

/** Отправить текст в канал диалога и сохранить сообщение. */
async function deliver(conversationId: string, text: string, opts: { authorId?: string | null; system?: boolean }) {
  const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true } });
  const msg = await db.message.create({
    data: { conversationId, direction: opts.system ? "SYSTEM" : "OUT", text, authorId: opts.authorId ?? null, status: "QUEUED" },
  });
  if (conv.channel === "WEBSITE") {
    // сайт: сообщение сразу видно клиенту в личном кабинете
    return db.message.update({ where: { id: msg.id }, data: { status: "SENT" } });
  }
  const integration = await channelConfig(conv.channel);
  const adapter = ADAPTERS[conv.channel];
  if (!integration?.enabled || !adapter) {
    return db.message.update({ where: { id: msg.id }, data: { status: "FAILED", error: "Канал не подключён — настройте его в «Настройки → Каналы»" } });
  }
  try {
    const res = await adapter.send(integration.config as ChannelConfig, conv.contact.externalId, text, conv.subject);
    if (res.ok) return db.message.update({ where: { id: msg.id }, data: { status: "SENT", externalId: res.externalId ?? null } });
    await db.channelIntegration.update({ where: { id: integration.id }, data: { lastError: res.error } });
    return db.message.update({ where: { id: msg.id }, data: { status: "FAILED", error: res.error } });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Сеть недоступна";
    return db.message.update({ where: { id: msg.id }, data: { status: "FAILED", error } });
  }
}

export async function replyToConversation(conversationId: string, authorId: string, text: string, opts: { close?: boolean } = {}) {
  const now = new Date();
  const msg = await deliver(conversationId, text, { authorId });
  const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  await db.conversation.update({
    where: { id: conversationId },
    data: {
      status: opts.close ? "CLOSED" : "PENDING",
      closedAt: opts.close ? now : null,
      unread: 0,
      waitingSince: null,
      lastMessageAt: now,
      firstResponseAt: conv.firstResponseAt ?? now,
      assigneeId: conv.assigneeId ?? authorId,
    },
  });
  return msg;
}

export async function retryMessage(messageId: string) {
  const m = await db.message.findUniqueOrThrow({ where: { id: messageId } });
  if (m.status !== "FAILED" || m.direction === "IN") return;
  await db.message.delete({ where: { id: m.id } });
  return deliver(m.conversationId, m.text, { authorId: m.authorId, system: m.direction === "SYSTEM" });
}

export async function addInternalNote(conversationId: string, authorId: string, text: string) {
  return db.message.create({ data: { conversationId, direction: "NOTE", text, authorId, status: "SENT" } });
}

/** Подстановка переменных в шаблон ответа. */
export function renderTemplate(text: string, ctx: { name?: string | null; tier?: string | null; points?: number | null; order?: number | null }) {
  return text
    .replace(/\{имя\}/g, ctx.name ?? "")
    .replace(/\{уровень\}/g, ctx.tier ?? "")
    .replace(/\{баллы\}/g, ctx.points != null ? ctx.points.toLocaleString("ru-RU") : "")
    .replace(/\{заказ\}/g, ctx.order ? `№${ctx.order}` : "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Сообщение клиента с сайта (личный кабинет). */
export async function ingestWebsite(userId: string, text: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return ingestInbound("WEBSITE", { contactExternalId: user.id, name: `${user.firstName} ${user.lastName ?? ""}`.trim(), email: user.email, phone: user.phone, text });
}
