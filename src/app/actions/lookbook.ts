"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { trackEvent } from "@/lib/web-analytics";
import type { ActionState } from "@/lib/action-result";
import { addToGuestCart, cartLimit, ensureGuestToken } from "@/lib/guest-cart";

/**
 * «Добавить весь образ в корзину»: в форме приходят поля variant_<productId> с выбранным размером.
 * Проверка остатка — как в addToCartAction: позиция добавляется, если свободный остаток покрывает количество в корзине + 1
 * (у предзаказа — не больше пяти штук); вещь, уже лежащая в корзине в предельном количестве, считается добавленной.
 */
export async function addLookToCartAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const slug = String(formData.get("slug") ?? "");

  const look = await db.look.findUnique({ where: { slug }, include: { items: { select: { productId: true } } } });
  if (!look || !look.isPublished) return { error: "Образ не найден" };
  const allowed = new Set(look.items.map((i) => i.productId));

  const variantIds: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("variant_")) continue;
    const productId = key.slice("variant_".length);
    const variantId = String(value);
    if (allowed.has(productId) && variantId) variantIds.push(variantId);
  }
  if (variantIds.length === 0) return { error: "Выберите размер хотя бы для одной вещи" };

  if (!user) {
    // гость: те же проверки остатка внутри addToGuestCart
    const token = await ensureGuestToken();
    const added: string[] = [];
    const skipped: string[] = [];
    for (const id of variantIds) {
      try {
        const r = await addToGuestCart(token, id);
        // вещь уже лежит в корзине в предельном количестве — образ всё равно собран
        if (!r.limit) await trackEvent("ADD_TO_CART", { productId: r.variant.productId });
        added.push(r.variant.product.name);
      } catch {
        skipped.push(id);
      }
    }
    if (added.length === 0) return { error: "Не удалось добавить образ: вещи закончились" };
    revalidatePath("/", "layout");
    redirect("/cart");
  }
  const variants = await db.productVariant.findMany({ where: { id: { in: variantIds } }, include: { product: true } });
  const inCart = await db.cartItem.findMany({ where: { userId: user.id, variantId: { in: variantIds } } });
  const cartQty = new Map(inCart.map((c) => [c.variantId, c.quantity]));

  const added: string[] = [];
  const skipped: string[] = [];
  for (const v of variants) {
    if (v.product.status !== "ACTIVE" || !allowed.has(v.productId)) {
      skipped.push(v.product.name);
      continue;
    }
    const have = cartQty.get(v.id) ?? 0;
    const want = have + 1;
    // у предзаказа склада нет: ограничение только на количество, как в корзине
    if (want > cartLimit(v)) {
      if (have > 0) {
        added.push(v.product.name);
        continue;
      }
      skipped.push(`${v.product.name} (${v.size})`);
      continue;
    }
    await db.cartItem.upsert({
      where: { userId_variantId: { userId: user.id, variantId: v.id } },
      update: { quantity: want },
      create: { userId: user.id, variantId: v.id, quantity: 1 },
    });
    await trackEvent("ADD_TO_CART", { productId: v.productId, userId: user.id });
    added.push(v.product.name);
  }
  if (added.length === 0) return { error: skipped.length ? `Нет в наличии: ${skipped.join(", ")}` : "Не удалось добавить образ" };

  await audit(user.id, "look.addToCart", "Look", look.id, { added: added.length, skipped });
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: skipped.length ? `Добавлено: ${added.length} из ${added.length + skipped.length}. Нет в наличии: ${skipped.join(", ")}` : `Образ добавлен в корзину (${added.length} ${added.length === 1 ? "вещь" : added.length < 5 ? "вещи" : "вещей"})`,
  };
}
