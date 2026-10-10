// Яндекс Доставка без настоящего API: сервер Яндекса и Геокодер подменены, проверяется весь путь заявки —
// оценка с ценой, подтверждение, курьер и ссылка слежения, забор → заказ «В доставке», вручение → «Доставлен»
// и расход на доставку, отказ оценки и повторный вызов, бесплатная и платная отмена, уведомление (callback).
// Запуск: DATABASE_URL=… AUTH_SECRET=… node --conditions=react-server --import tsx scripts/tests/yandex-delivery.test.ts
import { db } from "@/lib/db";
import { reserveStock } from "@/lib/stock";
import { saveIntegration } from "@/lib/integrations/store";
import { acceptYandexClaim, cancelYandexClaim, createYandexClaim, normalizePhone, parseGeo, syncActiveYandexClaims, syncYandexClaim, testYandex, yandexShipment } from "@/lib/delivery/yandex";
import { POST as callback } from "@/app/api/delivery/yandex/route";

let fails = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) fails++;
};

// ───────────── подставной Яндекс ─────────────
type Claim = { status: string; version: number; price: string | null; failing: boolean; performer: { courier_name: string; car_model: string; car_number: string; car_color: string } | null };
const claims = new Map<string, Claim>();
const created: Record<string, unknown>[] = [];
// «Тупиковый проезд» без тарифа, пока адрес не поправили
const deadEnd = { on: true };
let seq = 0;
const run = Date.now().toString(36);
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.hostname === "geocode-maps.yandex.ru") {
    const q = url.searchParams.get("geocode") ?? "";
    if (url.searchParams.get("apikey") !== "geo-key") return Response.json({ message: "forbidden" }, { status: 403 });
    if (/несуществующ/i.test(q)) return Response.json({ response: { GeoObjectCollection: { featureMember: [] } } });
    const precision = /без дома/i.test(q) ? "street" : "exact";
    return Response.json({ response: { GeoObjectCollection: { featureMember: [{ GeoObject: { Point: { pos: "37.618423 55.751244" }, metaDataProperty: { GeocoderMetaData: { precision, text: q } } } }] } } });
  }
  if (!url.hostname.startsWith("b2b.taxi")) return realFetch(input, init);
  const auth = new Headers(init?.headers).get("authorization");
  if (auth !== "Bearer test-token") return Response.json({ code: "unauthorized", message: "неверный токен" }, { status: 401 });
  const path = url.pathname.replace("/b2b/cargo/integration/v2", "");
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const id = url.searchParams.get("claim_id") ?? "";
  const c = claims.get(id);
  switch (path) {
    case "/claims/search":
      return Response.json({ claims: [] });
    case "/claims/create": {
      const claimId = `claim-${run}-${++seq}`; // уникально между прогонами: в базе остаются заказы прошлых запусков
      created.push(body);
      const dest = (body.route_points as { address: { fullname: string } }[])[1].address.fullname;
      claims.set(claimId, { status: "estimating", version: 1, price: null, failing: deadEnd.on && /тупиков/i.test(dest), performer: null });
      return Response.json({ id: claimId, status: "new", version: 1 });
    }
    case "/claims/info": {
      if (!c) return Response.json({ code: "not_found", message: "нет заявки" }, { status: 404 });
      if (c.status === "estimating") {
        c.status = c.failing ? "estimating_failed" : "ready_for_approval";
        c.price = c.failing ? null : "349.00";
      }
      return Response.json({
        id,
        status: c.status,
        version: c.version,
        pricing: { offer: { price: c.price }, ...(c.status === "delivered_finish" ? { final_price: "362.50" } : {}), currency_rules: { code: "RUB" } },
        performer_info: c.performer ?? undefined,
        error_messages: c.failing ? [{ code: "estimating.no_tariff", message: "Тариф недоступен по этому адресу" }] : [],
        route_points: [{ id: 101, type: "source" }, { id: 102, type: "destination" }],
      });
    }
    case "/claims/accept": {
      if (!c) return Response.json({ message: "нет заявки" }, { status: 404 });
      if (body.version !== c.version) return Response.json({ message: "версия устарела" }, { status: 409 });
      c.status = "accepted";
      c.version++;
      return Response.json({ id, status: c.status, version: c.version });
    }
    case "/claims/cancel-info":
      return Response.json(c?.performer ? { cancel_state: "paid", price: "150.00", currency: "RUB" } : { cancel_state: "free", price: "0", currency: "RUB" });
    case "/claims/cancel": {
      if (!c) return Response.json({ message: "нет заявки" }, { status: 404 });
      c.status = body.cancel_state === "paid" ? "cancelled_with_payment" : "cancelled";
      return Response.json({ id, status: c.status });
    }
    case "/claims/tracking-links":
      return Response.json({ route_points: [{ id: 101, type: "source", sharing_link: "https://taxi.yandex.ru/route/src" }, { id: 102, type: "destination", sharing_link: `https://taxi.yandex.ru/route/${id}` }] });
    case "/driver-voiceforwarding":
      return Response.json({ phone: "+78005553535", ext: "321", ttl_seconds: 3600 });
    case "/claims/points-eta":
      return Response.json({ route_points: [{ id: 102, type: "destination", visited_at: { expected: "2026-10-10T15:30:00+03:00" } }] });
    default:
      return Response.json({ message: `unexpected ${path}` }, { status: 404 });
  }
}) as typeof fetch;

function drive(claimId: string, status: string, withCourier = false) {
  const c = claims.get(claimId)!;
  c.status = status;
  if (withCourier) c.performer = { courier_name: "Иван К.", car_model: "Kia Rio", car_number: "А123ВС77", car_color: "белый" };
}

async function newOrder(address: string, status: "PAID" | "NEW" = "PAID") {
  // свободный остаток, а не склад: прошлые прогоны уже зарезервировали часть вещей
  const variants = await db.productVariant.findMany({ where: { stock: { gt: 0 }, product: { status: "ACTIVE" } }, include: { product: true }, take: 100 });
  const variant = variants.find((v) => v.stock - v.reserved > 2);
  if (!variant) throw new Error("нет варианта со свободным остатком для теста");
  const price = variant.price ?? variant.product.price;
  return db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        email: "yd@example.com",
        phone: "8 (999) 123-45-67",
        firstName: "Анна",
        lastName: "Тестова",
        deliveryMethod: "YANDEX",
        addressText: address,
        deliverySlot: "14:00–18:00",
        status,
        paidAt: status === "PAID" ? new Date() : null,
        subtotal: price,
        deliveryCost: 45_000,
        total: price + 45_000,
        items: { create: [{ variantId: variant.id, productName: variant.product.name, size: variant.size, sku: variant.sku, price, quantity: 1 }] },
        payments: { create: [{ method: "CARD", amount: price + 45_000, status: status === "PAID" ? "SUCCEEDED" : "PENDING" }] },
      },
    });
    await reserveStock(tx, variant.id, 1, order.id);
    return order;
  });
}

const events = async (orderId: string) => (await db.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } })).map((e) => e.message);
const fresh = (orderId: string) => db.order.findUniqueOrThrow({ where: { id: orderId } });

async function main() {
// ───────────── подготовка ─────────────
// заказы прошлых прогонов не должны попадать в сверку активных заявок
await db.order.updateMany({ where: { email: "yd@example.com", deliveryMethod: "YANDEX", shipmentId: { not: null } }, data: { shipmentStatus: "cancelled" } });
await saveIntegration("dadata", {}, ["token"], false);
await saveIntegration("yandex_delivery", { token: "test-token", senderAddress: "Москва, Большая Дмитровка, 7", senderPhone: "+7 (999) 000-00-01", senderName: "Шоурум", geocoderKey: "geo-key", itemWeightKg: "0,6" }, [], true);

check("parseGeo: «широта, долгота» → [долгота, широта]", JSON.stringify(parseGeo("55.751244, 37.618423")) === "[37.618423,55.751244]" && parseGeo("abc") === null);
check("normalizePhone: 8 (999) 123-45-67 → +79991234567", normalizePhone("8 (999) 123-45-67") === "+79991234567" && normalizePhone("9991234567") === "+79991234567");

const t1 = await testYandex({ token: "test-token", senderAddress: "Москва, Большая Дмитровка, 7", senderPhone: "+79990000001", geocoderKey: "geo-key" });
check("проверка подключения: токен и точка забора", t1.ok && /55\.75124, 37\.61842/.test(t1.info ?? ""), JSON.stringify(t1));
const t2 = await testYandex({ token: "wrong", senderAddress: "Москва, Большая Дмитровка, 7" });
check("проверка подключения: неверный токен — понятная ошибка", !t2.ok && /токен/i.test(t2.error), JSON.stringify(t2));
const t3 = await testYandex({ token: "test-token" });
check("проверка подключения: без адреса забора — ошибка", !t3.ok && /адрес забора/.test(t3.error), JSON.stringify(t3));

// ───────────── полный путь: оценка → подтверждение → курьер → забор → вручение ─────────────
const o1 = await newOrder("Москва, ул. Тверская, д. 7");
const s1 = await createYandexClaim(o1.id, null);
check("заявка создана и оценена: ждёт подтверждения, 349 ₽", s1.status === "ready_for_approval" && s1.price === 34_900, `${s1.status} ${s1.price}`);
const body1 = created[0] as { route_points: { type: string; address: { coordinates: number[]; fullname: string; sflat?: string }; contact: { phone: string; name: string }; skip_confirmation: boolean }[]; items: { cost_value: string; weight: number; quantity: number; title: string }[]; client_requirements: { taxi_class: string }; callback_properties?: unknown; comment: string };
check("координаты в порядке [долгота, широта], телефон клиентки нормализован", body1.route_points[1].address.coordinates[0] === 37.618423 && body1.route_points[1].contact.phone === "+79991234567" && body1.route_points[0].contact.phone === "+79990000001", JSON.stringify(body1.route_points.map((p) => [p.type, p.address.coordinates, p.contact.phone])));
check("позиции: цена в рублях строкой, вес из настроек, тариф courier, в комментарии номер заказа и интервал", body1.items[0].cost_value === (o1.subtotal / 100).toFixed(2) && body1.items[0].weight === 0.6 && body1.client_requirements.taxi_class === "courier" && body1.comment.includes(`Заказ №${o1.number}`) && body1.comment.includes("14:00–18:00"), `${body1.items[0].cost_value} ${body1.items[0].weight} ${body1.comment}`);
check("callback_url передаётся только с боевым APP_URL", process.env.APP_URL ? !!body1.callback_properties : !body1.callback_properties);
check("события заказа: создана, ждёт подтверждения с ценой", (await events(o1.id)).some((m) => m.includes("подтвердите заявку") && m.includes("349")), (await events(o1.id)).join(" | "));
let dup: string | null = null;
await createYandexClaim(o1.id, null).catch((e: Error) => (dup = e.message));
check("вторая заявка при активной — отказ", /уже создана/.test(dup ?? ""), dup ?? "");

const a1 = await acceptYandexClaim(o1.id, null);
check("подтверждение: статус accepted, версия обновлена, acceptedAt", a1.status === "accepted" && a1.version === 2 && !!a1.acceptedAt, `${a1.status} v${a1.version}`);
check("событие о подтверждении с ценой", (await events(o1.id)).some((m) => m.includes("подтверждена") && m.includes("349")));
let again: string | null = null;
await acceptYandexClaim(o1.id, null).catch((e: Error) => (again = e.message));
check("повторное подтверждение — отказ с понятным статусом", /нельзя подтвердить/.test(again ?? ""), again ?? "");

drive(s1.claimId, "performer_found", true);
const f1 = await syncYandexClaim(o1.id);
check("курьер найден: имя, машина, телефон с добавочным, ETA, ссылка слежения", f1.performer?.name === "Иван К." && f1.performer.car === "белый Kia Rio А123ВС77" && f1.performer.phone === "+78005553535" && f1.performer.phoneExt === "321" && !!f1.eta && f1.trackingLink === `https://taxi.yandex.ru/route/${s1.claimId}`, JSON.stringify(f1.performer));
check("событие с именем курьера", (await events(o1.id)).some((m) => m.includes("Курьер найден") && m.includes("Иван К.")));
check("заказ пока «Оплачен»", (await fresh(o1.id)).status === "PAID");

drive(s1.claimId, "pickuped", true);
await syncYandexClaim(o1.id);
const afterPickup = await fresh(o1.id);
check("курьер забрал посылку → заказ «В доставке» через все переходы", afterPickup.status === "SHIPPED" && afterPickup.shipmentStatus === "pickuped", afterPickup.status);
check("ссылка слежения сохранена в заказе", yandexShipment(afterPickup.shipmentData)?.trackingLink === `https://taxi.yandex.ru/route/${s1.claimId}`);

drive(s1.claimId, "delivered_finish", true);
const d1 = await syncYandexClaim(o1.id);
const afterDelivery = await fresh(o1.id);
check("вручено → заказ «Доставлен», дата доставки, итоговая цена", afterDelivery.status === "DELIVERED" && !!afterDelivery.deliveredAt && d1.finalPrice === 36_250, `${afterDelivery.status} ${d1.finalPrice}`);
await syncYandexClaim(o1.id);
const expenses = await db.ledgerEntry.findMany({ where: { orderId: o1.id, type: "EXPENSE_SHIPPING" } });
check("расход на доставку проведён один раз по итоговой цене", expenses.length === 1 && expenses[0].amount === 36_250, `${expenses.length} ${expenses[0]?.amount}`);
check("закрытая заявка не попадает в сверку", (await syncActiveYandexClaims()).checked === 0);

// ───────────── отказ оценки и повторный вызов ─────────────
const o2 = await newOrder("Москва, Тупиковый проезд, 1");
const s2 = await createYandexClaim(o2.id, null);
check("оценка не удалась: статус и причина от Яндекса", s2.status === "estimating_failed" && /Тариф недоступен/.test(s2.error ?? ""), `${s2.status} ${s2.error}`);
check("событие с причиной отказа", (await events(o2.id)).some((m) => m.includes("Оценка не удалась") && m.includes("Тариф недоступен")));
check("заказ остался «Оплачен»", (await fresh(o2.id)).status === "PAID");
deadEnd.on = false; // адрес поправили — тариф появился
const s2b = await createYandexClaim(o2.id, null);
check("после отказа можно вызвать курьера заново — новая заявка", s2b.claimId !== s2.claimId && s2b.status === "ready_for_approval", `${s2.claimId} → ${s2b.claimId}`);

// ───────────── отмена: бесплатная и платная ─────────────
const c0 = await cancelYandexClaim(o2.id, null);
check("отмена до курьера — бесплатная, заявка закрыта", c0.cancelled && !c0.paid && c0.status === "cancelled", JSON.stringify(c0));
const o3 = await newOrder("Москва, ул. Арбат, д. 10");
const s3 = await createYandexClaim(o3.id, null);
await acceptYandexClaim(o3.id, null);
drive(s3.claimId, "performer_found", true);
await syncYandexClaim(o3.id);
const c1 = await cancelYandexClaim(o3.id, null);
check("отмена после назначения курьера без подтверждения — предупреждение с ценой", !c1.cancelled && c1.paid && c1.price === 15_000, JSON.stringify(c1));
check("заявка не отменена", (await fresh(o3.id)).shipmentStatus === "performer_found");
const c2 = await cancelYandexClaim(o3.id, null, { confirmPaid: true });
check("платная отмена с подтверждением", c2.cancelled && c2.status === "cancelled_with_payment", JSON.stringify(c2));
check("событие о платной отмене", (await events(o3.id)).some((m) => m.includes("платная отмена") && m.includes("150")));

// ───────────── уведомление от Яндекса (callback) ─────────────
const o4 = await newOrder("Москва, Пресненская наб., д. 12");
const s4 = await createYandexClaim(o4.id, null);
await acceptYandexClaim(o4.id, null);
drive(s4.claimId, "pickuped", true);
const r1 = await callback(new Request("https://tr-rodionova.ru/api/delivery/yandex", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claim_id: s4.claimId, status: "pickuped", updated_ts: new Date().toISOString() }) }));
check("callback по заявке → сверка → заказ «В доставке»", r1.status === 200 && (await fresh(o4.id)).status === "SHIPPED", `${r1.status} ${(await fresh(o4.id)).status}`);
const r2 = await callback(new Request("https://tr-rodionova.ru/api/delivery/yandex", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claim_id: "unknown-claim", status: "delivered" }) }));
check("callback с чужим claim_id — 200 без действий", r2.status === 200);
const r3 = await callback(new Request("https://tr-rodionova.ru/api/delivery/yandex", { method: "POST", body: "not json" }));
check("callback без claim_id — 400", r3.status === 400);
check("активная заявка попадает в сверку", (await syncActiveYandexClaims()).checked === 1);

// ───────────── геокодирование ─────────────
const o5 = await newOrder("Москва, ул. Без дома");
let g1: string | null = null;
await createYandexClaim(o5.id, null).catch((e: Error) => (g1 = e.message));
check("адрес без дома — отказ с просьбой уточнить дом, заявка не создана", /номер дома/.test(g1 ?? "") && !(await fresh(o5.id)).shipmentId, g1 ?? "");
const o6 = await newOrder("Несуществующий город, ул. Нет, 1");
let g2: string | null = null;
await createYandexClaim(o6.id, null).catch((e: Error) => (g2 = e.message));
check("адрес не найден — понятная ошибка", /не нашёл адрес|координаты/.test(g2 ?? ""), g2 ?? "");
const o7 = await newOrder("Москва, ул. Тверская, д. 7", "NEW");
let g3: string | null = null;
await createYandexClaim(o7.id, null).catch((e: Error) => (g3 = e.message));
check("неоплаченный заказ — курьера не вызвать", /оплаченного/.test(g3 ?? ""), g3 ?? "");

console.log(fails ? `\n${fails} проверок не прошли` : "\nВсе проверки прошли");
process.exitCode = fails ? 1 : 0;
await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
