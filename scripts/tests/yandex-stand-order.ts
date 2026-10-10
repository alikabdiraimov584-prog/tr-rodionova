// Оплаченный заказ с доставкой «Яндекс» для стендовой проверки (scripts/tests/yandex-stand-test.mjs):
// покупательница anna@example.com из демо-сида, адрес текстом, одна вещь со свободным остатком. Печатает JSON заказа.
// Запуск: DATABASE_URL=… AUTH_SECRET=… node --conditions=react-server --import tsx scripts/tests/yandex-stand-order.ts
import { db } from "@/lib/db";
import { reserveStock } from "@/lib/stock";
import { saveIntegration } from "@/lib/integrations/store";

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: "anna@example.com" } });
  const variants = await db.productVariant.findMany({ where: { stock: { gt: 0 }, product: { status: "ACTIVE" } }, include: { product: true }, take: 100 });
  const variant = variants.find((v) => v.stock - v.reserved > 2);
  if (!variant) throw new Error("нет варианта со свободным остатком");
  const price = variant.price ?? variant.product.price;
  // интеграция стенда: токен и точка забора подставного сервера, координаты заданы — геокодер нужен только клиентке
  await saveIntegration("dadata", {}, ["token"], false);
  await saveIntegration("yandex_delivery", { token: "test-token", senderAddress: "Москва, Большая Дмитровка, 7", senderGeo: "55.760186, 37.613306", senderPhone: "+7 (999) 000-00-01", senderName: "Шоурум", geocoderKey: "geo-key" }, [], true);
  const order = await db.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: {
        userId: user.id,
        email: user.email,
        phone: "+7 999 123-45-67",
        firstName: user.firstName,
        lastName: user.lastName,
        deliveryMethod: "YANDEX",
        addressText: "Москва, ул. Тверская, д. 7",
        deliverySlot: "14:00–18:00",
        status: "PAID",
        paidAt: new Date(),
        subtotal: price,
        deliveryCost: 45_000,
        total: price + 45_000,
        items: { create: [{ variantId: variant.id, productName: variant.product.name, size: variant.size, sku: variant.sku, price, quantity: 1 }] },
        payments: { create: [{ method: "CARD", amount: price + 45_000, status: "SUCCEEDED", payload: { provider: "cloudpayments" } }] },
      },
    });
    await reserveStock(tx, variant.id, 1, o.id);
    return o;
  });
  console.log(JSON.stringify({ id: order.id, number: order.number }));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
