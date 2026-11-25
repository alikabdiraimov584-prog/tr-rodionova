import type { PrismaClient } from "../src/generated/prisma/client";

const RUB = 100;

export async function seedA(db: PrismaClient) {
  const anna = await db.user.findUnique({ where: { email: "anna@example.com" }, select: { id: true } });
  if (anna) {
    const inMonths = (n: number) => {
      const d = new Date();
      d.setMonth(d.getMonth() + n);
      return d;
    };
    const activeCode = "TR-ANNA-GIFT-DEMX-ACTV";
    const existing = await db.giftCard.findUnique({ where: { code: activeCode } });
    const active = await db.giftCard.upsert({
      where: { code: activeCode },
      update: {},
      create: {
        code: activeCode,
        amount: 20_000 * RUB,
        balance: 20_000 * RUB,
        status: "ACTIVE",
        purchaserId: anna.id,
        recipientName: "Мария",
        recipientEmail: "maria@example.com",
        message: "С днём рождения! Выбери то, в чём тебе будет тепло всю зиму.",
        paymentId: "demo_seed",
        expiresAt: inMonths(11),
      },
    });
    if (!existing) {
      await db.ledgerEntry.create({
        data: { type: "INCOME_OTHER", amount: active.amount, category: "Сертификаты", comment: `Подарочный сертификат ${active.code} на 20 000 ₽`, date: new Date(Date.now() - 30 * 86_400_000) },
      });
    }
    await db.giftCard.upsert({
      where: { code: "TR-ANNA-GIFT-DEMX-USED" },
      update: {},
      create: {
        code: "TR-ANNA-GIFT-DEMX-USED",
        amount: 10_000 * RUB,
        balance: 0,
        status: "USED",
        purchaserId: anna.id,
        recipientName: "Ольга",
        recipientEmail: "olga@example.com",
        message: "Спасибо за всё!",
        paymentId: "demo_seed",
        expiresAt: inMonths(6),
        createdAt: new Date(Date.now() - 180 * 86_400_000),
      },
    });
  }
}
