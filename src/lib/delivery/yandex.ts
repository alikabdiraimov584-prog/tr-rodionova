import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { activeIntegration } from "@/lib/integrations/store";
import { formatMoney } from "@/lib/money";
import { addOrderEvent, canTransition, setOrderStatus } from "@/lib/orders";
import { publicPhone } from "@/lib/seo";
import { getSetting } from "@/lib/settings";

/**
 * Яндекс Доставка (экспресс, API «Доставка B2B» v2): заявка на курьера по оплаченному заказу, подтверждение по цене,
 * сверка статусов, ссылка «следить за курьером» для покупательницы, отмена. Токен и точка забора — в CRM → Интеграции.
 * Координаты обязательны для API: адрес геокодируется через DaData (если подключена) или Геокодер Яндекса (ключ в
 * настройках интеграции). Тестовый контур (b2b.taxi.tst.yandex.net) включается там же, с отдельным тестовым токеном.
 */

export type YandexConfig = {
  token: string;
  testMode: boolean;
  taxiClass: "courier" | "express";
  senderAddress: string;
  senderGeo: [number, number] | null; // [долгота, широта] — порядок API
  senderComment: string;
  senderName: string;
  senderPhone: string;
  geocoderKey: string;
  itemWeightKg: number;
};

/** Снимок заявки в Order.shipmentData: всё, что показывается в CRM и кабинете без запросов к API. */
export type YandexShipment = {
  provider: "yandex";
  claimId: string;
  requestId: string;
  version: number;
  status: string;
  price: number | null; // оффер, копейки
  finalPrice: number | null; // итог после завершения, копейки
  currency: string;
  testMode: boolean;
  taxiClass: string;
  trackingLink: string | null; // ссылка слежения за курьером для клиентки
  eta: string | null; // ожидаемое время прибытия к клиентке, ISO
  performer: { name: string; car: string | null; phone: string | null; phoneExt: string | null } | null;
  error: string | null;
  expenseRecorded?: boolean; // расход на доставку проведён в финансах
  createdAt: string;
  acceptedAt: string | null;
  updatedAt: string;
};

// адреса API переопределяются только на стенде (подставной сервер в scripts/tests/yandex-stand-test.mjs)
const PROD = process.env.YANDEX_DELIVERY_API_URL ?? "https://b2b.taxi.yandex.net/b2b/cargo/integration/v2";
const TEST = process.env.YANDEX_DELIVERY_API_URL ?? "https://b2b.taxi.tst.yandex.net/b2b/cargo/integration/v2";
const GEOCODER = process.env.YANDEX_GEOCODER_URL ?? "https://geocode-maps.yandex.ru/1.x/";

/** Телефон в формате API: +7XXXXXXXXXX. */
export function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11 && (d[0] === "8" || d[0] === "7")) return `+7${d.slice(1)}`;
  if (d.length === 10) return `+7${d}`;
  return `+${d}`;
}

/** «широта, долгота» (как копируется из Яндекс Карт) → [долгота, широта]. */
export function parseGeo(raw: string | undefined): [number, number] | null {
  const m = (raw ?? "").trim().match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

export function parseYandexConfig(c: Record<string, string>, brand: { name: string; phone: string }): YandexConfig {
  return {
    token: (c.token ?? "").trim(),
    testMode: /^(1|true|да|on)$/i.test((c.testMode ?? "").trim()),
    taxiClass: (c.taxiClass ?? "").trim().toLowerCase() === "express" ? "express" : "courier",
    senderAddress: (c.senderAddress ?? "").trim(),
    senderGeo: parseGeo(c.senderGeo),
    senderComment: (c.senderComment ?? "").trim(),
    senderName: (c.senderName ?? "").trim() || brand.name,
    senderPhone: normalizePhone(c.senderPhone || publicPhone(brand.phone) || ""),
    geocoderKey: (c.geocoderKey ?? "").trim(),
    itemWeightKg: Number(String(c.itemWeightKg ?? "").replace(",", ".")) || 0.5,
  };
}

export async function yandexConfig(): Promise<YandexConfig | null> {
  const i = await activeIntegration("yandex_delivery");
  if (!i?.config.token) return null;
  return parseYandexConfig(i.config, await getSetting("brand"));
}

type ApiBody = { code?: string; message?: string };

async function api<T extends object>(cfg: Pick<YandexConfig, "token" | "testMode">, path: string, opts: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown } = {}): Promise<{ status: number; body: T & ApiBody }> {
  const url = new URL(`${cfg.testMode ? TEST : PROD}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const method = opts.method ?? "POST";
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, "Accept-Language": "ru", "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & ApiBody;
  return { status: res.status, body };
}

function apiError(r: { status: number; body: ApiBody }) {
  if (r.status === 401) return "Яндекс не принял токен: проверьте токен в CRM → Интеграции (для тестового контура нужен тестовый токен)";
  return r.body.message ? `Яндекс: ${r.body.message}` : `Яндекс ответил HTTP ${r.status}`;
}

// ───────────────────────────── Геокодирование ─────────────────────────────

const geoCache = new Map<string, { coordinates: [number, number]; fullname: string }>();

/**
 * Координаты адреса: DaData (подсказки адреса, если подключена) → Геокодер Яндекса (ключ в интеграции).
 * Принимаются только точные результаты (до дома): курьер едет по координатам, а не по тексту.
 */
export async function geocode(cfg: Pick<YandexConfig, "geocoderKey">, address: string): Promise<{ coordinates: [number, number]; fullname: string }> {
  const key = address.trim().toLowerCase();
  const cached = geoCache.get(key);
  if (cached) return cached;
  const problems: string[] = [];
  const dadata = await activeIntegration("dadata");
  if (dadata?.config.token) {
    try {
      const res = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Token ${dadata.config.token}` },
        body: JSON.stringify({ query: address, count: 1, locations: [{ country_iso_code: "RU" }] }),
        signal: AbortSignal.timeout(8_000),
      });
      const json = (await res.json().catch(() => ({}))) as { suggestions?: { value: string; unrestricted_value?: string; data?: { geo_lat?: string | null; geo_lon?: string | null; qc_geo?: string | number | null } }[] };
      const s = json.suggestions?.[0];
      const lat = Number(s?.data?.geo_lat);
      const lon = Number(s?.data?.geo_lon);
      // qc_geo: 0 — точные координаты дома, 1 — ближайший дом; дальше — улица или город, курьеру этого мало
      if (s && Number.isFinite(lat) && Number.isFinite(lon) && Number(s.data?.qc_geo ?? 9) <= 1) {
        const out = { coordinates: [lon, lat] as [number, number], fullname: s.unrestricted_value ?? s.value };
        geoCache.set(key, out);
        return out;
      }
      problems.push(res.ok ? "DaData не нашла дом по этому адресу" : `DaData ответила HTTP ${res.status}`);
    } catch (e) {
      problems.push(`DaData: ${e instanceof Error ? e.message : "нет связи"}`);
    }
  }
  if (cfg.geocoderKey) {
    const url = new URL(GEOCODER);
    url.searchParams.set("apikey", cfg.geocoderKey);
    url.searchParams.set("geocode", address);
    url.searchParams.set("format", "json");
    url.searchParams.set("results", "1");
    url.searchParams.set("lang", "ru_RU");
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const json = (await res.json().catch(() => ({}))) as { response?: { GeoObjectCollection?: { featureMember?: { GeoObject?: { Point?: { pos?: string }; metaDataProperty?: { GeocoderMetaData?: { precision?: string; text?: string } } } }[] } }; message?: string };
    const g = json.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
    const [lon, lat] = (g?.Point?.pos ?? "").split(" ").map(Number);
    const precision = g?.metaDataProperty?.GeocoderMetaData?.precision ?? "";
    if (!res.ok) throw new Error(`Геокодер Яндекса ответил HTTP ${res.status}${res.status === 403 ? ": ключ не принят или не подключён HTTP Геокодер" : ""}`);
    if (g && Number.isFinite(lon) && Number.isFinite(lat) && ["exact", "number", "near"].includes(precision)) {
      const out = { coordinates: [lon, lat] as [number, number], fullname: g.metaDataProperty?.GeocoderMetaData?.text ?? address };
      geoCache.set(key, out);
      return out;
    }
    problems.push(g ? `Геокодер нашёл адрес только до «${precision || "района"}»: уточните номер дома` : "Геокодер не нашёл адрес");
  }
  if (!dadata?.config.token && !cfg.geocoderKey) {
    throw new Error("Для вызова курьера нужны координаты адреса: подключите DaData (CRM → Интеграции, бесплатно) или укажите ключ Геокодера Яндекса в настройках Яндекс Доставки");
  }
  throw new Error(`Не удалось определить координаты адреса «${address}»: ${problems.join("; ")}`);
}

async function senderPoint(cfg: YandexConfig) {
  if (!cfg.senderAddress) throw new Error("Укажите адрес забора посылок в настройках интеграции (CRM → Интеграции → Яндекс Доставка)");
  const coordinates = cfg.senderGeo ?? (await geocode(cfg, cfg.senderAddress)).coordinates;
  return { fullname: cfg.senderAddress, coordinates, ...(cfg.senderComment ? { comment: cfg.senderComment } : {}) };
}

// ───────────────────────────── Статусы ─────────────────────────────

const STATUS_RU: Record<string, string> = {
  new: "Заявка создана",
  estimating: "Оценка стоимости",
  estimating_failed: "Оценка не удалась",
  ready_for_approval: "Ждёт подтверждения",
  accepted: "Подтверждена, ищем курьера",
  performer_lookup: "Ищем курьера",
  performer_draft: "Ищем курьера",
  performer_found: "Курьер найден, едет за посылкой",
  performer_not_found: "Курьер не найден",
  pickup_arrived: "Курьер на точке забора",
  ready_for_pickup_confirmation: "Курьер на точке забора",
  pickuped: "Курьер забрал посылку",
  delivery_arrived: "Курьер у клиентки",
  ready_for_delivery_confirmation: "Курьер у клиентки",
  pay_waiting: "Ожидание оплаты",
  delivered: "Вручено",
  delivered_finish: "Вручено, заявка закрыта",
  returning: "Посылка возвращается",
  return_arrived: "Курьер привёз возврат",
  ready_for_return_confirmation: "Курьер привёз возврат",
  returned: "Возврат принят",
  returned_finish: "Возврат завершён",
  cancelled: "Отменена",
  cancelled_with_payment: "Отменена (платно)",
  cancelled_by_taxi: "Отменена Яндексом",
  cancelled_with_items_on_hands: "Отменена, посылка у курьера",
  failed: "Сбой заявки",
};

/** Заявка закрыта: новую можно создать заново. */
export const YANDEX_TERMINAL = new Set(["estimating_failed", "performer_not_found", "delivered_finish", "returned_finish", "cancelled", "cancelled_with_payment", "cancelled_by_taxi", "cancelled_with_items_on_hands", "failed"]);
const PICKED = new Set(["pickuped", "delivery_arrived", "ready_for_delivery_confirmation", "pay_waiting"]);
const DELIVERED = new Set(["delivered", "delivered_finish"]);
const COURIER_ON_WAY = new Set(["performer_found", "pickup_arrived", "ready_for_pickup_confirmation", ...PICKED]);
/** Статусы, о которых владельцу нужна тревога в Telegram. */
const ALARMING = new Set(["estimating_failed", "performer_not_found", "cancelled_by_taxi", "cancelled_with_items_on_hands", "failed", "returning", "return_arrived", "ready_for_return_confirmation", "returned", "returned_finish"]);

export function yandexStatusLabel(code: string | null | undefined) {
  if (!code) return "—";
  return STATUS_RU[code] ?? code;
}

export function yandexShipment(data: unknown): YandexShipment | null {
  const d = data as Partial<YandexShipment> | null;
  return d && d.provider === "yandex" && typeof d.claimId === "string" ? (d as YandexShipment) : null;
}

/** Активная заявка: создана и не закрыта. */
export function yandexActive(data: unknown) {
  const s = yandexShipment(data);
  return !!s && !YANDEX_TERMINAL.has(s.status);
}

function priceKopecks(v: string | number | null | undefined) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function saveShipment(orderId: string, data: YandexShipment, actorId: string | null, event?: string | null) {
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { shipmentId: data.claimId, shipmentStatus: data.status, shipmentSyncedAt: new Date(), shipmentData: data as unknown as Prisma.InputJsonValue } });
    if (event) await addOrderEvent(tx, orderId, event, null, actorId);
  });
}

type ClaimInfo = {
  id?: string;
  status?: string;
  version?: number;
  pricing?: { offer?: { price?: string }; final_price?: string; currency_rules?: { code?: string } };
  performer_info?: { courier_name?: string; car_model?: string; car_number?: string; car_color?: string; transport_type?: string };
  error_messages?: { code?: string; message?: string }[];
  route_points?: { id?: number; type?: string }[];
};

// ───────────────────────────── Заявка ─────────────────────────────

/**
 * Создать заявку по заказу и дождаться оценки (несколько секунд): в ответ — статус «ждёт подтверждения» с ценой
 * или причина отказа. Курьер приедет за посылкой в ближайшее время после подтверждения — вызывать, когда заказ собран.
 */
export async function createYandexClaim(orderId: string, actorId: string | null) {
  const cfg = await yandexConfig();
  if (!cfg) throw new Error("Интеграция «Яндекс Доставка» не включена: CRM → Интеграции");
  if (!cfg.senderPhone) throw new Error("Укажите телефон на точке забора в настройках интеграции: по нему курьер звонит перед приездом");
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, address: true } });
  if (order.deliveryMethod !== "YANDEX") throw new Error("У заказа другой способ доставки");
  if (yandexActive(order.shipmentData)) throw new Error("Заявка уже создана: обновите статус или отмените её");
  if (!["PAID", "CONFIRMED", "PACKING"].includes(order.status)) throw new Error("Курьера можно вызвать для оплаченного заказа до отгрузки");
  const addressLine = order.address ? [order.address.city, order.address.street, order.address.building].filter(Boolean).join(", ") : (order.addressText ?? "").trim();
  if (!addressLine) throw new Error("У заказа нет адреса доставки");
  const items = order.items.filter((i) => i.quantity - i.returnedQty > 0);
  if (!items.length) throw new Error("В заказе нет позиций к отправке");
  const [from, to] = await Promise.all([senderPoint(cfg), geocode(cfg, addressLine)]);
  const requestId = randomUUID();
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const callbackUrl = base && !/localhost|127\.0\.0\.1/.test(base) ? `${base}/api/delivery/yandex` : null;
  const recipient = [order.firstName, order.lastName].filter(Boolean).join(" ") || "Получатель";
  const comment = [`Заказ №${order.number}`, order.deliverySlot && `интервал ${order.deliverySlot}`, order.fittingRequested && "примерка: курьер ждёт до 20 минут", order.comment].filter(Boolean).join(". ");
  const payload = {
    items: items.map((i, idx) => ({
      extra_id: `${order.number}-${idx + 1}`,
      pickup_point: 1,
      droppof_point: 2,
      title: `${i.productName}${i.size ? `, ${i.size}` : ""}`,
      cost_value: (i.price / 100).toFixed(2),
      cost_currency: "RUB",
      quantity: i.quantity - i.returnedQty,
      weight: cfg.itemWeightKg,
      size: { length: 0.4, width: 0.3, height: 0.1 },
    })),
    route_points: [
      {
        point_id: 1,
        visit_order: 1,
        type: "source",
        address: from,
        contact: { name: cfg.senderName, phone: cfg.senderPhone },
        skip_confirmation: true,
      },
      {
        point_id: 2,
        visit_order: 2,
        type: "destination",
        address: { fullname: to.fullname, coordinates: to.coordinates, ...(order.address?.apartment ? { sflat: order.address.apartment } : {}), ...(order.address?.comment ? { comment: order.address.comment } : {}) },
        contact: { name: recipient, phone: normalizePhone(order.phone), ...(order.email ? { email: order.email } : {}) },
        external_order_id: String(order.number),
        skip_confirmation: true,
      },
    ],
    client_requirements: { taxi_class: cfg.taxiClass },
    comment,
    emergency_contact: { name: cfg.senderName, phone: cfg.senderPhone },
    ...(callbackUrl ? { callback_properties: { callback_url: callbackUrl } } : {}),
    skip_door_to_door: false,
    skip_client_notify: false,
    optional_return: false,
  };
  const r = await api<{ id?: string; status?: string; version?: number }>(cfg, "/claims/create", { query: { request_id: requestId }, body: payload });
  if (r.status !== 200 || !r.body.id) throw new Error(apiError(r));
  const now = new Date().toISOString();
  const data: YandexShipment = {
    provider: "yandex",
    claimId: r.body.id,
    requestId,
    version: r.body.version ?? 1,
    status: r.body.status ?? "new",
    price: null,
    finalPrice: null,
    currency: "RUB",
    testMode: cfg.testMode,
    taxiClass: cfg.taxiClass,
    trackingLink: null,
    eta: null,
    performer: null,
    error: null,
    createdAt: now,
    acceptedAt: null,
    updatedAt: now,
  };
  await saveShipment(orderId, data, actorId, `Заявка в Яндекс Доставку создана${cfg.testMode ? " (тестовый контур)" : ""}: ${to.fullname}`);
  // оценка занимает несколько секунд — ждём цену, чтобы показать её сразу
  let last = data;
  for (let i = 0; i < 8; i++) {
    await sleep(1500);
    last = await syncYandexClaim(orderId, actorId);
    if (last.status !== "new" && last.status !== "estimating") break;
  }
  return last;
}

async function trackingLink(cfg: YandexConfig, claimId: string) {
  type Links = { route_points?: { type?: string; sharing_link?: string }[] };
  let r = await api<Links>(cfg, "/claims/tracking-links", { method: "GET", query: { claim_id: claimId } });
  if (r.status === 405 || r.status === 404) r = await api<Links>(cfg, "/claims/tracking-links", { query: { claim_id: claimId } });
  if (r.status !== 200) return null;
  const pts = r.body.route_points ?? [];
  return pts.find((p) => p.type === "destination")?.sharing_link ?? pts[0]?.sharing_link ?? null;
}

async function courierPhone(cfg: YandexConfig, claimId: string, pointId: number) {
  const r = await api<{ phone?: string; ext?: string }>(cfg, "/driver-voiceforwarding", { body: { claim_id: claimId, point_id: pointId } });
  return r.status === 200 && r.body.phone ? { phone: r.body.phone, ext: r.body.ext ?? null } : null;
}

async function destinationEta(cfg: YandexConfig, claimId: string) {
  const r = await api<{ route_points?: { type?: string; visited_at?: { expected?: string } }[] }>(cfg, "/claims/points-eta", { query: { claim_id: claimId } });
  if (r.status !== 200) return null;
  return r.body.route_points?.find((p) => p.type === "destination")?.visited_at?.expected ?? null;
}

const ORDER_CHAIN: OrderStatus[] = ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED"];

/** Довести заказ до целевого статуса по цепочке допустимых переходов (письма клиентке уходят из setOrderStatus). */
async function advanceOrder(orderId: string, target: OrderStatus, note: string, actorId: string | null) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  const from = ORDER_CHAIN.indexOf(order.status);
  const to = ORDER_CHAIN.indexOf(target);
  if (from < 0 || to <= from) return;
  let current = order.status;
  for (const next of ORDER_CHAIN.slice(from + 1, to + 1)) {
    if (!canTransition(current, next)) return;
    await setOrderStatus(orderId, next, { createdBy: actorId, note: next === target ? note : `Яндекс Доставка: ${note}` });
    current = next;
  }
}

/** Сверить заявку с Яндексом: статус, цена, курьер, ссылка слежения; двигать заказ в «В доставке» и «Доставлен». */
export async function syncYandexClaim(orderId: string, actorId: string | null = null): Promise<YandexShipment> {
  const cfg = await yandexConfig();
  if (!cfg) throw new Error("Интеграция «Яндекс Доставка» не включена");
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const prev = yandexShipment(order.shipmentData);
  if (!prev) throw new Error("Заявка не создана");
  const r = await api<ClaimInfo>({ token: cfg.token, testMode: prev.testMode }, "/claims/info", { query: { claim_id: prev.claimId } });
  if (r.status !== 200 || !r.body.id) throw new Error(apiError(r));
  const info = r.body;
  const status = info.status ?? prev.status;
  const perf = info.performer_info;
  const data: YandexShipment = {
    ...prev,
    status,
    version: info.version ?? prev.version,
    price: priceKopecks(info.pricing?.offer?.price) ?? prev.price,
    finalPrice: priceKopecks(info.pricing?.final_price) ?? prev.finalPrice,
    currency: info.pricing?.currency_rules?.code ?? prev.currency,
    error: info.error_messages?.map((e) => e.message).filter(Boolean).join("; ") || (status === "estimating_failed" ? "адрес не распознан или тариф недоступен в этой зоне" : prev.error),
    performer: perf?.courier_name ? { name: perf.courier_name, car: [perf.car_color, perf.car_model, perf.car_number].filter(Boolean).join(" ") || null, phone: prev.performer?.phone ?? null, phoneExt: prev.performer?.phoneExt ?? null } : prev.performer,
    updatedAt: new Date().toISOString(),
  };
  if (COURIER_ON_WAY.has(status)) {
    const tcfg = { ...cfg, testMode: prev.testMode };
    if (!data.trackingLink) data.trackingLink = await trackingLink(tcfg, prev.claimId).catch(() => null);
    // телефон курьера — переадресация с ограниченным сроком, обновляем при каждой сверке, пока посылка не вручена
    const source = info.route_points?.find((p) => p.type === "source")?.id;
    if (data.performer && source != null && !DELIVERED.has(status)) {
      const ph = await courierPhone(tcfg, prev.claimId, source).catch(() => null);
      if (ph) data.performer = { ...data.performer, phone: ph.phone, phoneExt: ph.ext };
    }
    data.eta = (await destinationEta(tcfg, prev.claimId).catch(() => null)) ?? data.eta;
  }
  const statusChanged = status !== prev.status;
  const changed = statusChanged || data.trackingLink !== prev.trackingLink || data.price !== prev.price || data.finalPrice !== prev.finalPrice;
  const event = statusChanged
    ? `Яндекс Доставка: ${yandexStatusLabel(status)}${status === "ready_for_approval" && data.price ? `, ${formatMoney(data.price)} — подтвердите заявку` : ""}${perf?.courier_name && status === "performer_found" ? ` — ${perf.courier_name}${data.performer?.car ? `, ${data.performer.car}` : ""}` : ""}${data.error && (status === "estimating_failed" || status === "failed") ? ` — ${data.error}` : ""}`
    : null;
  if (changed) await saveShipment(orderId, data, actorId, event);
  else await db.order.update({ where: { id: orderId }, data: { shipmentSyncedAt: new Date() } });
  if (statusChanged) {
    if (PICKED.has(status)) await advanceOrder(orderId, "SHIPPED", "курьер Яндекс Доставки забрал посылку", actorId);
    if (DELIVERED.has(status)) await advanceOrder(orderId, "DELIVERED", "вручено курьером Яндекс Доставки", actorId);
    if (ALARMING.has(status)) {
      void import("@/lib/alerts").then((m) => m.sendAlert(`заказ №${order.number}: Яндекс Доставка — ${yandexStatusLabel(status)}${data.error ? ` (${data.error})` : ""}. Откройте заказ в CRM.`, { key: `yandex-${prev.claimId}-${status}` })).catch(() => null);
    }
  }
  // расход на доставку — в финансы один раз по итоговой цене
  if (status === "delivered_finish" && data.finalPrice && !data.expenseRecorded) {
    await db.$transaction(async (tx) => {
      await tx.ledgerEntry.create({ data: { type: "EXPENSE_SHIPPING", amount: data.finalPrice!, orderId, comment: `Яндекс Доставка по заказу №${order.number}${data.testMode ? " (тест)" : ""}`, createdBy: actorId } });
      await tx.order.update({ where: { id: orderId }, data: { shipmentData: { ...data, expenseRecorded: true } as unknown as Prisma.InputJsonValue } });
    });
    data.expenseRecorded = true;
  }
  return data;
}

/** Подтвердить оценённую заявку: Яндекс начинает искать курьера, деньги списываются с баланса кабинета. */
export async function acceptYandexClaim(orderId: string, actorId: string | null) {
  const cfg = await yandexConfig();
  if (!cfg) throw new Error("Интеграция «Яндекс Доставка» не включена");
  const s = await syncYandexClaim(orderId, actorId);
  if (s.status !== "ready_for_approval") {
    throw new Error(s.status === "new" || s.status === "estimating" ? "Оценка ещё не завершена: обновите статус через несколько секунд" : `Заявку нельзя подтвердить: ${yandexStatusLabel(s.status)}${s.error ? ` — ${s.error}` : ""}`);
  }
  const r = await api<{ id?: string; status?: string; version?: number }>({ token: cfg.token, testMode: s.testMode }, "/claims/accept", { query: { claim_id: s.claimId }, body: { version: s.version } });
  if (r.status !== 200) throw new Error(r.status === 409 ? "Заявка изменилась на стороне Яндекса: обновите статус и подтвердите ещё раз" : apiError(r));
  const data: YandexShipment = { ...s, status: r.body.status ?? "accepted", version: r.body.version ?? s.version, acceptedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await saveShipment(orderId, data, actorId, `Заявка Яндекс Доставки подтверждена${data.price ? ` за ${formatMoney(data.price)}` : ""}: ищем курьера`);
  return data;
}

/**
 * Отменить заявку. Пока курьер не назначен, отмена бесплатна; дальше — платная, и без confirmPaid возвращается
 * предупреждение с ценой вместо отмены.
 */
export async function cancelYandexClaim(orderId: string, actorId: string | null, opts: { confirmPaid?: boolean } = {}): Promise<{ cancelled: boolean; paid: boolean; price: number | null; status: string }> {
  const cfg = await yandexConfig();
  if (!cfg) throw new Error("Интеграция «Яндекс Доставка» не включена");
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const prev = yandexShipment(order.shipmentData);
  if (!prev) throw new Error("Заявка не создана");
  if (YANDEX_TERMINAL.has(prev.status)) throw new Error(`Заявка уже закрыта: ${yandexStatusLabel(prev.status)}`);
  const tcfg = { token: cfg.token, testMode: prev.testMode };
  const ci = await api<{ cancel_state?: "free" | "paid"; price?: string }>(tcfg, "/claims/cancel-info", { query: { claim_id: prev.claimId } });
  if (ci.status !== 200 || !ci.body.cancel_state) throw new Error(apiError(ci));
  const paid = ci.body.cancel_state === "paid";
  const price = priceKopecks(ci.body.price);
  if (paid && !opts.confirmPaid) return { cancelled: false, paid, price, status: prev.status };
  let r = await api<{ status?: string }>(tcfg, "/claims/cancel", { query: { claim_id: prev.claimId }, body: { version: prev.version, cancel_state: ci.body.cancel_state } });
  if (r.status === 409) {
    // версия заявки устарела — берём свежую и повторяем один раз
    const fresh = await syncYandexClaim(orderId, actorId);
    r = await api<{ status?: string }>(tcfg, "/claims/cancel", { query: { claim_id: prev.claimId }, body: { version: fresh.version, cancel_state: ci.body.cancel_state } });
  }
  if (r.status !== 200) throw new Error(apiError(r));
  const status = r.body.status ?? (paid ? "cancelled_with_payment" : "cancelled");
  const data: YandexShipment = { ...prev, status, updatedAt: new Date().toISOString() };
  await saveShipment(orderId, data, actorId, `Заявка Яндекс Доставки отменена${paid ? ` (платная отмена${price ? `, ${formatMoney(price)}` : ""})` : ""}`);
  return { cancelled: true, paid, price, status };
}

/** Сверка всех незакрытых заявок (каждые 5 минут планировщиком; вебхук Яндекса — быстрее, это страховка). */
export async function syncActiveYandexClaims() {
  const cfg = await yandexConfig();
  if (!cfg) return { checked: 0, changed: 0 };
  const orders = await db.order.findMany({
    where: { deliveryMethod: "YANDEX", shipmentId: { not: null }, shipmentStatus: { notIn: [...YANDEX_TERMINAL] }, status: { in: ["PAID", "CONFIRMED", "PACKING", "SHIPPED"] } },
    select: { id: true, shipmentData: true },
  });
  let changed = 0;
  for (const o of orders) {
    if (!yandexShipment(o.shipmentData)) continue;
    try {
      const before = yandexShipment(o.shipmentData)!.status;
      if ((await syncYandexClaim(o.id)).status !== before) changed++;
    } catch {
      // ошибка одной заявки не останавливает сверку остальных
    }
  }
  return { checked: orders.length, changed };
}

/** Проверка из CRM → Интеграции: токен принимается, адрес забора распознаётся до координат. */
export async function testYandex(config: Record<string, string>): Promise<{ ok: true; info?: string } | { ok: false; error: string }> {
  const cfg = parseYandexConfig(config, await getSetting("brand"));
  if (!cfg.token) return { ok: false, error: "Укажите OAuth-токен" };
  const r = await api<{ claims?: unknown[] }>(cfg, "/claims/search", { body: { limit: 1 } });
  if (r.status !== 200) return { ok: false, error: apiError(r) };
  const notes: string[] = [`Токен принят${cfg.testMode ? " (тестовый контур)" : ""}`];
  if (!cfg.senderAddress) return { ok: false, error: `${notes[0]}, но не указан адрес забора посылок — без него заявку не создать` };
  if (!cfg.senderPhone) return { ok: false, error: `${notes[0]}, но не указан телефон на точке забора — по нему курьер звонит перед приездом` };
  try {
    const p = await senderPoint(cfg);
    notes.push(`точка забора: ${p.fullname} (${p.coordinates[1].toFixed(5)}, ${p.coordinates[0].toFixed(5)})`);
  } catch (e) {
    return { ok: false, error: `${notes[0]}, но ${e instanceof Error ? e.message : "адрес забора не распознан"}` };
  }
  const dadata = await activeIntegration("dadata");
  if (!dadata?.config.token && !cfg.geocoderKey) notes.push("адреса клиенток геокодировать нечем: подключите DaData или укажите ключ Геокодера");
  return { ok: true, info: notes.join("; ") };
}
