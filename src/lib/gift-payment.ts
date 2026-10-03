import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Активация сертификата после подтверждённой оплаты. Идемпотентна: повторный вызов
 * (например, повторный вебхук) ничего не меняет.
 */
export async function activateGiftCard(cardId: string, paymentId: string, opts: { createdBy?: string | null; demo?: boolean } = {}) {
  return db.$transaction(async (tx: Tx) => {
    const activated = await tx.giftCard.updateMany({ where: { id: cardId, status: "PENDING" }, data: { status: "ACTIVE", paymentId } });
    if (activated.count === 0) return false;
    const card = await tx.giftCard.findUniqueOrThrow({ where: { id: cardId } });
    await tx.ledgerEntry.create({
      data: { type: "INCOME_OTHER", amount: card.amount, category: "Сертификаты", comment: `Подарочный сертификат ${card.code} на ${formatMoney(card.amount)}`, createdBy: opts.createdBy ?? null },
    });
    await audit(opts.createdBy ?? null, "giftcard.paid", "GiftCard", card.id, { amount: card.amount, paymentId, demo: opts.demo ?? false }, tx);
    return true;
  });
}
