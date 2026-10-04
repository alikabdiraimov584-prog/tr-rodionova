import "server-only";
import { db } from "@/lib/db";

/**
 * Товар снова в наличии: пишем каждой ожидающей клиентке в чат личного кабинета
 * и ставим менеджеру задачу позвонить VIP-клиенткам.
 */
export async function notifyWaitlist(variantId: string) {
  const v = await db.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
  if (v.stock - v.reserved <= 0) return 0;
  const subs = await db.stockSubscription.findMany({ where: { variantId, notifiedAt: null }, include: { user: { include: { loyaltyTier: true } } } });
  for (const s of subs) {
    const text = `${s.user.firstName}, «${v.product.name}» в размере ${v.size}${v.color ? `, ${v.color}` : ""} снова в наличии. Отложить для вас? Ответьте на это сообщение. https://tr-rodionova.ru/product/${v.product.slug}`;
    const contact = await db.contact.upsert({
      where: { channel_externalId: { channel: "WEBSITE", externalId: s.userId } },
      update: {},
      create: { channel: "WEBSITE", externalId: s.userId, name: `${s.user.firstName} ${s.user.lastName ?? ""}`.trim(), email: s.user.email, phone: s.user.phone, userId: s.userId },
    });
    let conv = await db.conversation.findFirst({ where: { contactId: contact.id }, orderBy: { lastMessageAt: "desc" } });
    if (!conv) conv = await db.conversation.create({ data: { channel: "WEBSITE", contactId: contact.id, customerId: s.userId, status: "PENDING", tags: ["наличие"] } });
    await db.message.create({ data: { conversationId: conv.id, direction: "OUT", text, status: "SENT" } });
    await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date(), status: conv.status === "OPEN" ? "OPEN" : "PENDING", closedAt: null } });
    if (s.user.loyaltyTier?.code !== "ATELIER") {
      await db.crmTask.create({ data: { title: `Позвонить: поступил ${v.product.name} ${v.size}`, details: `Клиентка ждала поступления с ${s.createdAt.toLocaleDateString("ru-RU")}`, customerId: s.userId, dueAt: new Date(Date.now() + 86_400_000) } });
    }
    await db.stockSubscription.update({ where: { id: s.id }, data: { notifiedAt: new Date() } });
  }
  return subs.length;
}
