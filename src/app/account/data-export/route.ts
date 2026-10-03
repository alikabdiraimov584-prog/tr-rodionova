import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Право на доступ к своим данным (ст. 14 152-ФЗ): клиентка скачивает всё, что о ней хранится,
 * одним JSON-файлом. Служебные поля (хеш пароля, версии сессий) не включаются.
 */
export async function GET() {
  const user = await requireUser("/account/profile");
  const [addresses, orders, points, consents, reviews, wishlist, giftCards, conversations, notifications, selections, resale] = await Promise.all([
    db.address.findMany({ where: { userId: user.id } }),
    db.order.findMany({ where: { userId: user.id }, include: { items: true, payments: { select: { method: true, status: true, amount: true, createdAt: true } }, history: true } }),
    db.pointsTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    db.consent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    db.review.findMany({ where: { userId: user.id } }),
    db.wishlistItem.findMany({ where: { userId: user.id }, include: { product: { select: { name: true, sku: true } } } }),
    db.giftCard.findMany({ where: { purchaserId: user.id }, select: { code: true, amount: true, balance: true, status: true, recipientName: true, recipientEmail: true, expiresAt: true, createdAt: true } }),
    db.conversation.findMany({ where: { customerId: user.id }, include: { messages: { where: { direction: { in: ["IN", "OUT", "SYSTEM"] } }, orderBy: { createdAt: "asc" }, select: { direction: true, text: true, createdAt: true } } } }),
    db.notification.findMany({ where: { userId: user.id }, select: { event: true, channel: true, address: true, subject: true, status: true, createdAt: true } }),
    db.selection.findMany({ where: { userId: user.id }, include: { items: true } }).catch(() => []),
    db.resaleRequest.findMany({ where: { userId: user.id } }).catch(() => []),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    profile: {
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      birthday: user.birthday,
      measurements: { height: user.height, bust: user.bust, waist: user.waist, hips: user.hips, preferredSize: user.preferredSize },
      marketingConsent: user.marketingConsent,
      loyalty: { tier: user.loyaltyTier?.name ?? null, pointsBalance: user.pointsBalance, lifetimeSpent: user.lifetimeSpent, yearSpent: user.yearSpent, referralCode: user.referralCode },
      source: user.source,
      createdAt: user.createdAt,
    },
    addresses,
    orders,
    pointsHistory: points,
    consents,
    reviews,
    wishlist,
    giftCards,
    supportConversations: conversations,
    notifications,
    stylistSelections: selections,
    resaleRequests: resale,
  };
  await audit(user.id, "user.dataExport", "User", user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="t-rodionova-my-data-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
