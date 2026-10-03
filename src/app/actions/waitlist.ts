"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/action-result";
import { trackEvent } from "@/lib/web-analytics";

export async function subscribeStockAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const slug = String(formData.get("slug") ?? "");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/product/${slug}`);
  const variantId = String(formData.get("variantId"));
  const variant = await db.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) return { error: "Размер не найден" };
  await db.stockSubscription.upsert({
    where: { userId_variantId: { userId: user.id, variantId } },
    update: { notifiedAt: null },
    create: { userId: user.id, variantId },
  });
  await trackEvent("WAITLIST", { productId: variant.productId, userId: user.id });
  revalidatePath("/account/waitlist");
  return { ok: true, message: "Мы сообщим, когда размер появится. Список — в личном кабинете." };
}

export async function unsubscribeStockAction(formData: FormData) {
  const user = await requireUser("/account/waitlist");
  await db.stockSubscription.deleteMany({ where: { id: String(formData.get("id")), userId: user.id } });
  revalidatePath("/account/waitlist");
}
