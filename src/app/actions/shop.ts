"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createOrderPayment, ONLINE_PAYMENT_METHODS, onlinePaymentsAvailable, paymentsEnabled } from "@/lib/payments/provider";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentCustomer, getCurrentUser, requireUser } from "@/lib/auth";
import { createOrderFromCart, cancelOrder } from "@/lib/orders";
import { errorMessage, type ActionState } from "@/lib/action-result";
import type { DeliveryMethod, PaymentMethod } from "@/generated/prisma/enums";
import { trackEvent } from "@/lib/web-analytics";
import { addedMessage, addToGuestCart, cartLimit, ensureGuestToken, getGuestToken, setGuestCartQuantity } from "@/lib/guest-cart";
import { hashPassword, loginAs } from "@/lib/auth";
import { addPoints, recalcTier } from "@/lib/loyalty";
import { getSetting } from "@/lib/settings";
import { recordConsent } from "@/lib/consent";
import { audit } from "@/lib/audit";
import { checkRate, clientIp } from "@/lib/ratelimit";
import { activeIntegration } from "@/lib/integrations/store";
import { ingestWebsite } from "@/lib/support/inbox";
import { randomBytes } from "node:crypto";

/**
 * Одна штука выбранного варианта в корзину. code — id варианта (с «|max», если больше добавить нельзя):
 * карточка показывает ответ только пока выбран тот же размер и цвет.
 */
export async function addToCartAction(_: ActionState, formData: FormData): Promise<ActionState> {
  // сотрудник на витрине — гость (как на страницах корзины и оформления), иначе вещь уходит в невидимую корзину
  const user = await getCurrentCustomer();
  const variantId = String(formData.get("variantId") ?? "");
  if (!variantId) return { error: "Выберите размер" };
  if (!user) {
    // корзина без входа: регистрация понадобится только при оформлении
    try {
      const token = await ensureGuestToken();
      const r = await addToGuestCart(token, variantId);
      if (!r.limit) await trackEvent("ADD_TO_CART", { productId: r.variant.productId });
      revalidatePath("/", "layout");
      return { ok: true, code: r.limit ? `${variantId}|max` : variantId, message: addedMessage(r.quantity, r.limit, r.variant.product.isPreorder) };
    } catch (e) {
      return { error: errorMessage(e), code: variantId };
    }
  }
  const variant = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant || variant.product.status !== "ACTIVE") return { error: "Товар недоступен", code: variantId };
  const inCart = await db.cartItem.findUnique({ where: { userId_variantId: { userId: user.id, variantId } } });
  const have = inCart?.quantity ?? 0;
  if (have + 1 > cartLimit(variant)) {
    return have > 0 ? { ok: true, code: `${variantId}|max`, message: addedMessage(have, true, variant.product.isPreorder) } : { error: "Этого размера больше нет в наличии", code: variantId };
  }
  await db.cartItem.upsert({
    where: { userId_variantId: { userId: user.id, variantId } },
    update: { quantity: have + 1 },
    create: { userId: user.id, variantId, quantity: 1 },
  });
  await trackEvent("ADD_TO_CART", { productId: variant.productId, userId: user.id });
  revalidatePath("/", "layout");
  return { ok: true, code: variantId, message: addedMessage(have + 1, false, variant.product.isPreorder) };
}

export async function updateCartAction(formData: FormData) {
  const user = await getCurrentCustomer();
  const variantId = String(formData.get("variantId"));
  const qty = Number(formData.get("quantity"));
  if (!user) {
    const token = await getGuestToken();
    if (token) await setGuestCartQuantity(token, variantId, qty);
    revalidatePath("/", "layout");
    return;
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    await db.cartItem.deleteMany({ where: { userId: user.id, variantId } });
  } else {
    const v = await db.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
    const capped = Math.min(Math.floor(qty), Math.max(1, cartLimit(v)));
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
  deliverySlot: z.string().trim().max(40).optional(),
  consent: z.string().optional(),
  offer: z.string().optional(),
  marketingConsent: z.string().optional(),
  promoCode: z.string().trim().optional(),
  pointsToUse: z.coerce.number().int().min(0).optional(),
  giftCode: z.string().trim().max(32).optional(),
});

/**
 * Гость оформляет заказ без пароля: аккаунт Circle создаётся с первым заказом, вход выполняется сразу.
 * Пароль можно задать позже по ссылке «Забыли пароль» или войти по коду из письма.
 */
async function createAccountForGuest(d: { email: string; phone: string; firstName: string; lastName?: string; marketingConsent?: string }) {
  const ip = await clientIp();
  const rl = await checkRate(`register:ip:${ip ?? "unknown"}`, { limit: 10, windowSec: 3600, lockSec: 3600 });
  if (!rl.ok) throw new Error("Слишком много регистраций с этого адреса. Попробуйте позже.");
  const s = await getSetting("loyalty");
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: d.email.toLowerCase(),
        phone: d.phone,
        firstName: d.firstName,
        lastName: d.lastName || null,
        passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
        source: "Оформление заказа",
        marketingConsent: d.marketingConsent === "on",
      },
    });
    await recordConsent(tx, u.id, "PERSONAL_DATA", true);
    await recordConsent(tx, u.id, "OFFER", true);
    if (d.marketingConsent === "on") await recordConsent(tx, u.id, "MARKETING", true);
    await recalcTier(tx, u.id);
    await addPoints(tx, u.id, "EARN_WELCOME", s.welcomePoints, { comment: "Добро пожаловать в T.Rodionova Circle" });
    await audit(u.id, "auth.register", "User", u.id, { via: "checkout" }, tx);
    return u;
  });
  await loginAs(user.id, user.role, user.sessionVersion);
  await trackEvent("REGISTER", { userId: user.id });
  return user;
}

export async function checkoutAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = CheckoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  // форма, открытая до отключения кассы, не должна создать заказ, который нечем оплатить
  if ((ONLINE_PAYMENT_METHODS as readonly string[]).includes(d.paymentMethod) && !(await onlinePaymentsAvailable())) {
    return { error: "Оплата картой на сайте пока недоступна: выберите «При получении» или «Перевод по реквизитам»" };
  }
  let user = await getCurrentCustomer();
  if (!user) {
    if (d.consent !== "on" || d.offer !== "on") return { error: "Нужно согласие на обработку данных и условия оферты" };
    const email = d.email.toLowerCase();
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return { error: "Этот e-mail уже зарегистрирован. Войдите по коду из письма или по паролю — корзина сохранится.", code: "EXISTS" };
    try {
      user = (await createAccountForGuest(d)) as unknown as NonNullable<typeof user>;
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }
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
      deliverySlot: d.deliveryMethod === "COURIER" || d.deliveryMethod === "YANDEX" ? d.deliverySlot || null : null,
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
  lines: { variantId: string; productName: string; size: string; color: string | null; quantity: number; price: number; isPreorder: boolean }[];
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
  const user = await getCurrentCustomer();
  const { quoteCart, quoteGuestCart } = await import("@/lib/orders");
  const q = user ? await quoteCart(user.id, input) : await quoteGuestCart(await getGuestToken(), input);
  const pct = user?.loyaltyTier?.cashbackPct ?? 3;
  const pointValue = (await getSetting("loyalty")).pointValueKopecks;
  return {
    lines: q.lines.map((l) => ({ variantId: l.variantId, productName: l.productName, size: l.size, color: l.color, quantity: l.quantity, price: l.price, isPreorder: l.isPreorder })),
    subtotal: q.subtotal,
    discount: q.discount,
    promoError: q.promo && !q.promo.ok ? q.promo.error : null,
    promoApplied: q.promo?.ok ? q.promo.promo.code : null,
    pointsMax: q.pointsMax,
    pointsUsed: q.pointsUsed,
    pointsValue: q.pointsValue,
    delivery: q.delivery,
    total: q.total,
    earn: Math.floor((Math.max(0, q.total - q.delivery) * pct) / 100 / pointValue),
    giftCode: q.giftCode ?? null,
    giftApplied: q.giftApplied,
    giftError: q.giftError,
  };
}


/** Подсказки адреса DaData (CRM → Интеграции → DaData). Без ключа возвращает пустой список. */
export async function suggestAddressAction(query: string): Promise<{ value: string; city: string | null; postcode: string | null }[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const i = await activeIntegration("dadata");
  if (!i?.config.token) return [];
  try {
    const res = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Token ${i.config.token}` },
      body: JSON.stringify({ query: q, count: 6, locations: [{ country_iso_code: "RU" }] }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { suggestions?: { value: string; data?: { city?: string | null; settlement?: string | null; postal_code?: string | null } }[] };
    return (json.suggestions ?? []).map((x) => ({ value: x.value, city: x.data?.city ?? x.data?.settlement ?? null, postcode: x.data?.postal_code ?? null }));
  } catch {
    return [];
  }
}

/** Обмен размера после получения: заявка уходит в службу заботы как сообщение от клиентки. */
export async function requestExchangeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/orders");
  const itemId = String(formData.get("orderItemId") ?? "");
  const size = String(formData.get("size") ?? "").trim();
  if (!itemId || !size) return { error: "Выберите размер" };
  const item = await db.orderItem.findUnique({ where: { id: itemId }, include: { order: { select: { id: true, number: true, userId: true, status: true, deliveredAt: true } } } });
  if (!item || item.order.userId !== user.id) return { error: "Позиция не найдена" };
  if (!["DELIVERED", "COMPLETED"].includes(item.order.status)) return { error: "Обмен доступен после получения заказа" };
  if (item.order.deliveredAt && Date.now() - item.order.deliveredAt.getTime() > 14 * 86_400_000) return { error: "Срок обмена 14 дней истёк — напишите в службу заботы" };
  await ingestWebsite(user.id, `Обмен размера по заказу №${item.order.number}: «${item.productName}», ${item.size} → ${size}. Прошу организовать обмен курьером.`);
  revalidatePath(`/account/orders/${item.order.id}`);
  return { ok: true, message: `Заявка на обмен ${item.size} → ${size} принята, менеджер свяжется с вами` };
}
