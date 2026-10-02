"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";

function revalidateGift(id: string) {
  revalidatePath("/crm/giftcards");
  revalidatePath("/crm/finance");
  revalidatePath(`/account/giftcards/${id}`);
  revalidatePath("/account/giftcards");
}

/** Активация вручную — покупатель оплатил переводом по реквизитам. */
export async function activateGiftCardAction(formData: FormData) {
  const me = await requireSection("giftcards");
  const id = String(formData.get("id") ?? "");
  const card = await db.giftCard.findUniqueOrThrow({ where: { id } });
  if (card.status !== "PENDING") throw new Error("Активировать можно только неоплаченный сертификат");
  await db.$transaction(async (tx) => {
    await tx.giftCard.update({ where: { id }, data: { status: "ACTIVE", paymentId: `manual_${Date.now()}` } });
    await tx.ledgerEntry.create({
      data: { type: "INCOME_OTHER", amount: card.amount, category: "Сертификаты", comment: `Подарочный сертификат ${card.code} на ${formatMoney(card.amount)} (оплата переводом)`, createdBy: me.id },
    });
    await audit(me.id, "giftcard.activateManual", "GiftCard", id, { amount: card.amount }, tx);
  });
  revalidateGift(id);
}

/** Отмена: неоплаченный просто закрывается, оплаченный — закрывается с возвратом остатка покупателю. */
export async function cancelGiftCardAction(formData: FormData) {
  const me = await requireSection("giftcards");
  const id = String(formData.get("id") ?? "");
  const card = await db.giftCard.findUniqueOrThrow({ where: { id } });
  if (card.status !== "PENDING" && card.status !== "ACTIVE") throw new Error("Этот сертификат нельзя отменить");
  await db.$transaction(async (tx) => {
    await tx.giftCard.update({ where: { id }, data: { status: "CANCELLED" } });
    if (card.status === "ACTIVE" && card.balance > 0) {
      await tx.ledgerEntry.create({
        data: { type: "REFUND", amount: card.balance, category: "Сертификаты", comment: `Отмена сертификата ${card.code}: возврат остатка ${formatMoney(card.balance)}`, createdBy: me.id },
      });
    }
    await audit(me.id, "giftcard.cancel", "GiftCard", id, { from: card.status, balance: card.balance }, tx);
  });
  revalidateGift(id);
}
