"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { toKopecks } from "@/lib/money";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/action-result";

const PromoSchema = z.object({
  code: z.string().trim().min(3, "Код").max(32).regex(/^[A-Za-z0-9_-]+$/, "Код: латиница и цифры"),
  type: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
  value: z.string().optional(),
  minSubtotal: z.string().optional(),
  maxUses: z.string().optional(),
  perUser: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

export async function createPromoAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("promos");
  const parsed = PromoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const value = d.type === "PERCENT" ? Math.min(90, Math.trunc(Number(d.value ?? 0))) : d.type === "FIXED" ? toKopecks(d.value ?? "0") : 0;
  if (d.type !== "FREE_SHIPPING" && value <= 0) return { error: "Укажите размер скидки" };
  try {
    const p = await db.promoCode.create({
      data: {
        code: d.code.toUpperCase(),
        type: d.type,
        value,
        minSubtotal: d.minSubtotal ? toKopecks(d.minSubtotal) : 0,
        maxUses: d.maxUses ? Math.trunc(Number(d.maxUses)) || null : null,
        perUser: d.perUser ? Math.max(1, Math.trunc(Number(d.perUser))) : 1,
        startsAt: d.startsAt ? new Date(d.startsAt) : null,
        endsAt: d.endsAt ? new Date(`${d.endsAt}T23:59:59`) : null,
      },
    });
    await audit(me.id, "promo.create", "PromoCode", p.id, { code: p.code });
  } catch {
    return { error: "Такой промокод уже существует" };
  }
  revalidatePath("/crm/promos");
  return { ok: true, message: "Промокод создан" };
}

export async function togglePromoAction(formData: FormData) {
  const me = await requireSection("promos");
  const id = String(formData.get("id"));
  const p = await db.promoCode.findUniqueOrThrow({ where: { id } });
  await db.promoCode.update({ where: { id }, data: { isActive: !p.isActive } });
  await audit(me.id, "promo.toggle", "PromoCode", id, { isActive: !p.isActive });
  revalidatePath("/crm/promos");
}

export async function moderateReviewAction(formData: FormData) {
  const me = await requireSection("reviews");
  const id = String(formData.get("id"));
  const op = String(formData.get("op"));
  const review = await db.review.findUniqueOrThrow({ where: { id }, include: { product: true } });
  if (op === "delete") {
    await db.review.delete({ where: { id } });
  } else {
    await db.review.update({ where: { id }, data: { isPublic: op === "publish" } });
  }
  await audit(me.id, `review.${op}`, "Review", id);
  revalidatePath("/crm/reviews");
  revalidatePath(`/product/${review.product.slug}`);
}
