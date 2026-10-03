import "server-only";
import { db } from "@/lib/db";
import { customerStats } from "@/lib/analytics";
import { rfmSegment, type RfmSegment } from "@/lib/rfm";
import { ADAPTERS, type ChannelConfig } from "@/lib/support/channels";
import { renderTemplate } from "@/lib/support/inbox";
import type { Channel } from "@/generated/prisma/enums";

/** Фильтры аудитории. Все условия объединяются по «И». */
export type Segment = {
  tiers?: string[]; // коды уровней
  rfm?: RfmSegment["code"][];
  tags?: string[];
  sources?: string[];
  sizes?: string[];
  minLifetime?: number; // ₽
  maxLifetime?: number;
  lastOrderMinDays?: number;
  lastOrderMaxDays?: number;
  registeredDays?: number; // зарегистрированы за последние N дней
  birthdayMonth?: number; // 1–12
  hasPoints?: number; // баланс от
  pointsExpiringDays?: number; // есть баллы, сгорающие в ближайшие N дней
  waitlist?: boolean; // ждут поступления
  wishlist?: boolean; // есть избранное
  viewedProductId?: string; // смотрели товар за 30 дней
  cartAbandoned?: boolean; // есть корзина без заказа за 7 дней
  productBought?: string; // покупали товар (id)
  categoryBought?: string;
  marketing?: boolean; // требовать согласие (для рекламных — всегда)
};

export type AudienceRow = { id: string; firstName: string; lastName: string | null; email: string; phone: string | null; tier: string | null; points: number; address: string | null };

/** Адрес доставки сообщения по каналу. */
async function addresses(channel: Channel, userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (channel === "EMAIL" || channel === "WEBSITE") {
    const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
    for (const u of users) map.set(u.id, channel === "EMAIL" ? u.email : u.id);
  } else if (channel === "SMS") {
    const users = await db.user.findMany({ where: { id: { in: userIds }, phone: { not: null } }, select: { id: true, phone: true } });
    for (const u of users) {
      const d = (u.phone ?? "").replace(/\D/g, "");
      if (d.length >= 10) map.set(u.id, d.length === 10 ? `7${d}` : d.replace(/^8/, "7"));
    }
  } else {
    const contacts = await db.contact.findMany({ where: { channel, userId: { in: userIds } }, select: { userId: true, externalId: true } });
    for (const c of contacts) if (c.userId) map.set(c.userId, c.externalId);
    if (channel === "WHATSAPP") {
      // WhatsApp: можно писать по номеру, если контакта ещё нет
      const users = await db.user.findMany({ where: { id: { in: userIds.filter((id) => !map.has(id)) }, phone: { not: null } }, select: { id: true, phone: true } });
      for (const u of users) {
        const d = (u.phone ?? "").replace(/\D/g, "");
        if (d.length >= 10) map.set(u.id, d.length === 10 ? `7${d}` : d.replace(/^8/, "7"));
      }
    }
  }
  return map;
}

export async function buildAudience(seg: Segment, channel: Channel, opts: { limit?: number } = {}): Promise<{ rows: AudienceRow[]; total: number; noAddress: number }> {
  const now = Date.now();
  const users = await db.user.findMany({
    where: {
      role: "CUSTOMER",
      isActive: true,
      ...(seg.marketing !== false ? { marketingConsent: true } : {}),
      ...(seg.tiers?.length ? { loyaltyTier: { code: { in: seg.tiers } } } : {}),
      ...(seg.tags?.length ? { tags: { hasSome: seg.tags } } : {}),
      ...(seg.sources?.length ? { source: { in: seg.sources } } : {}),
      ...(seg.sizes?.length ? { preferredSize: { in: seg.sizes } } : {}),
      ...(seg.minLifetime ? { lifetimeSpent: { gte: seg.minLifetime * 100 } } : {}),
      ...(seg.maxLifetime ? { lifetimeSpent: { lte: seg.maxLifetime * 100 } } : {}),
      ...(seg.registeredDays ? { createdAt: { gte: new Date(now - seg.registeredDays * 86_400_000) } } : {}),
      ...(seg.hasPoints ? { pointsBalance: { gte: seg.hasPoints } } : {}),
      ...(seg.waitlist ? { stockAlerts: { some: { notifiedAt: null } } } : {}),
      ...(seg.wishlist ? { wishlist: { some: {} } } : {}),
      ...(seg.pointsExpiringDays ? { points: { some: { amount: { gt: 0 }, expiresAt: { gt: new Date(), lt: new Date(now + seg.pointsExpiringDays * 86_400_000) } } } } : {}),
      ...(seg.productBought ? { orders: { some: { status: { notIn: ["NEW", "CANCELLED"] }, items: { some: { variant: { productId: seg.productBought } } } } } } : {}),
      ...(seg.categoryBought ? { orders: { some: { status: { notIn: ["NEW", "CANCELLED"] }, items: { some: { variant: { product: { categoryId: seg.categoryBought } } } } } } } : {}),
      ...(seg.viewedProductId ? { sessions: { some: { events: { some: { type: "PRODUCT_VIEW", productId: seg.viewedProductId, createdAt: { gte: new Date(now - 30 * 86_400_000) } } } } } } : {}),
      ...(seg.cartAbandoned ? { cart: { some: {} }, NOT: { orders: { some: { createdAt: { gte: new Date(now - 7 * 86_400_000) } } } } } : {}),
    },
    include: { loyaltyTier: { select: { name: true } } },
    orderBy: { lifetimeSpent: "desc" },
  });
  const needStats = !!(seg.rfm?.length || seg.lastOrderMinDays || seg.lastOrderMaxDays);
  const stats = needStats ? await customerStats() : null;
  const filtered = users.filter((u) => {
    if (seg.birthdayMonth && u.birthday?.getMonth() !== seg.birthdayMonth - 1) return false;
    if (!stats) return true;
    const s = stats.get(u.id);
    const last = s?.lastOrderAt ?? null;
    const days = last ? Math.floor((now - last.getTime()) / 86_400_000) : null;
    if (seg.lastOrderMinDays && (days === null || days < seg.lastOrderMinDays)) return false;
    if (seg.lastOrderMaxDays && (days === null || days > seg.lastOrderMaxDays)) return false;
    if (seg.rfm?.length) {
      const code = rfmSegment({ lastOrderAt: last, ordersCount: s?.ordersCount ?? 0, lifetimeSpent: u.lifetimeSpent, createdAt: u.createdAt }).code;
      if (!seg.rfm.includes(code)) return false;
    }
    return true;
  });
  const addr = await addresses(channel, filtered.map((u) => u.id));
  const rows = filtered.map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, tier: u.loyaltyTier?.name ?? null, points: u.pointsBalance, address: addr.get(u.id) ?? null }));
  return { rows: opts.limit ? rows.slice(0, opts.limit) : rows, total: rows.length, noAddress: rows.filter((r) => !r.address).length };
}

export function personalize(text: string, r: { firstName: string; tier: string | null; points: number }, link: string | null, unsubscribe: string | null) {
  let t = renderTemplate(text, { name: r.firstName, tier: r.tier, points: r.points }).replace(/\{ссылка\}/g, link ?? "");
  if (unsubscribe) t += `\n\n${unsubscribe}`;
  return t;
}

/** Отправить одно сообщение по каналу (адрес уже найден). */
export async function sendOne(channel: Channel, address: string, text: string, subject: string | null, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (channel === "WEBSITE") {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const contact = await db.contact.upsert({
      where: { channel_externalId: { channel: "WEBSITE", externalId: userId } },
      update: {},
      create: { channel: "WEBSITE", externalId: userId, name: `${user.firstName} ${user.lastName ?? ""}`.trim(), email: user.email, phone: user.phone, userId },
    });
    let conv = await db.conversation.findFirst({ where: { contactId: contact.id }, orderBy: { lastMessageAt: "desc" } });
    if (!conv) conv = await db.conversation.create({ data: { channel: "WEBSITE", contactId: contact.id, customerId: userId, status: "PENDING", tags: ["рассылка"] } });
    await db.message.create({ data: { conversationId: conv.id, direction: "OUT", text, status: "SENT" } });
    await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date(), closedAt: null, status: conv.status === "OPEN" ? "OPEN" : "PENDING" } });
    return { ok: true };
  }
  const integration = await db.channelIntegration.findUnique({ where: { channel } });
  const adapter = ADAPTERS[channel];
  if (!integration?.enabled || !adapter) return { ok: false, error: "Канал не подключён" };
  try {
    const r = await adapter.send(integration.config as ChannelConfig, address, text, subject);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Сеть недоступна" };
  }
}

/** Выполнить рассылку: создать получателей (если ещё нет) и отправить всем в очереди. */
export async function runCampaign(campaignId: string, baseUrl: string) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (c.status === "SENT" || c.status === "CANCELLED") return c;
  await db.campaign.update({ where: { id: c.id }, data: { status: "SENDING", startedAt: c.startedAt ?? new Date() } });
  const seg = c.segment as Segment;
  const existing = await db.campaignRecipient.count({ where: { campaignId: c.id } });
  if (existing === 0) {
    const { rows } = await buildAudience(seg, c.channel);
    if (rows.length) {
      await db.campaignRecipient.createMany({
        data: rows.map((r) => ({ campaignId: c.id, userId: r.id, address: r.address ?? "", status: r.address ? "QUEUED" : "SKIPPED", error: r.address ? null : "Нет адреса в этом канале" })),
        skipDuplicates: true,
      });
    }
    await db.campaign.update({ where: { id: c.id }, data: { audienceCount: rows.length } });
  }
  const link = c.trackingLinkId ? await db.trackingLink.findUnique({ where: { id: c.trackingLinkId } }) : null;
  const linkUrl = link ? `${baseUrl}/go/${link.slug}` : null;
  const queued = await db.campaignRecipient.findMany({ where: { campaignId: c.id, status: "QUEUED" }, include: { user: { include: { loyaltyTier: true } } } });
  for (const r of queued) {
    const unsub =
      c.channel === "EMAIL" ? `Отписаться от рассылок: ${baseUrl}/unsubscribe/${r.user.unsubscribeToken}` : c.channel === "WEBSITE" ? null : "Чтобы отписаться, ответьте СТОП.";
    const text = personalize(c.text, { firstName: r.user.firstName, tier: r.user.loyaltyTier?.name ?? null, points: r.user.pointsBalance }, linkUrl, unsub);
    const res = await sendOne(c.channel, r.address, text, c.subject, r.userId);
    await db.campaignRecipient.update({ where: { id: r.id }, data: res.ok ? { status: "SENT", sentAt: new Date() } : { status: "FAILED", error: res.error } });
  }
  const counts = await db.campaignRecipient.groupBy({ by: ["status"], where: { campaignId: c.id }, _count: true });
  const n = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  return db.campaign.update({
    where: { id: c.id },
    data: { status: "SENT", sentAt: new Date(), sentCount: n("SENT"), failedCount: n("FAILED"), skippedCount: n("SKIPPED") },
  });
}

/** Запланированные рассылки, у которых подошло время. */
export async function runDueCampaigns(baseUrl: string) {
  const due = await db.campaign.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } }, select: { id: true } });
  for (const c of due) await runCampaign(c.id, baseUrl);
  return due.length;
}

/** Готовые сегменты для быстрого старта. */
export const PRESETS: { key: string; name: string; hint: string; segment: Segment }[] = [
  { key: "all", name: "Все с согласием", hint: "Все клиентки, давшие согласие на рассылки", segment: {} },
  { key: "prive", name: "Privé и Maison", hint: "Закрытый показ, предзаказ", segment: { tiers: ["PRIVE", "MAISON"] } },
  { key: "sleeping", name: "Спящие и под угрозой", hint: "Реактивация: без покупок 120–365 дней", segment: { rfm: ["at_risk", "sleeping"] } },
  { key: "expiring", name: "Сгорают баллы", hint: "Баллы сгорят в ближайшие 30 дней", segment: { pointsExpiringDays: 30 } },
  { key: "waitlist", name: "Ждут поступления", hint: "Подписаны на «сообщить о поступлении»", segment: { waitlist: true } },
  { key: "cart", name: "Брошенные корзины", hint: "В корзине есть вещи, заказа за 7 дней не было", segment: { cartAbandoned: true } },
  { key: "new", name: "Новые без покупок", hint: "Зарегистрировались за 30 дней, покупок нет", segment: { registeredDays: 30, rfm: ["prospect"] } },
  { key: "birthday", name: "Дни рождения в этом месяце", hint: "Поздравление и подарочные баллы", segment: { birthdayMonth: new Date().getMonth() + 1 } },
];
