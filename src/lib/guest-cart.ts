import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Корзина без входа. Токен в httpOnly-cookie tr_cart (90 дней); позиции в GuestCartItem.
 * При входе или регистрации mergeGuestCart переносит их в корзину аккаунта.
 */
export const GUEST_CART_COOKIE = "tr_cart";
const DAYS = 90;

export async function getGuestToken() {
  return (await cookies()).get(GUEST_CART_COOKIE)?.value ?? null;
}

/** Только из server action или route handler: ставит cookie, если её ещё нет. */
export async function ensureGuestToken() {
  const store = await cookies();
  const existing = store.get(GUEST_CART_COOKIE)?.value;
  if (existing) return existing;
  const token = randomBytes(24).toString("base64url");
  store.set(GUEST_CART_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: DAYS * 86_400, path: "/" });
  return token;
}

export async function guestCartCount(token: string | null) {
  if (!token) return 0;
  const r = await db.guestCartItem.aggregate({ where: { token }, _sum: { quantity: true } });
  return r._sum.quantity ?? 0;
}

export async function guestCartItems(token: string | null) {
  if (!token) return [];
  return db.guestCartItem.findMany({
    where: { token },
    include: { variant: { include: { product: { include: { images: { orderBy: { order: "asc" }, take: 1 } } } } } },
    orderBy: { id: "asc" },
  });
}

/**
 * Добавить одну единицу варианта в корзину гостя с проверкой остатка (у предзаказа — не больше PREORDER_MAX).
 * quantity — сколько теперь в корзине; limit — больше добавить нельзя, но вещь уже в корзине (это не ошибка).
 */
export async function addToGuestCart(token: string, variantId: string) {
  const variant = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant || variant.product.status !== "ACTIVE") throw new Error("Товар недоступен");
  const inCart = await db.guestCartItem.findUnique({ where: { token_variantId: { token, variantId } } });
  const have = inCart?.quantity ?? 0;
  if (have + 1 > cartLimit(variant)) {
    if (have > 0) return { variant, quantity: have, limit: true };
    throw new Error("Этого размера больше нет в наличии");
  }
  await db.guestCartItem.upsert({ where: { token_variantId: { token, variantId } }, update: { quantity: have + 1 }, create: { token, variantId, quantity: 1 } });
  return { variant, quantity: have + 1, limit: false };
}

/** Предзаказ отшивается под заказ: одной вещи не больше пяти штук, как в корзине и оформлении. */
export const PREORDER_MAX = 5;
/** Сколько штук варианта можно держать в корзине. */
export function cartLimit(v: { stock: number; reserved: number; product: { isPreorder: boolean } }) {
  return v.product.isPreorder ? PREORDER_MAX : Math.max(0, v.stock - v.reserved);
}

/** Ответ покупательнице после «Добавить в корзину»: сколько уже лежит и почему больше нельзя. */
export function addedMessage(quantity: number, limit: boolean, preorder: boolean) {
  if (limit) return preorder ? `В корзине уже ${quantity} шт.: больше для предзаказа не добавить` : quantity === 1 ? "Последний экземпляр уже в корзине" : `В корзине все ${quantity} шт., больше нет в наличии`;
  return quantity === 1 ? "Добавлено в корзину" : `Добавлено. В корзине: ${quantity} шт.`;
}

export async function setGuestCartQuantity(token: string, variantId: string, qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) {
    await db.guestCartItem.deleteMany({ where: { token, variantId } });
    return;
  }
  const v = await db.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
  const capped = Math.min(Math.floor(qty), Math.max(1, cartLimit(v)));
  await db.guestCartItem.updateMany({ where: { token, variantId }, data: { quantity: capped } });
}

/** Перенос корзины гостя в аккаунт после входа; cookie удаляется. Вызывать из action/route. */
export async function mergeGuestCart(userId: string) {
  const store = await cookies();
  const token = store.get(GUEST_CART_COOKIE)?.value;
  if (!token) return 0;
  const items = await db.guestCartItem.findMany({ where: { token }, include: { variant: { include: { product: true } } } });
  let moved = 0;
  for (const i of items) {
    if (i.variant.product.status !== "ACTIVE") continue;
    const own = await db.cartItem.findUnique({ where: { userId_variantId: { userId, variantId: i.variantId } } });
    const free = i.variant.product.isPreorder ? 5 : Math.max(0, i.variant.stock - i.variant.reserved);
    const qty = Math.min(free, (own?.quantity ?? 0) + i.quantity);
    if (qty <= 0) continue;
    await db.cartItem.upsert({ where: { userId_variantId: { userId, variantId: i.variantId } }, update: { quantity: qty }, create: { userId, variantId: i.variantId, quantity: qty } });
    moved++;
  }
  await db.guestCartItem.deleteMany({ where: { token } });
  store.delete(GUEST_CART_COOKIE);
  return moved;
}

/** Ночная уборка: корзины гостей старше 90 дней. */
export async function purgeGuestCarts(now = new Date()) {
  const r = await db.guestCartItem.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - DAYS * 86_400_000) } } });
  return r.count;
}
