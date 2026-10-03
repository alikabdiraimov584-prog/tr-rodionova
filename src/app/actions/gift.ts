"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { formatDate, formatMoney, toKopecks, RUB } from "@/lib/money";
import { normalizeGiftCode } from "@/lib/orders";
import { activateGiftCard } from "@/lib/gift-payment";
import { checkRate } from "@/lib/ratelimit";
import { createGiftCardPayment, demoPaymentsAllowed, yookassaEnabled } from "@/lib/payments/yookassa";
import { GIFT_MAX_RUB, GIFT_MIN_RUB, GIFT_VALIDITY_MONTHS, generateGiftCode } from "@/lib/gift";
import { errorMessage, type ActionState } from "@/lib/action-result";

const BuySchema = z.object({
  amount: z.string().trim(),
  customAmount: z.string().trim().optional(),
  recipientName: z.string().trim().max(80).optional(),
  recipientEmail: z.string().trim().max(120).optional(),
  message: z.string().trim().max(500).optional(),
});

export async function buyGiftCardAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/gift");
  const parsed = BuySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const rub = d.amount === "custom" ? Math.round(toKopecks(d.customAmount ?? "") / RUB) : Number(d.amount);
  if (!Number.isFinite(rub) || rub < GIFT_MIN_RUB) return { error: `Минимальный номинал — ${GIFT_MIN_RUB.toLocaleString("ru-RU")} ₽` };
  if (rub > GIFT_MAX_RUB) return { error: `Максимальный номинал — ${GIFT_MAX_RUB.toLocaleString("ru-RU")} ₽` };
  if (d.recipientEmail && !z.string().email().safeParse(d.recipientEmail).success) return { error: "Неверный email получателя" };
  const amount = rub * RUB;
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + GIFT_VALIDITY_MONTHS);

  let id = "";
  try {
    // код уникален — при редком совпадении пробуем ещё раз
    for (let attempt = 0; attempt < 5 && !id; attempt++) {
      try {
        const card = await db.giftCard.create({
          data: {
            code: generateGiftCode(),
            amount,
            balance: amount,
            status: "PENDING",
            purchaserId: user.id,
            recipientName: d.recipientName || null,
            recipientEmail: d.recipientEmail || null,
            message: d.message || null,
            expiresAt,
          },
        });
        id = card.id;
      } catch (e) {
        if (!errorMessage(e).includes("Unique") || attempt === 4) throw e;
      }
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  await audit(user.id, "giftcard.create", "GiftCard", id, { amount, hasRecipient: !!d.recipientEmail });
  revalidatePath("/account/giftcards");
  redirect(`/account/giftcards/${id}`);
}

async function ownCard(id: string) {
  const user = await requireUser("/account/giftcards");
  const card = await db.giftCard.findUnique({ where: { id } });
  if (!card || card.purchaserId !== user.id) throw new Error("Сертификат не найден");
  return { user, card };
}

/**
 * Кнопка «Оплатить» на странице сертификата: при настроенной ЮKassa — переход на платёжную
 * страницу (активация придёт из вебхука), иначе демо-оплата, если она разрешена окружением.
 */
export async function payGiftCardAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let card: { id: string; status: string };
  let userId: string;
  try {
    const own = await ownCard(String(formData.get("id") ?? ""));
    card = own.card;
    userId = own.user.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  if (card.status !== "PENDING") return { error: "Сертификат уже оплачен или отменён" };
  if (yookassaEnabled()) {
    let url: string;
    try {
      const h = await headers();
      const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
      url = await createGiftCardPayment(card.id, `${base}/account/giftcards/${card.id}?paid=1`);
    } catch (e) {
      return { error: errorMessage(e) };
    }
    redirect(url);
  }
  if (!demoPaymentsAllowed()) return { error: "Оплата временно недоступна, напишите в службу заботы" };
  await activateGiftCard(card.id, `demo_${Date.now()}`, { createdBy: userId, demo: true });
  revalidatePath(`/account/giftcards/${card.id}`);
  revalidatePath("/account/giftcards");
  revalidatePath("/crm/giftcards");
  return { ok: true, message: "Демо-оплата прошла" };
}

/** «Проверить баланс по коду» в кабинете: показывает статус и остаток любого сертификата. */
export async function checkGiftBalanceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/giftcards");
  const rl = await checkRate(`gift:check:${user.id}`, { limit: 10, windowSec: 600, lockSec: 1800 });
  if (!rl.ok) return { error: "Слишком много проверок. Попробуйте позже." };
  const code = normalizeGiftCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Введите код сертификата" };
  const card = await db.giftCard.findUnique({ where: { code } });
  if (!card) return { error: "Сертификат с таким кодом не найден" };
  const expired = card.status === "EXPIRED" || card.expiresAt < new Date();
  if (card.status === "PENDING") return { error: "Сертификат ещё не оплачен" };
  if (card.status === "CANCELLED") return { error: "Сертификат отменён" };
  if (expired) return { error: `Срок действия сертификата истёк ${formatDate(card.expiresAt)}` };
  if (card.status === "USED" || card.balance <= 0) return { ok: true, message: `Сертификат ${card.code} использован полностью` };
  return { ok: true, message: `Остаток ${formatMoney(card.balance)} из ${formatMoney(card.amount)} · действует до ${formatDate(card.expiresAt)} · введите код при оформлении заказа` };
}
