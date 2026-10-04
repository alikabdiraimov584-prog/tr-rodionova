"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createOrderPayment, paymentsEnabled } from "@/lib/payments/provider";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { createOrderFromCart, cancelOrder } from "@/lib/orders";
import { errorMessage, type ActionState } from "@/lib/action-result";
import type { DeliveryMethod, PaymentMethod } from "@/generated/prisma/enums";
import { trackEvent } from "@/lib/web-analytics";

export async function addToCartAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const slug = String(formData.get("slug") ?? "");
  if (!user) redirect(`/login?next=/product/${slug}`);
  const variantId = String(formData.get("variantId") ?? "");
  if (!variantId) return { error: "Выберите размер" };
  const variant = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant || variant.product.status !== "ACTIVE") return { error: "Товар недоступен" };
  const inCart = await db.cartItem.findUnique({ where: { userId_variantId: { userId: user.id, variantId } } });
  const want = (inCart?.quantity ?? 0) + 1;
  if (!variant.product.isPreorder && variant.stock - variant.reserved < want) return { error: "Этого размера больше нет в наличии" };
  await db.cartItem.upsert({
    where: { userId_variantId: { userId: user.id, variantId } },
    update: { quantity: want },
    create: { userId: user.id, variantId, quantity: 1 },
  });
  await trackEvent("ADD_TO_CART", { productId: variant.productId, userId: user.id });
  revalidatePath("/", "layout");
  return { ok: true, message: "Добавлено в корзину" };
}

export async function updateCartAction(formData: FormData) {
  const user = await requireUser("/cart");
  const variantId = String(formData.get("variantId"));
  const qty = Number(formData.get("quantity"));
  if (!Number.isFinite(qty) || qty <= 0) {
    await db.cartItem.deleteMany({ where: { userId: user.id, variantId } });
  } else {
    const v = await db.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
    const capped = v.product.isPreorder ? Math.min(Math.floor(qty), 5) : Math.min(Math.floor(qty), Math.max(1, v.stock - v.reserved));
    await db.cartItem.updateMany({ where: { userId: user.id, variantId }, data: { quantity: capped } });
  }
  revalidatePath("/", "layout");
}

export async function toggleWishlistAction(formData: FormData) {
  const productId = String(formData.get("productId"));
  const back = String(formData.get("back") ?? "/");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  const existing = await db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId } } });
  if (existing) await db.wishlistItem.delete({ where: { userId_productId: { userId: user.id, productId } } });
  else {
    await db.wishlistItem.create({ data: { userId: user.id, productId } });
    await trackEvent("WISHLIST", { productId, userId: user.id });
  }
  revalidatePath("/", "layout");
}

const CheckoutSchema = z.object({
  firstName: z.string().trim().min(1, "Введите имя"),
  lastName: z.string().trim().optional(),
  email: z.string().trim().email("Неверный email"),
  phone: z.string().trim().min(10, "Введите телефон"),
  deliveryMethod: z.enum(["COURIER", "CDEK", "BOXBERRY", "YANDEX", "PICKUP"]),
  paymentMethod: z.enum(["CARD", "SBP", "INSTALLMENT", "CASH_ON_DELIVERY", "MANUAL"]),
  addressId: z.string().optional(),
  addressText: z.string().trim().optional(),
  comment: z.string().trim().max(500).optional(),
  fittingRequested: z.string().optional(),
  promoCode: z.string().trim().optional(),
  pointsToUse: z.coerce.number().int().min(0).optional(),
  giftCode: z.string().trim().max(32).optional(),
});

export async function checkoutAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/checkout");
  const parsed = CheckoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let orderId: string;
  try {
    const order = await createOrderFromCart(user.id, {
      ...d,
      deliveryMethod: d.deliveryMethod as DeliveryMethod,
      paymentMethod: d.paymentMethod as PaymentMethod,
      addressId: d.addressId || null,
      addressText: d.addressText || null,
      promoCode: d.promoCode || null,
      giftCode: d.giftCode || null,
      fittingRequested: d.deliveryMethod === "COURIER" && d.fittingRequested === "on",
    });
    orderId = order.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  // онлайн-оплата: сразу на платёжную страницу, без лишнего экрана между подтверждением и оплатой
  if (d.paymentMethod === "CARD" || d.paymentMethod === "SBP" || d.paymentMethod === "INSTALLMENT") {
    if (await paymentsEnabled()) {
      try {
        const h = await headers();
        const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
        const url = await createOrderPayment(orderId, `${base}/account/orders/${orderId}?paid=1`);
        redirect(url);
      } catch (e) {
        if (isRedirectError(e)) throw e;
        // провайдер не ответил: заказ создан, оплатить можно со страницы заказа
      }
    }
  }
  redirect(`/account/orders/${orderId}?created=1`);
}

async function ownOrder(orderId: string) {
  const user = await requireUser("/account/orders");
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) throw new Error("Заказ не найден");
  return { user, order };
}

export async function cancelOwnOrderAction(formData: FormData) {
  const { user, order } = await ownOrder(String(formData.get("orderId")));
  if (order.status !== "NEW") throw new Error("Оплаченный заказ можно отменить через менеджера");
  await cancelOrder(order.id, { createdBy: user.id, reason: "Отменён клиентом" });
  revalidatePath(`/account/orders/${order.id}`);
  revalidatePath("/account", "layout");
}

const ReviewSchema = z.object({
  productId: z.string(),
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().trim().max(2000).optional(),
});

export async function leaveReviewAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = ReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Поставьте оценку" };
  const bought = await db.orderItem.findFirst({
    where: { variant: { productId: parsed.data.productId }, order: { userId: user.id, status: { in: ["DELIVERED", "COMPLETED"] } } },
  });
  if (!bought) return { error: "Отзыв можно оставить после получения заказа" };
  const exists = await db.review.findFirst({ where: { userId: user.id, productId: parsed.data.productId } });
  if (exists) return { error: "Вы уже оставили отзыв на это изделие" };
  await db.review.create({ data: { userId: user.id, productId: parsed.data.productId, rating: parsed.data.rating, text: parsed.data.text || null } });
  revalidatePath("/account/orders");
  return { ok: true, message: "Спасибо! Баллы начислятся после модерации." };
}

export type QuoteView = {
  subtotal: number;
  discount: number;
  promoError: string | null;
  promoApplied: string | null;
  pointsMax: number;
  pointsUsed: number;
  pointsValue: number;
  delivery: number;
  total: number;
  earn: number;
  giftCode: string | null;
  giftApplied: number;
  giftError: string | null;
};

export async function quoteAction(input: { promoCode?: string; pointsToUse?: number; deliveryMethod: DeliveryMethod; giftCode?: string }): Promise<QuoteView> {
  const user = await requireUser("/checkout");
  const { quoteCart } = await import("@/lib/orders");
  const q = await quoteCart(user.id, input);
  const pct = user.loyaltyTier?.cashbackPct ?? 3;
  return {
    subtotal: q.subtotal,
    discount: q.discount,
    promoError: q.promo && !q.promo.ok ? q.promo.error : null,
    promoApplied: q.promo?.ok ? q.promo.promo.code : null,
    pointsMax: q.pointsMax,
    pointsUsed: q.pointsUsed,
    pointsValue: q.pointsValue,
    delivery: q.delivery,
    total: q.total,
    earn: Math.floor((Math.max(0, q.total - q.delivery) * pct) / 100 / 100),
    giftCode: q.giftCode ?? null,
    giftApplied: q.giftApplied,
    giftError: q.giftError,
  };
}
