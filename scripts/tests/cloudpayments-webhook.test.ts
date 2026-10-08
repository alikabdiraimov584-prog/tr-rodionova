// Приём оплаты CloudPayments без настоящей кассы: API кассы подменён, уведомления подписаны как в кабинете.
// Адрес уведомлений из CRM без ?kind, прежний адрес с ?kind, JSON и form-urlencoded, тестовый режим, отказ,
// сверка «payments/find» (касса отдаёт один объект, а не список), возврат.
// Запуск: DATABASE_URL=… AUTH_SECRET=… node --conditions=react-server --import tsx scripts/tests/cloudpayments-webhook.test.ts
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { reserveStock } from "@/lib/stock";
import { saveIntegration } from "@/lib/integrations/store";
import { syncOrderPayment } from "@/lib/payments/provider";
import { POST } from "@/app/api/payments/cloudpayments/route";

const SECRET = "test-api-secret";
let fails = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) fails++;
};

// касса: транзакции по номеру; payments/get — одна транзакция, payments/find — последняя по счёту одним объектом
type Tx = { TransactionId: number; Amount: number; Currency: string; InvoiceId: string; Status: string; TestMode: boolean; Reason?: string; CardHolderMessage?: string };
const txs = new Map<number, Tx>();
let nextTx = 900_000;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://api.cloudpayments.ru")) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? "{}")) as { TransactionId?: number; InvoiceId?: string };
  if (url.endsWith("/payments/get")) {
    const t = txs.get(Number(body.TransactionId));
    return Response.json(t ? { Success: t.Status === "Completed" || t.Status === "Authorized", Message: null, Model: t } : { Success: false, Message: "Not found", Model: null });
  }
  if (url.endsWith("/payments/find")) {
    const t = [...txs.values()].filter((x) => x.InvoiceId === body.InvoiceId).at(-1);
    if (!t) return Response.json({ Success: false, Message: "Not found", Model: null });
    const ok = t.Status === "Completed" || t.Status === "Authorized";
    return Response.json({ Success: ok, Message: ok ? null : t.CardHolderMessage ?? t.Reason, Model: t });
  }
  return Response.json({ Success: false, Message: `unexpected ${url}` }, { status: 404 });
}) as typeof fetch;

async function newOrder(variantId: string, price: number) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        email: "cp@example.com",
        phone: "+70000000000",
        firstName: "Тест",
        deliveryMethod: "COURIER",
        subtotal: price,
        total: price,
        items: { create: [{ variantId, productName: "Тест", size: "S", sku: "CP", price, quantity: 1 }] },
        payments: { create: [{ method: "CARD", amount: price, status: "PENDING" }] },
      },
      include: { payments: true },
    });
    await reserveStock(tx, variantId, 1, order.id);
    await tx.payment.update({ where: { id: order.payments[0].id }, data: { payload: { provider: "cloudpayments", invoiceId: order.payments[0].id } } });
    return { id: order.id, paymentId: order.payments[0].id, total: order.total };
  });
}

function pay(o: { paymentId: string; total: number }, status = "Completed", testMode = false, extra: Partial<Tx> = {}) {
  const t: Tx = { TransactionId: nextTx++, Amount: o.total / 100, Currency: "RUB", InvoiceId: o.paymentId, Status: status, TestMode: testMode, ...extra };
  txs.set(t.TransactionId, t);
  return t;
}

async function notify(query: string, fields: Record<string, string | number>, opts: { json?: boolean; secret?: string } = {}) {
  const body = opts.json ? JSON.stringify(fields) : new URLSearchParams(Object.entries(fields).map(([k, v]) => [k, String(v)])).toString();
  const sig = createHmac("sha256", opts.secret ?? SECRET).update(body).digest("base64");
  const res = await POST(
    new Request(`https://tr-rodionova.ru/api/payments/cloudpayments${query}`, {
      method: "POST",
      headers: { "content-type": opts.json ? "application/json" : "application/x-www-form-urlencoded", "content-hmac": sig },
      body,
    }),
  );
  return { status: res.status, body: await res.json().catch(() => null) };
}

const status = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
const payload = async (paymentId: string) => (await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).payload as { status?: string; reason?: string } | null;
const lastEvent = async (id: string) => (await db.orderEvent.findFirst({ where: { orderId: id }, orderBy: { createdAt: "desc" } }))?.message ?? "";

async function main() {
  await saveIntegration("cloudpayments", { publicId: "pk_test", apiSecret: SECRET }, [], true);
  // тестовой базе хватит остатка на все заказы проверки
  const found = await db.productVariant.findFirstOrThrow({ where: { stock: { gte: 1 } }, select: { id: true } });
  const variant = await db.productVariant.update({ where: { id: found.id }, data: { stock: { increment: 20 } }, include: { product: true } });
  const price = variant.price ?? variant.product.price;

  // 1. адрес из CRM как есть (без ?kind), form-urlencoded — так присылает кабинет по умолчанию
  const o1 = await newOrder(variant.id, price);
  const t1 = pay(o1);
  const r1 = await notify("", { TransactionId: t1.TransactionId, Amount: t1.Amount, InvoiceId: o1.paymentId, Status: "Completed", OperationType: "Payment", TestMode: 0 });
  check("адрес без ?kind: касса получает code 0", r1.status === 200 && r1.body?.code === 0, JSON.stringify(r1));
  check("адрес без ?kind: заказ оплачен", (await status(o1.id)) === "PAID", await status(o1.id));
  check("адрес без ?kind: след в ленте заказа", /заказ оплачен/.test(await lastEvent(o1.id)), await lastEvent(o1.id));

  // 2. прежний адрес с ?kind=pay и JSON
  const o2 = await newOrder(variant.id, price);
  const t2 = pay(o2);
  const r2 = await notify("?kind=pay", { TransactionId: t2.TransactionId, Amount: t2.Amount, InvoiceId: o2.paymentId, Status: "Completed" }, { json: true });
  check("?kind=pay и JSON: заказ оплачен", r2.body?.code === 0 && (await status(o2.id)) === "PAID", `${JSON.stringify(r2)} ${await status(o2.id)}`);

  // 3. неверная подпись: 401 и ошибка в CRM → Интеграции
  const o3 = await newOrder(variant.id, price);
  const t3 = pay(o3);
  const r3 = await notify("", { TransactionId: t3.TransactionId, InvoiceId: o3.paymentId }, { secret: "wrong" });
  const integ = await db.integration.findUniqueOrThrow({ where: { key: "cloudpayments" } });
  check("неверная подпись: 401, заказ не оплачен", r3.status === 401 && (await status(o3.id)) === "NEW", `${r3.status} ${await status(o3.id)}`);
  check("неверная подпись: ошибка видна в Интеграциях", integ.lastCheckOk === false && /HMAC/.test(integ.lastError ?? ""), integ.lastError ?? "");

  // 4. тестовый режим кассы: деньги не списаны — заказ не оплачивается, причина записана
  const o4 = await newOrder(variant.id, price);
  const t4 = pay(o4, "Completed", true);
  const r4 = await notify("", { TransactionId: t4.TransactionId, Amount: t4.Amount, InvoiceId: o4.paymentId, Status: "Completed", TestMode: 1 });
  check("тестовый платёж: code 0, заказ не оплачен", r4.body?.code === 0 && (await status(o4.id)) === "NEW", `${JSON.stringify(r4)} ${await status(o4.id)}`);
  check("тестовый платёж: отмечен в платеже и ленте", (await payload(o4.paymentId))?.status === "TestMode" && /тестовый платёж/.test(await lastEvent(o4.id)), `${JSON.stringify(await payload(o4.paymentId))} ${await lastEvent(o4.id)}`);

  // 5. уведомление не дошло: сверка по счёту, касса отдаёт один объект (раньше падало «Model.find is not a function»)
  const o5 = await newOrder(variant.id, price);
  pay(o5);
  let err5 = "";
  await syncOrderPayment(o5.id).catch((e) => (err5 = String(e)));
  check("сверка с кассой: оплата найдена, заказ оплачен", !err5 && (await status(o5.id)) === "PAID", err5 || (await status(o5.id)));

  // 6. сверка: касса отклонила (Success: false, но с Model) — причина сохранена, заказ ждёт оплаты
  const o6 = await newOrder(variant.id, price);
  pay(o6, "Declined", false, { Reason: "InsufficientFunds", CardHolderMessage: "Недостаточно средств на карте" });
  let err6 = "";
  await syncOrderPayment(o6.id).catch((e) => (err6 = String(e)));
  const p6 = await payload(o6.paymentId);
  check("сверка: отказ записан с причиной", !err6 && (await status(o6.id)) === "NEW" && p6?.status === "Declined" && /Недостаточно/.test(p6?.reason ?? ""), err6 || JSON.stringify(p6));

  // 7. сверка: в кассе нет платежа — без ошибки, заказ ждёт
  const o7 = await newOrder(variant.id, price);
  let err7 = "";
  await syncOrderPayment(o7.id).catch((e) => (err7 = String(e)));
  check("сверка: платежа нет — без ошибки", !err7 && (await status(o7.id)) === "NEW", err7 || (await status(o7.id)));

  // 8. возврат без ?kind (узнаётся по PaymentTransactionId) — принимается, оплата заказа не трогается
  const r8 = await notify("", { TransactionId: nextTx++, PaymentTransactionId: t1.TransactionId, Amount: t1.Amount, InvoiceId: o1.paymentId, OperationType: "Refund" });
  check("возврат без ?kind: code 0, статус заказа прежний", r8.body?.code === 0 && (await status(o1.id)) === "PAID", `${JSON.stringify(r8)} ${await status(o1.id)}`);

  // 9. сумма не совпадает с заказом — не оплачиваем
  const o9 = await newOrder(variant.id, price);
  const t9 = pay(o9, "Completed", false, { Amount: 1 });
  await notify("", { TransactionId: t9.TransactionId, Amount: 1, InvoiceId: o9.paymentId, Status: "Completed" });
  check("сумма не совпадает: заказ не оплачен", (await status(o9.id)) === "NEW", await status(o9.id));

  console.log(fails ? `\nПровалено: ${fails}` : "\nВсе проверки прошли");
}

main()
  .catch((e) => {
    console.error(e);
    fails++;
  })
  .finally(async () => {
    await db.$disconnect();
    process.exit(fails ? 1 : 0);
  });
