// Гонка смены статуса заказа: вебхук оплаты и отмена (или две оплаты) одновременно — проходит ровно один переход,
// склад и бухгалтерия не задваиваются. Запуск: DATABASE_URL=… node --conditions=react-server --import tsx scripts/tests/order-race.test.ts
import { db } from "@/lib/db";
import { markOrderPaid, cancelOrder } from "@/lib/orders";
import { reserveStock } from "@/lib/stock";

let fails = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) fails++;
};

async function newOrder(variantId: string, price: number, userId: string | null) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId,
        email: "race@example.com",
        phone: "+70000000000",
        firstName: "Тест",
        deliveryMethod: "COURIER",
        subtotal: price,
        total: price,
        items: { create: [{ variantId, productName: "Тест", size: "S", sku: "RACE", price, quantity: 1 }] },
        payments: { create: [{ method: "CARD", amount: price, status: "PENDING" }] },
      },
    });
    await reserveStock(tx, variantId, 1, order.id);
    return order;
  });
}

async function main() {
  const variant = await db.productVariant.findFirstOrThrow({ where: { stock: { gte: 3 } }, include: { product: true } });
  const user = await db.user.findFirst({ where: { role: "CUSTOMER" }, select: { id: true } });
  const price = variant.price ?? variant.product.price;
  const before = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });

  // 1. две оплаты одновременно
  const o1 = await newOrder(variant.id, price, user?.id ?? null);
  const r1 = await Promise.allSettled([markOrderPaid(o1.id, { externalId: "a" }), markOrderPaid(o1.id, { externalId: "b" })]);
  const ok1 = r1.filter((r) => r.status === "fulfilled").length;
  const sales1 = await db.ledgerEntry.count({ where: { orderId: o1.id, type: "INCOME_SALE" } });
  const v1 = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
  check("две оплаты: прошла одна", ok1 === 1, `успешных ${ok1}`);
  check("две оплаты: одна проводка продажи", sales1 === 1, `проводок ${sales1}`);
  check("две оплаты: склад списан один раз", v1.stock === before.stock - 1 && v1.reserved === before.reserved, `stock ${before.stock}→${v1.stock}, reserved ${before.reserved}→${v1.reserved}`);

  // 2. оплата и отмена одновременно
  const o2 = await newOrder(variant.id, price, user?.id ?? null);
  const r2 = await Promise.allSettled([markOrderPaid(o2.id, { externalId: "c" }), cancelOrder(o2.id, { reason: "тест" })]);
  const ok2 = r2.filter((r) => r.status === "fulfilled").length;
  const after2 = await db.order.findUniqueOrThrow({ where: { id: o2.id } });
  const v2 = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
  // допустимо: либо прошёл один переход, либо оплата успела первой и отмена пошла как возврат оплаченного заказа (с проводкой REFUND)
  const sales2 = await db.ledgerEntry.count({ where: { orderId: o2.id, type: "INCOME_SALE" } });
  const refunds2 = await db.ledgerEntry.count({ where: { orderId: o2.id, type: "REFUND" } });
  const consistent = ok2 === 1 || (after2.status === "CANCELLED" && sales2 === 1 && refunds2 === 1);
  check("оплата и отмена: переходы по очереди, деньги сходятся", consistent, `успешных ${ok2}, статус ${after2.status}, продаж ${sales2}, возвратов ${refunds2}`);
  const expectStock = after2.status === "PAID" ? before.stock - 2 : after2.status === "CANCELLED" && sales2 === 1 ? before.stock - 1 : before.stock - 1;
  check("оплата и отмена: резерв не ушёл в минус, склад сходится", v2.reserved === before.reserved && v2.stock === expectStock, `stock ${before.stock}→${v2.stock} (ожидалось ${expectStock}), reserved ${v2.reserved}`);

  // уборка: возвращаем склад и удаляем тестовые заказы
  for (const o of [o1, o2]) {
    await db.stockMovement.deleteMany({ where: { orderId: o.id } });
    await db.pointsTransaction.deleteMany({ where: { orderId: o.id } });
    await db.ledgerEntry.deleteMany({ where: { orderId: o.id } });
    await db.order.delete({ where: { id: o.id } });
  }
  await db.productVariant.update({ where: { id: variant.id }, data: { stock: before.stock, reserved: before.reserved } });
  console.log(fails ? `order-race: ${fails} FAIL` : "order-race: все проверки PASS");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
