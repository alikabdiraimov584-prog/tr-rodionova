"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { addPoints } from "@/lib/loyalty";
import { getSetting, setSetting } from "@/lib/settings";
import { runDailyJobs } from "@/lib/jobs";
import { toKopecks } from "@/lib/money";
import { audit } from "@/lib/audit";
import { errorMessage, type ActionState } from "@/lib/action-result";

export async function saveTierAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("loyaltyEdit");
  const id = String(formData.get("id"));
  const num = (k: string) => Math.max(0, Math.trunc(Number(formData.get(k) ?? 0)));
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    threshold: toKopecks(String(formData.get("threshold") ?? "0")),
    cashbackPct: Math.min(30, num("cashbackPct")),
    maxPayPct: Math.min(100, num("maxPayPct")),
    birthdayBonus: num("birthdayBonus"),
    perks: String(formData.get("perks") ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    freeShipping: formData.get("freeShipping") === "on",
    freeReturns: formData.get("freeReturns") === "on",
    earlyAccess: formData.get("earlyAccess") === "on",
    stylist: formData.get("stylist") === "on",
  };
  if (!data.name) return { error: "Название уровня" };
  await db.loyaltyTier.update({ where: { id }, data });
  await audit(me.id, "loyalty.tier", "LoyaltyTier", id, data);
  revalidatePath("/crm/loyalty");
  revalidatePath("/circle");
  return { ok: true, message: "Уровень сохранён. Пересчёт клиентов — кнопкой «Запустить задачи»." };
}

export async function saveLoyaltySettingsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("loyaltyEdit");
  const cur = await getSetting("loyalty");
  const n = (k: string) => Math.max(0, Math.trunc(Number(formData.get(k) ?? 0)));
  const next = { ...cur, welcomePoints: n("welcomePoints"), referralPoints: n("referralPoints"), reviewPoints: n("reviewPoints"), pointsExpireDays: Math.max(30, n("pointsExpireDays")) };
  await setSetting("loyalty", next);
  await audit(me.id, "settings.loyalty", "Setting", "loyalty", next);
  revalidatePath("/crm/loyalty");
  return { ok: true, message: "Сохранено" };
}

export async function runJobsAction(_: ActionState): Promise<ActionState> {
  const me = await requireSection("loyalty");
  try {
    const r = await runDailyJobs(me.id);
    revalidatePath("/crm", "layout");
    return { ok: true, message: `Завершено заказов: ${r.completed}, подарков ко ДР: ${r.birthdays}, сгораний: ${r.expired}, пересчитано уровней: ${r.tiers}` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

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
    const publish = op === "publish";
    await db.$transaction(async (tx) => {
      await tx.review.update({ where: { id }, data: { isPublic: publish } });
      if (publish) {
        // бонус за отзыв — один раз за отзыв
        const paid = await tx.pointsTransaction.findFirst({ where: { userId: review.userId, type: "EARN_REVIEW", comment: { contains: review.id } } });
        if (!paid) {
          const s = await getSetting("loyalty");
          await addPoints(tx, review.userId, "EARN_REVIEW", s.reviewPoints, { comment: `Отзыв о «${review.product.name}» (${review.id})`, createdBy: me.id });
        }
      }
    });
  }
  await audit(me.id, `review.${op}`, "Review", id);
  revalidatePath("/crm/reviews");
  revalidatePath(`/product/${review.product.slug}`);
}
