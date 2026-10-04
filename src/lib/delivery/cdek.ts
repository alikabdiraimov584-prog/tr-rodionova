import "server-only";
import { db } from "@/lib/db";
import { activeIntegration } from "@/lib/integrations/store";
import { addOrderEvent, canTransition, setOrderStatus } from "@/lib/orders";

/**
 * СДЭК API v2: токен, расчёт тарифа, создание отправления по заказу и сверка статусов.
 * Ключи и настройки — из CRM → Интеграции → СДЭК. Тестовый контур (api.edu.cdek.ru) включается там же.
 */

export type CdekConfig = {
  account: string;
  securePassword: string;
  senderCity: string; // код города СДЭК, 44 — Москва
  tariffCode: number; // 137 склад-дверь, 136 склад-склад (ПВЗ)
  testMode: boolean;
  senderName: string;
  senderPhone: string;
  itemWeightGrams: number; // вес одной вещи, если не задан у товара
};

const DEFAULT_TARIFF = 137;
const DEFAULT_WEIGHT = 700;

function baseUrl(test: boolean) {
  return test ? "https://api.edu.cdek.ru/v2" : "https://api.cdek.ru/v2";
}

export async function cdekConfig(): Promise<CdekConfig | null> {
  const i = await activeIntegration("cdek");
  if (!i?.config.account || !i.config.securePassword) return null;
  const c = i.config;
  return {
    account: c.account,
    securePassword: c.securePassword,
    senderCity: c.senderCity || "44",
    tariffCode: Number(c.tariffCode) || DEFAULT_TARIFF,
    testMode: c.testMode === "1" || c.testMode === "true" || c.testMode === "да",
    senderName: c.senderName || "T.Rodionova",
    senderPhone: c.senderPhone || "",
    itemWeightGrams: Number(c.itemWeightGrams) || DEFAULT_WEIGHT,
  };
}

// кэш токена в памяти процесса: СДЭК выдаёт его на час
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function cdekToken(cfg: Pick<CdekConfig, "account" | "securePassword" | "testMode">) {
  const key = `${cfg.testMode ? "edu" : "prod"}:${cfg.account}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const params = new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.account, client_secret: cfg.securePassword });
  const res = await fetch(`${baseUrl(cfg.testMode)}/oauth/token?${params}`, { method: "POST", signal: AbortSignal.timeout(12_000) });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(body.error_description ?? `СДЭК: не удалось получить токен (HTTP ${res.status})`);
  tokenCache.set(key, { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

async function api<T>(cfg: CdekConfig, path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const token = await cdekToken(cfg);
  const res = await fetch(`${baseUrl(cfg.testMode)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

type CdekError = { code?: string; message?: string };
type CdekEntityResponse = { entity?: { uuid: string }; requests?: { state?: string; errors?: CdekError[] }[] };

function firstError(r: CdekEntityResponse | { errors?: CdekError[] }, status: number) {
  const errs = ("requests" in r ? r.requests?.flatMap((q) => q.errors ?? []) : (r as { errors?: CdekError[] }).errors) ?? [];
  return errs[0]?.message ?? `СДЭК ответил HTTP ${status}`;
}

/** Расчёт стоимости и сроков по тарифу до города (код СДЭК или название с почтовым индексом). Сумма в копейках. */
export async function cdekTariff(
  cfg: CdekConfig,
  to: { code?: number; city?: string; postalCode?: string; address?: string },
  packages: { weight: number }[],
  tariffCode = cfg.tariffCode,
) {
  const r = await api<{ delivery_sum?: number; period_min?: number; period_max?: number; errors?: CdekError[] }>(cfg, "/calculator/tariff", {
    method: "POST",
    body: JSON.stringify({
      type: 1,
      tariff_code: tariffCode,
      from_location: { code: Number(cfg.senderCity) },
      to_location: { ...(to.code ? { code: to.code } : {}), ...(to.city ? { city: to.city } : {}), ...(to.postalCode ? { postal_code: to.postalCode } : {}), ...(to.address ? { address: to.address } : {}) },
      packages: packages.map((p) => ({ weight: p.weight })),
    }),
  });
  if (r.status !== 200 || typeof r.body.delivery_sum !== "number") throw new Error(firstError(r.body, r.status));
  return { sum: Math.round(r.body.delivery_sum * 100), periodMin: r.body.period_min ?? null, periodMax: r.body.period_max ?? null };
}

/** Создать отправление в СДЭК по оплаченному заказу. Возвращает uuid отправления. */
export async function createCdekShipment(orderId: string, actorId: string | null) {
  const cfg = await cdekConfig();
  if (!cfg) throw new Error("Интеграция СДЭК не включена: CRM → Интеграции");
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, address: true } });
  if (order.deliveryMethod !== "CDEK") throw new Error("У заказа другой способ доставки");
  if (order.shipmentId) throw new Error("Отправление уже создано");
  if (!["PAID", "CONFIRMED", "PACKING"].includes(order.status)) throw new Error("Отправление создаётся для оплаченного заказа до отгрузки");
  const city = order.address?.city ?? null;
  const addressLine = order.address
    ? [order.address.street, order.address.building, order.address.apartment && `кв. ${order.address.apartment}`].filter(Boolean).join(", ")
    : (order.addressText ?? "");
  if (!city && !order.addressText) throw new Error("У заказа нет адреса доставки");
  const items = order.items.filter((i) => i.quantity - i.returnedQty > 0);
  const weight = items.reduce((s, i) => s + (i.quantity - i.returnedQty) * cfg.itemWeightGrams, 0);
  const payload = {
    type: 1,
    number: String(order.number),
    tariff_code: cfg.tariffCode,
    comment: order.comment ?? undefined,
    sender: { name: cfg.senderName, ...(cfg.senderPhone ? { phones: [{ number: cfg.senderPhone }] } : {}) },
    recipient: { name: [order.firstName, order.lastName].filter(Boolean).join(" "), phones: [{ number: order.phone }], email: order.email },
    from_location: { code: Number(cfg.senderCity) },
    to_location: { ...(city ? { city } : {}), ...(order.address?.postcode ? { postal_code: order.address.postcode } : {}), address: addressLine || city || "" },
    packages: [
      {
        number: `${order.number}-1`,
        weight,
        items: items.map((i) => ({
          name: `${i.productName}${i.size ? `, ${i.size}` : ""}`,
          ware_key: i.sku,
          payment: { value: 0 }, // заказ оплачен на сайте
          cost: i.price / 100,
          weight: cfg.itemWeightGrams,
          amount: i.quantity - i.returnedQty,
        })),
      },
    ],
  };
  const r = await api<CdekEntityResponse>(cfg, "/orders", { method: "POST", body: JSON.stringify(payload) });
  const uuid = r.body.entity?.uuid;
  const failed = r.body.requests?.some((q) => q.state === "INVALID");
  if (!uuid || failed) throw new Error(firstError(r.body, r.status));
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { shipmentId: uuid, shipmentStatus: "CREATED", shipmentSyncedAt: new Date() } });
    await addOrderEvent(tx, orderId, `Отправление СДЭК создано${cfg.testMode ? " (тестовый контур)" : ""}`, null, actorId);
  });
  // номер накладной появляется через несколько секунд — сразу пробуем забрать
  await syncCdekShipment(orderId, actorId).catch(() => null);
  return uuid;
}

const CDEK_STATUS_RU: Record<string, string> = {
  ACCEPTED: "Принят",
  CREATED: "Создан",
  RECEIVED_AT_SHIPMENT_WAREHOUSE: "Принят на склад отправителя",
  READY_FOR_SHIPMENT_IN_SENDER_CITY: "Выдан на отправку",
  TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY: "Сдан перевозчику",
  SENT_TO_TRANSIT_CITY: "Отправлен в транзитный город",
  ACCEPTED_IN_TRANSIT_CITY: "Встречен в транзитном городе",
  ACCEPTED_AT_TRANSIT_WAREHOUSE: "Принят на транзитный склад",
  RETURNED_TO_TRANSIT_WAREHOUSE: "Возвращён на транзитный склад",
  READY_FOR_SHIPMENT_IN_TRANSIT_CITY: "Выдан на отправку в транзитном городе",
  TAKEN_BY_TRANSPORTER_FROM_TRANSIT_CITY: "Сдан перевозчику в транзитном городе",
  SENT_TO_SENDER_CITY: "Отправлен в город отправителя",
  SENT_TO_RECIPIENT_CITY: "Отправлен в город получателя",
  ACCEPTED_IN_SENDER_CITY: "Встречен в городе отправителя",
  ACCEPTED_IN_RECIPIENT_CITY: "Встречен в городе получателя",
  ACCEPTED_AT_PICK_UP_POINT: "Принят на склад доставки",
  TAKEN_BY_COURIER: "Выдан курьеру",
  RETURNED_TO_RECIPIENT_CITY_WAREHOUSE: "Возвращён на склад доставки",
  DELIVERED: "Вручён",
  NOT_DELIVERED: "Не вручён",
  INVALID: "Ошибка оформления",
  REMOVED: "Удалён",
};

export function cdekStatusLabel(code: string | null | undefined) {
  if (!code) return "—";
  return CDEK_STATUS_RU[code] ?? code;
}

const IN_TRANSIT = new Set(Object.keys(CDEK_STATUS_RU).filter((k) => !["ACCEPTED", "CREATED", "DELIVERED", "NOT_DELIVERED", "INVALID", "REMOVED"].includes(k)));

/** Сверить статус отправления: подтянуть номер накладной, перевести заказ в «В доставке»/«Доставлен». */
export async function syncCdekShipment(orderId: string, actorId: string | null = null) {
  const cfg = await cdekConfig();
  if (!cfg) throw new Error("Интеграция СДЭК не включена");
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!order.shipmentId) throw new Error("Отправление не создано");
  const r = await api<{ entity?: { uuid: string; cdek_number?: string; statuses?: { code: string; date_time: string }[] }; requests?: { state?: string; errors?: CdekError[] }[] }>(cfg, `/orders/${order.shipmentId}`);
  if (r.status !== 200 || !r.body.entity) throw new Error(firstError(r.body, r.status));
  const e = r.body.entity;
  const invalid = r.body.requests?.some((q) => q.state === "INVALID");
  const latest = invalid ? "INVALID" : (e.statuses?.[0]?.code ?? order.shipmentStatus ?? "CREATED");
  const trackingNumber = e.cdek_number ?? order.trackingNumber;
  const changed = latest !== order.shipmentStatus || trackingNumber !== order.trackingNumber;
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { shipmentStatus: latest, shipmentSyncedAt: new Date(), ...(trackingNumber ? { trackingNumber } : {}) } });
    if (changed) await addOrderEvent(tx, orderId, `СДЭК: ${cdekStatusLabel(latest)}${trackingNumber && trackingNumber !== order.trackingNumber ? `, накладная ${trackingNumber}` : ""}${invalid ? ` — ${firstError(r.body, r.status)}` : ""}`, null, actorId);
  });
  // статус заказа двигаем только вперёд и только по допустимым переходам
  if (IN_TRANSIT.has(latest) && order.status === "PACKING" && canTransition(order.status, "SHIPPED")) {
    await setOrderStatus(orderId, "SHIPPED", { createdBy: actorId, trackingNumber, note: "Отправление принято СДЭК" });
  } else if (latest === "DELIVERED" && canTransition(order.status, "DELIVERED")) {
    if (order.status === "PACKING") await setOrderStatus(orderId, "SHIPPED", { createdBy: actorId, trackingNumber });
    await setOrderStatus(orderId, "DELIVERED", { createdBy: actorId, note: "Вручено по данным СДЭК" });
  }
  return { status: latest, trackingNumber, changed };
}

/** Ночная сверка всех незакрытых отправлений. Возвращает число проверенных и изменившихся. */
export async function syncAllCdekShipments() {
  const cfg = await cdekConfig();
  if (!cfg) return { checked: 0, changed: 0 };
  const orders = await db.order.findMany({ where: { shipmentId: { not: null }, status: { in: ["PAID", "CONFIRMED", "PACKING", "SHIPPED"] } }, select: { id: true } });
  let changed = 0;
  for (const o of orders) {
    try {
      if ((await syncCdekShipment(o.id)).changed) changed++;
    } catch {
      // ошибка одного отправления не останавливает сверку остальных
    }
  }
  return { checked: orders.length, changed };
}
