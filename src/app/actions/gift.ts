"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { formatDate, formatMoney, toKopecks, RUB } from "@/lib/money";
import { normalizeGiftCode } from "@/lib/orders";
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
  await audit(user.id, "giftcard.create", "GiftCard", id, { amount, recipientEmail: d.recipientEmail || null });
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
 * Демо-оплата сертификата.
 * TODO: заменить на реальную оплату — создать платёж у провайдера (ЮKassa), сохранить paymentId,
 * а активацию выполнять из вебхука после подтверждения оплаты.
 */
export async function payGiftCardDemoAction(formData: FormData) {
  const { user, card } = await ownCard(String(formData.get("id") ?? ""));
  if (card.status !== "PENDING") throw new Error("Сертификат уже оплачен или отменён");
  await db.$transaction(async (tx) => {
    await tx.giftCard.update({ where: { id: card.id }, data: { status: "ACTIVE", paymentId: `demo_${Date.now()}` } });
    await tx.ledgerEntry.create({
      data: { type: "INCOME_OTHER", amount: card.amount, category: "Сертификаты", comment: `Подарочный сертификат ${card.code} на ${formatMoney(card.amount)}`, createdBy: user.id },
    });
    await audit(user.id, "giftcard.paid", "GiftCard", card.id, { amount: card.amount, demo: true }, tx);
  });
  revalidatePath(`/account/giftcards/${card.id}`);
  revalidatePath("/account/giftcards");
  revalidatePath("/crm/giftcards");
}

/** «Проверить баланс по коду» в кабинете: показывает статус и остаток любого сертификата. */
export async function checkGiftBalanceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser("/account/giftcards");
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
