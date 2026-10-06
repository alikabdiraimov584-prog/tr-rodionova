import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { reserveStock, releaseStock, commitSale, returnOrderItems } from "@/lib/stock";
import { earnForOrder, revertOrderPoints, grantReferralBonus, recalcTier, addPoints, maxPointsForOrder } from "@/lib/loyalty";

export const RETURN_WINDOW_DAYS = 14;
import { audit } from "@/lib/audit";
import { currentSession, trackEvent } from "@/lib/web-analytics";
import { notifyOrder } from "@/lib/notifications";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, DeliveryMethod, PaymentMethod } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["PAID", "CANCELLED"],
  PAID: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKING", "CANCELLED"],
  PACKING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["COMPLETED", "RETURNED"],
  COMPLETED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

/** Деньги к возврату за позиции на сумму returnedValue (по ценам): пропорционально фактически оплаченной деньгами части без доставки. */
export function refundFor(order: { subtotal: number; total: number; deliveryCost: number }, returnedValue: number) {
  if (!order.subtotal) return 0;
  return Math.round((returnedValue * Math.max(0, order.total - order.deliveryCost)) / order.subtotal);
}

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return ORDER_TRANSITIONS[from].includes(to);
}

export async function addOrderEvent(tx: Tx, orderId: string, message: string, status?: OrderStatus | null, createdBy?: string | null) {
  await tx.orderEvent.create({ data: { orderId, message, status: status ?? null, createdBy: createdBy ?? null } });
}

// ───────────── Расчёт корзины ─────────────

export type CartLine = {
  variantId: string;
  quantity: number;
  price: number;
  costPrice: number | null;
  productName: string;
  size: string;
  color: string | null;
  sku: string;
  available: number;
  isPreorder: boolean;
};

export async function loadCart(userId: string): Promise<CartLine[]> {
  const items = await db.cartItem.findMany({
    where: { userId },
    include: { variant: { include: { product: true } } },
    orderBy: { id: "asc" },
  });
  return items
    .filter((i) => i.variant.product.status === "ACTIVE")
    .map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
      price: i.variant.price ?? i.variant.product.price,
      costPrice: i.variant.product.costPrice,
      productName: i.variant.product.name,
      size: i.variant.size,
      color: i.variant.color,
      sku: i.variant.sku,
      available: i.variant.product.isPreorder ? 999 : i.variant.stock - i.variant.reserved,
      isPreorder: i.variant.product.isPreorder,
    }));
}

export type PromoResult =
  | { ok: true; promo: { id: string; code: string; type: "PERCENT" | "FIXED" | "FREE_SHIPPING"; value: number }; discount: number; freeShipping: boolean }
  | { ok: false; error: string };

export async function evaluatePromo(code: string | null | undefined, subtotal: number, userId?: string | null): Promise<PromoResult | null> {
  if (!code) return null;
  const promo = await db.promoCode.findUnique({ where: { code: code.trim().toUpperCase() }, include: { _count: { select: { uses: true } } } });
  if (!promo || !promo.isActive) return { ok: false, error: "Промокод не найден" };
  const now = new Date();
  if (promo.startsAt && promo.startsAt > now) return { ok: false, error: "Промокод ещё не действует" };
  if (promo.endsAt && promo.endsAt < now) return { ok: false, error: "Срок действия промокода истёк" };
  if (promo.maxUses && promo._count.uses >= promo.maxUses) return { ok: false, error: "Лимит использований исчерпан" };
  if (subtotal < promo.minSubtotal) return { ok: false, error: `Промокод действует от ${Math.round(promo.minSubtotal / 100).toLocaleString("ru-RU")} ₽` };
  if (userId) {
    const used = await db.promoUse.count({ where: { promoId: promo.id, userId } });
    if (used >= promo.perUser) return { ok: false, error: "Вы уже использовали этот промокод" };
  }
  let discount = 0;
  if (promo.type === "PERCENT") discount = Math.round((subtotal * promo.value) / 100);
  if (promo.type === "FIXED") discount = Math.min(subtotal, promo.value);
  return { ok: true, promo: { id: promo.id, code: promo.code, type: promo.type, value: promo.value }, discount, freeShipping: promo.type === "FREE_SHIPPING" };
}

export async function deliveryCost(method: DeliveryMethod, subtotalAfterDiscount: number, opts: { freeShipping?: boolean }) {
  if (method === "PICKUP" || opts.freeShipping) return 0;
  const d = await getSetting("delivery");
  if (subtotalAfterDiscount >= d.freeFrom) return 0;
  const map: Record<Exclude<DeliveryMethod, "PICKUP">, number> = { COURIER: d.courier, CDEK: d.cdek, BOXBERRY: d.boxberry, YANDEX: d.yandex };
  return map[method];
}

export type GiftResult =
  | { ok: true; card: { id: string; code: string; balance: number } }
  | { ok: false; error: string };

export function normalizeGiftCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** Проверка подарочного сертификата: активен, с остатком, не истёк. */
export async function evaluateGift(code: string | null | undefined, client: Tx | typeof db = db): Promise<GiftResult | null> {
  if (!code || !code.trim()) return null;
  const card = await client.giftCard.findUnique({ where: { code: normalizeGiftCode(code) } });
  if (!card) return { ok: false, error: "Сертификат не найден" };
  if (card.status === "PENDING") return { ok: false, error: "Сертификат ещё не оплачен" };
  if (card.status === "CANCELLED") return { ok: false, error: "Сертификат отменён" };
  if (card.status === "EXPIRED" || card.expiresAt < new Date()) return { ok: false, error: "Срок действия сертификата истёк" };
  if (card.status === "USED" || card.balance <= 0) return { ok: false, error: "Сертификат уже использован полностью" };
  return { ok: true, card: { id: card.id, code: card.code, balance: card.balance } };
}

export type Quote = {
  lines: CartLine[];
  subtotal: number;
  discount: number;
  promo: PromoResult | null;
  pointsMax: number;
  pointsUsed: number;
  pointsValue: number;
  delivery: number;
  total: number;
  freeShippingByTier: boolean;
  /** Код сертификата, если он прошёл проверку */
  giftCode?: string | null;
  giftCardId?: string | null;
  /** Сколько списано с сертификата, копейки */
  giftApplied: number;
  giftError: string | null;
};

export async function quoteCart(
  userId: string,
  input: { promoCode?: string | null; pointsToUse?: number; deliveryMethod: DeliveryMethod; giftCode?: string | null },
): Promise<Quote> {
  const lines = await loadCart(userId);
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const promo = await evaluatePromo(input.promoCode, subtotal, userId);
  const discount = promo?.ok ? promo.discount : 0;
  const afterDiscount = subtotal - discount;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { loyaltyTier: true } });
  const pointsMax = await maxPointsForOrder(userId, afterDiscount);
  const pointsUsed = Math.max(0, Math.min(pointsMax, Math.floor(input.pointsToUse ?? 0)));
  const s = await getSetting("loyalty");
  const pointsValue = pointsUsed * s.pointValueKopecks;
  const freeShippingByTier = !!user.loyaltyTier?.freeShipping;
  const delivery = await deliveryCost(input.deliveryMethod, afterDiscount, { freeShipping: freeShippingByTier || (promo?.ok && promo.freeShipping) });
  // к оплате после промокода и баллов, включая доставку — именно это покрывает сертификат
  const toPay = Math.max(0, afterDiscount - pointsValue) + delivery;
  const gift = await evaluateGift(input.giftCode);
  const giftApplied = gift?.ok ? Math.min(gift.card.balance, toPay) : 0;
  const total = toPay - giftApplied;
  return {
    lines,
    subtotal,
    discount,
    promo,
    pointsMax,
    pointsUsed,
    pointsValue,
    delivery,
    total,
    freeShippingByTier,
    giftCode: gift?.ok ? gift.card.code : null,
    giftCardId: gift?.ok ? gift.card.id : null,
    giftApplied,
    giftError: gift && !gift.ok ? gift.error : null,
  };
}

// ───────────── Создание заказа ─────────────

export type CheckoutInput = {
  email: string;
  phone: string;
  firstName: string;
  lastName?: string | null;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  addressId?: string | null;
  addressText?: string | null;
  comment?: string | null;
  promoCode?: string | null;
  pointsToUse?: number;
  giftCode?: string | null;
  fittingRequested?: boolean;
  deliverySlot?: string | null;
};

/** Котировка корзины гостя: без баллов и уровня, промокод и сертификат работают. */
export async function quoteGuestCart(token: string | null, input: { promoCode?: string | null; deliveryMethod: DeliveryMethod; giftCode?: string | null }) {
  const { guestCartItems } = await import("@/lib/guest-cart");
  const items = await guestCartItems(token);
  const lines: CartLine[] = items
    .filter((i) => i.variant.product.status === "ACTIVE")
    .map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
      price: i.variant.price ?? i.variant.product.price,
      costPrice: i.variant.product.costPrice,
      productName: i.variant.product.name,
      size: i.variant.size,
      color: i.variant.color,
      sku: i.variant.sku,
      available: i.variant.product.isPreorder ? 999 : i.variant.stock - i.variant.reserved,
      isPreorder: i.variant.product.isPreorder,
    }));
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const promo = await evaluatePromo(input.promoCode, subtotal, null);
  const discount = promo?.ok ? promo.discount : 0;
  const afterDiscount = subtotal - discount;
  const delivery = await deliveryCost(input.deliveryMethod, afterDiscount, { freeShipping: !!(promo?.ok && promo.freeShipping) });
  const toPay = afterDiscount + delivery;
  const gift = await evaluateGift(input.giftCode);
  const giftApplied = gift?.ok ? Math.min(gift.card.balance, toPay) : 0;
  const total = toPay - giftApplied;
  const quote: Quote = { lines, subtotal, discount, promo, pointsMax: 0, pointsUsed: 0, pointsValue: 0, delivery, total, freeShippingByTier: false, giftCode: gift?.ok ? gift.card.code : null, giftCardId: gift?.ok ? gift.card.id : null, giftApplied, giftError: gift && !gift.ok ? gift.error : null };
  return quote;
}

export async function createOrderFromCart(userId: string, input: CheckoutInput) {
  const quote = await quoteCart(userId, input);
  if (quote.lines.length === 0) throw new Error("Корзина пуста");
  for (const l of quote.lines) {
    if (l.available < l.quantity) throw new Error(`«${l.productName}», размер ${l.size}: доступно ${Math.max(0, l.available)} шт.`);
  }
  if (input.deliveryMethod !== "PICKUP" && !input.addressId && !input.addressText) throw new Error("Укажите адрес доставки");
  if (input.addressId) {
    const own = await db.address.count({ where: { id: input.addressId, userId } });
    if (!own) throw new Error("Адрес не найден");
  }
  if (input.giftCode && quote.giftError) throw new Error(quote.giftError);

  const session = await currentSession();
  const order = await db.$transaction(async (tx) => {
    // Сертификат перепроверяем внутри транзакции: остаток мог измениться
    let giftUsed = 0;
    let giftCardId: string | null = null;
    if (quote.giftCardId && quote.giftApplied > 0) {
      const gift = await evaluateGift(quote.giftCode, tx);
      if (!gift || !gift.ok) throw new Error(gift && !gift.ok ? gift.error : "Сертификат недоступен");
      if (gift.card.balance < quote.giftApplied) throw new Error("Остаток сертификата изменился, обновите страницу");
      giftUsed = quote.giftApplied;
      giftCardId = gift.card.id;
    }
    const order = await tx.order.create({
      data: {
        userId,
        isPreorder: quote.lines.some((l) => l.isPreorder),
        sessionId: session?.id ?? null,
        channel: session?.channel ?? null,
        source: session?.source ?? null,
        medium: session?.medium ?? null,
        campaign: session?.campaign ?? null,
        email: input.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        deliveryMethod: input.deliveryMethod,
        addressId: input.addressId ?? null,
        addressText: input.addressText ?? null,
        deliveryCost: quote.delivery,
        subtotal: quote.subtotal,
        discount: quote.discount + quote.pointsValue,
        pointsUsed: quote.pointsUsed,
        giftUsed,
        total: quote.total,
        promoCodeId: quote.promo?.ok ? quote.promo.promo.id : null,
        comment: input.comment ?? null,
        fittingRequested: !!input.fittingRequested,
        deliverySlot: input.deliverySlot ?? null,
        items: {
          create: quote.lines.map((l) => ({
            variantId: l.variantId,
            productName: l.productName,
            size: l.size,
            color: l.color,
            sku: l.sku,
            price: l.price,
            costPrice: l.costPrice,
            quantity: l.quantity,
            isPreorder: l.isPreorder,
          })),
        },
        payments: { create: { method: input.paymentMethod, amount: quote.total, status: "PENDING" } },
      },
    });
    for (const l of quote.lines) if (!l.isPreorder) await reserveStock(tx, l.variantId, l.quantity, order.id);
    if (quote.pointsUsed > 0) {
      await addPoints(tx, userId, "SPEND_PURCHASE", -quote.pointsUsed, { orderId: order.id, comment: `Оплата заказа №${order.number}`, expiresAt: null });
    }
    if (quote.promo?.ok) {
      // блокируем строку промокода, чтобы лимиты использований не обходились параллельными заказами
      const promoId = quote.promo.promo.id;
      await tx.$executeRaw`SELECT "id" FROM "PromoCode" WHERE "id" = ${promoId} FOR UPDATE`;
      const promo = await tx.promoCode.findUniqueOrThrow({ where: { id: promoId }, include: { _count: { select: { uses: true } } } });
      if (promo.maxUses && promo._count.uses >= promo.maxUses) throw new Error("Лимит использований промокода исчерпан");
      const mine = await tx.promoUse.count({ where: { promoId, userId } });
      if (mine >= promo.perUser) throw new Error("Вы уже использовали этот промокод");
      await tx.promoUse.create({ data: { promoId, userId, orderId: order.id } });
    }
    if (giftCardId && giftUsed > 0) {
      // списание с сертификата — одним UPDATE с условием по остатку
      const debited = await tx.giftCard.updateMany({
        where: { id: giftCardId, status: "ACTIVE", balance: { gte: giftUsed } },
        data: { balance: { decrement: giftUsed } },
      });
      if (debited.count === 0) throw new Error("Остаток сертификата изменился, обновите страницу");
      const card = await tx.giftCard.findUniqueOrThrow({ where: { id: giftCardId } });
      await tx.giftRedemption.create({ data: { giftCardId, orderId: order.id, amount: giftUsed } });
      if (card.balance <= 0) await tx.giftCard.update({ where: { id: giftCardId }, data: { balance: 0, status: "USED" } });
      await audit(userId, "giftcard.redeem", "GiftCard", giftCardId, { orderId: order.id, amount: giftUsed }, tx);
    }
    await tx.cartItem.deleteMany({ where: { userId } });
    await addOrderEvent(tx, order.id, giftUsed > 0 ? `Заказ создан, сертификатом оплачено ${Math.round(giftUsed / 100).toLocaleString("ru-RU")} ₽` : "Заказ создан", "NEW", userId);
    await audit(userId, "order.create", "Order", order.id, { total: quote.total, giftUsed }, tx);
    return order;
  });
  await trackEvent("ORDER", { orderId: order.id, value: order.total, userId });
  if (order.total === 0) await markOrderPaid(order.id, { externalId: "gift" });
  else void notifyOrder(order.id, "ORDER_CREATED");
  return order;
}

// ───────────── Оплата и статусы ─────────────

/** Блокировка строки заказа на время смены статуса: параллельные переходы (вебхук оплаты и отмена, оплата и возврат на страницу) идут по очереди и видят актуальный статус. */
async function lockOrder(tx: Tx, orderId: string) {
  await tx.$executeRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
}

export async function markOrderPaid(orderId: string, opts: { createdBy?: string | null; externalId?: string | null } = {}) {
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "NEW") throw new Error("Заказ уже оплачен или отменён");
    await tx.order.update({ where: { id: orderId }, data: { status: "PAID", paidAt: new Date() } });
    const pending = await tx.payment.findFirst({ where: { orderId, status: "PENDING" } });
    if (pending) {
      await tx.payment.update({ where: { id: pending.id }, data: { status: "SUCCEEDED", externalId: opts.externalId ?? `manual_${Date.now()}` } });
    }
    await commitSale(tx, orderId, opts.createdBy);
    const cogs = order.items.reduce((s, i) => s + (i.costPrice ?? 0) * i.quantity, 0);
    await tx.ledgerEntry.createMany({
      data: [
        { type: "INCOME_SALE", amount: order.total, orderId, comment: `Заказ №${order.number}`, createdBy: opts.createdBy },
        ...(cogs > 0 ? [{ type: "EXPENSE_COGS" as const, amount: cogs, orderId, comment: `Себестоимость заказа №${order.number}`, createdBy: opts.createdBy }] : []),
        ...(pending && (pending.method === "CARD" || pending.method === "SBP" || pending.method === "INSTALLMENT")
          ? [{ type: "EXPENSE_ACQUIRING" as const, amount: Math.round(order.total * (pending.method === "SBP" ? 0.007 : 0.025)), orderId, comment: `Эквайринг заказа №${order.number}`, createdBy: opts.createdBy }]
          : []),
      ],
    });
    if (order.userId) await recalcTier(tx, order.userId);
    await addOrderEvent(tx, orderId, "Оплата получена", "PAID", opts.createdBy);
    await audit(opts.createdBy ?? null, "order.paid", "Order", orderId, undefined, tx);
  });
  void notifyOrder(orderId, "ORDER_PAID");
}

/** Сторно себестоимости за позиции, вернувшиеся на склад: иначе P&L занижает маржу. */
async function reverseCogs(tx: Tx, order: { id: string; number: number }, lines: { costPrice: number | null; qty: number }[], comment: string, createdBy?: string | null) {
  const amount = lines.reduce((s, l) => s + (l.costPrice ?? 0) * Math.max(0, l.qty), 0);
  if (amount > 0) await tx.ledgerEntry.create({ data: { type: "COGS_REVERSAL", amount, orderId: order.id, comment, createdBy } });
}

/**
 * Возвращает на сертификат списанное по заказу: целиком (отмена, полный возврат) или долю `share` (0–1) при частичном
 * возврате. Уже возвращённое учитывается (записи с отрицательной суммой), повторный вызов ничего не добавляет.
 */
async function restoreGiftForOrder(tx: Tx, orderId: string, createdBy?: string | null, share = 1) {
  const redemptions = await tx.giftRedemption.findMany({ where: { orderId }, include: { giftCard: true } });
  const byCard = new Map<string, { card: (typeof redemptions)[number]["giftCard"]; used: number; restored: number }>();
  for (const r of redemptions) {
    const e = byCard.get(r.giftCardId) ?? { card: r.giftCard, used: 0, restored: 0 };
    if (r.amount > 0) e.used += r.amount;
    else e.restored += -r.amount;
    byCard.set(r.giftCardId, e);
  }
  for (const { card, used, restored } of byCard.values()) {
    const target = Math.min(used, Math.round(used * Math.min(1, Math.max(0, share))));
    const amount = target - restored;
    if (amount <= 0) continue;
    const reactivate = card.status === "USED" && card.expiresAt > new Date();
    await tx.giftCard.update({
      where: { id: card.id },
      data: { balance: { increment: amount }, ...(reactivate ? { status: "ACTIVE" } : {}) },
    });
    // помечаем возврат отдельной записью с отрицательной суммой, чтобы история списаний сохранилась
    await tx.giftRedemption.create({ data: { giftCardId: card.id, orderId, amount: -amount } });
    await audit(createdBy ?? null, "giftcard.restore", "GiftCard", card.id, { orderId, amount }, tx);
  }
}

export async function cancelOrder(orderId: string, opts: { reason?: string; createdBy?: string | null } = {}) {
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!canTransition(order.status, "CANCELLED")) throw new Error("Заказ нельзя отменить на этом этапе");
    if (order.status === "NEW") {
      for (const it of order.items) if (!it.isPreorder) await releaseStock(tx, it.variantId, it.quantity, orderId, opts.createdBy);
      await tx.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "FAILED" } });
    } else {
      // Оплаченный заказ — товар возвращается на склад, деньги — клиенту
      await returnOrderItems(
        tx,
        orderId,
        order.items.map((i) => ({ orderItemId: i.id, qty: i.quantity - i.returnedQty })),
        { reason: "Отмена оплаченного заказа", createdBy: opts.createdBy },
      );
      await tx.payment.updateMany({ where: { orderId, status: "SUCCEEDED" }, data: { status: "REFUNDED" } });
      await tx.ledgerEntry.create({ data: { type: "REFUND", amount: order.total, orderId, comment: `Отмена заказа №${order.number}`, createdBy: opts.createdBy } });
      await reverseCogs(tx, order, order.items.filter((i) => !i.isPreorder).map((i) => ({ costPrice: i.costPrice, qty: i.quantity - i.returnedQty })), `Сторно себестоимости: отмена заказа №${order.number}`, opts.createdBy);
    }
    if (order.userId) await revertOrderPoints(tx, orderId, opts.createdBy);
    await restoreGiftForOrder(tx, orderId, opts.createdBy);
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
    if (order.userId) await recalcTier(tx, order.userId);
    await addOrderEvent(tx, orderId, opts.reason ? `Заказ отменён: ${opts.reason}` : "Заказ отменён", "CANCELLED", opts.createdBy);
    await audit(opts.createdBy ?? null, "order.cancel", "Order", orderId, { reason: opts.reason ?? null }, tx);
  });
  void notifyOrder(orderId, "ORDER_CANCELLED");
  // заявка Долями (если была) снимается, пока не подтверждена
  void import("@/lib/payments/provider").then((p) => p.onOrderCancelled(orderId));
}

export async function setOrderStatus(orderId: string, status: OrderStatus, opts: { createdBy?: string | null; trackingNumber?: string | null; note?: string } = {}) {
  if (status === "CANCELLED") return cancelOrder(orderId, { createdBy: opts.createdBy, reason: opts.note });
  if (status === "PAID") return markOrderPaid(orderId, { createdBy: opts.createdBy });
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!canTransition(order.status, status)) throw new Error(`Переход ${order.status} → ${status} недопустим`);
    if (status === "RETURNED") {
      const alreadyReturned = order.items.reduce((s, i) => s + i.price * i.returnedQty, 0);
      await returnOrderItems(
        tx,
        orderId,
        order.items.map((i) => ({ orderItemId: i.id, qty: i.quantity - i.returnedQty })),
        { reason: opts.note ?? "Полный возврат", createdBy: opts.createdBy },
      );
      // возвращаем оплаченное деньгами за товары (без доставки) за вычетом уже возвращённого ранее
      const refund = Math.max(0, order.total - order.deliveryCost) - refundFor(order, alreadyReturned);
      await tx.payment.updateMany({ where: { orderId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } }, data: { status: "REFUNDED" } });
      if (refund > 0) await tx.ledgerEntry.create({ data: { type: "REFUND", amount: refund, orderId, comment: `Возврат по заказу №${order.number}`, createdBy: opts.createdBy } });
      await reverseCogs(tx, order, order.items.filter((i) => !i.isPreorder).map((i) => ({ costPrice: i.costPrice, qty: i.quantity - i.returnedQty })), `Сторно себестоимости: возврат по заказу №${order.number}`, opts.createdBy);
      if (order.userId) await revertOrderPoints(tx, orderId, opts.createdBy);
      // оплаченное сертификатом возвращается на сертификат
      await restoreGiftForOrder(tx, orderId, opts.createdBy);
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        ...(status === "COMPLETED" ? { completedAt: new Date() } : {}),
        ...(opts.trackingNumber !== undefined ? { trackingNumber: opts.trackingNumber } : {}),
      },
    });
    if (order.userId && status === "COMPLETED") {
      await earnForOrder(tx, orderId);
      await grantReferralBonus(tx, orderId);
    }
    if (order.userId && status === "RETURNED") await recalcTier(tx, order.userId);
    await addOrderEvent(tx, orderId, opts.note ?? `Статус изменён`, status, opts.createdBy);
    await audit(opts.createdBy ?? null, "order.status", "Order", orderId, { status }, tx);
  });
  const notifyFor: Partial<Record<OrderStatus, Parameters<typeof notifyOrder>[1]>> = { SHIPPED: "ORDER_SHIPPED", DELIVERED: "ORDER_DELIVERED", COMPLETED: "ORDER_COMPLETED" };
  if (notifyFor[status]) void notifyOrder(orderId, notifyFor[status]);
  // 54-ФЗ: при вручении предоплаченного заказа — второй чек «полный расчёт» с зачётом предоплаты
  if (status === "DELIVERED") void import("@/lib/payments/fiscal").then((m) => m.issueReceiptInBackground(orderId, "settlement", opts.createdBy));
}

/** Частичный возврат отдельных позиций (из CRM). */
export async function partialReturn(orderId: string, lines: { orderItemId: string; qty: number }[], opts: { reason?: string; createdBy?: string | null; restock?: boolean }) {
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!canTransition(order.status, "RETURNED")) throw new Error("Возврат возможен только после доставки");
    const value = await returnOrderItems(tx, orderId, lines, opts);
    if (value > 0) {
      const refund = refundFor(order, value);
      if (refund > 0) await tx.ledgerEntry.create({ data: { type: "REFUND", amount: refund, orderId, comment: `Частичный возврат по заказу №${order.number}`, createdBy: opts.createdBy } });
      if (opts.restock !== false) {
        const byId = new Map(order.items.map((i) => [i.id, i]));
        await reverseCogs(
          tx,
          order,
          lines.map((l) => ({ costPrice: byId.get(l.orderItemId)?.costPrice ?? null, qty: byId.get(l.orderItemId)?.isPreorder ? 0 : l.qty })),
          `Сторно себестоимости: частичный возврат по заказу №${order.number}`,
          opts.createdBy,
        );
      }
      const items = await tx.orderItem.findMany({ where: { orderId } });
      const allReturned = items.every((i) => i.returnedQty >= i.quantity);
      // доля сертификата за возвращённые позиции (по всем возвратам этого заказа) возвращается на сертификат
      const returnedValue = items.reduce((s, i) => s + i.price * i.returnedQty, 0);
      await restoreGiftForOrder(tx, orderId, opts.createdBy, allReturned ? 1 : returnedValue / Math.max(1, order.subtotal));
      await tx.payment.updateMany({ where: { orderId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } }, data: { status: allReturned ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
      if (allReturned) {
        await tx.order.update({ where: { id: orderId }, data: { status: "RETURNED" } });
        await addOrderEvent(tx, orderId, "Все позиции возвращены", "RETURNED", opts.createdBy);
      }
      if (order.userId) {
        if (allReturned) {
          await revertOrderPoints(tx, orderId, opts.createdBy);
        } else {
          // списанные баллы возвращаем пропорционально возвращённым позициям
          const pointsBack = Math.floor((order.pointsUsed * value) / Math.max(1, order.subtotal));
          if (pointsBack > 0) await addPoints(tx, order.userId, "EARN_MANUAL", pointsBack, { orderId, comment: `Возврат баллов за позиции заказа №${order.number}`, createdBy: opts.createdBy });
        }
        if (!allReturned && order.pointsEarned > 0) {
          // та же база, что при начислении (earnBase): доля возвращённых позиций от стоимости товаров
          const revert = Math.min(order.pointsEarned, Math.floor((order.pointsEarned * value) / Math.max(1, order.subtotal)));
          const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
          const amount = -Math.min(revert, user.pointsBalance);
          if (amount) await addPoints(tx, order.userId, "REVERT", amount, { orderId, comment: `Частичный возврат по заказу №${order.number}`, createdBy: opts.createdBy, expiresAt: null });
        }
        await recalcTier(tx, order.userId);
      }
    }
    await addOrderEvent(tx, orderId, `Возврат позиций: к выплате ${Math.round(refundFor(order, value) / 100).toLocaleString("ru-RU")} ₽`, null, opts.createdBy);
    await audit(opts.createdBy ?? null, "order.partialReturn", "Order", orderId, { lines, value }, tx);
    return value;
  });
}

// ───────────── Продажа в шоуруме (из CRM) ─────────────

export type ManualOrderInput = {
  userId: string | null;
  firstName: string;
  lastName?: string | null;
  email: string;
  phone: string;
  lines: { variantId: string; quantity: number; price?: number | null }[];
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  addressText?: string | null;
  pointsToUse?: number;
  discount?: number;
  comment?: string | null;
  markPaid: boolean;
  createdBy: string;
};

export async function createManualOrder(input: ManualOrderInput) {
  const lines = input.lines.filter((l) => l.variantId && l.quantity > 0);
  if (lines.length === 0) throw new Error("Добавьте хотя бы одну позицию");
  const variants = await db.productVariant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, include: { product: true } });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const items = lines.map((l) => {
    const v = byId.get(l.variantId);
    if (!v) throw new Error("Вариант товара не найден");
    if (v.stock - v.reserved < l.quantity) throw new Error(`«${v.product.name}» ${v.size}: свободно ${v.stock - v.reserved} шт.`);
    return { v, quantity: l.quantity, price: l.price && l.price > 0 ? l.price : (v.price ?? v.product.price) };
  });
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = Math.min(subtotal, Math.max(0, input.discount ?? 0));
  let pointsUsed = 0;
  if (input.userId && input.pointsToUse) {
    const max = await maxPointsForOrder(input.userId, subtotal - discount);
    pointsUsed = Math.min(max, Math.floor(input.pointsToUse));
  }
  const s = await getSetting("loyalty");
  const total = Math.max(0, subtotal - discount - pointsUsed * s.pointValueKopecks);
  const order = await db.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: {
        userId: input.userId,
        email: input.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        deliveryMethod: input.deliveryMethod,
        addressText: input.addressText ?? null,
        subtotal,
        discount: discount + pointsUsed * s.pointValueKopecks,
        pointsUsed,
        total,
        comment: input.comment ?? null,
        managerNote: "Создан в CRM",
        items: {
          create: items.map((i) => ({
            variantId: i.v.id,
            productName: i.v.product.name,
            size: i.v.size,
            color: i.v.color,
            sku: i.v.sku,
            price: i.price,
            costPrice: i.v.product.costPrice,
            quantity: i.quantity,
          })),
        },
        payments: { create: { method: input.paymentMethod, amount: total, status: "PENDING" } },
      },
    });
    for (const i of items) await reserveStock(tx, i.v.id, i.quantity, o.id);
    if (pointsUsed > 0 && input.userId) {
      await addPoints(tx, input.userId, "SPEND_PURCHASE", -pointsUsed, { orderId: o.id, comment: `Оплата заказа №${o.number}`, createdBy: input.createdBy, expiresAt: null });
    }
    await addOrderEvent(tx, o.id, "Заказ создан менеджером", "NEW", input.createdBy);
    await audit(input.createdBy, "order.createManual", "Order", o.id, { total }, tx);
    return o;
  });
  if (input.markPaid) await markOrderPaid(order.id, { createdBy: input.createdBy, externalId: "pos" });
  return order;
}
