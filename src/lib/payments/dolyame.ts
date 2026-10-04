import "server-only";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { markOrderPaid } from "@/lib/orders";
import { activeIntegration } from "@/lib/integrations/store";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Долями (Т-Банк): оплата четырьмя частями без переплаты. Партнёрский API partner.dolyame.ru:
 * Basic-авторизация логином и паролем от менеджера плюс клиентский сертификат (mTLS) из кабинета Т-Бизнес (T-API).
 *
 * Поток: create → ссылка на страницу Долями → клиентка проходит одобрение → вебхуки approved / wait_for_commit →
 * магазин подтверждает заказ (commit) → committed → completed, когда выплачены все части. Деньги магазину приходят
 * целиком после commit; cancel до commit, refund после. Уведомлениям не доверяем — перепроверяем статус запросом info.
 *
 * Чеки 54-ФЗ: если включено поле «чеки через CloudKassir», при одобрении уходит чек предоплаты, при вручении —
 * чек полного расчёта (src/lib/payments/fiscal.ts). Иначе фискализацию выполняет Долями по настройкам в их кабинете.
 */

const DEFAULT_API = "https://partner.dolyame.ru";
const RUB = 100;
/** Диапазон суммы заказа для Долями по умолчанию (рубли); уточняется в договоре и настраивается в интеграции. */
const DEFAULT_MIN = 1_000;
const DEFAULT_MAX = 150_000;

export type DolyameStatus = "new" | "approved" | "wait_for_commit" | "committed" | "completed" | "rejected" | "canceled" | "refunded" | string;

type Creds = { login: string; password: string; cert: string; key: string; baseUrl: string; autoCommit: boolean; fiscalize: boolean; min: number; max: number };

async function credentials(): Promise<Creds | null> {
  const i = await activeIntegration("dolyame");
  const c = i?.config;
  if (!c?.login || !c.password || !c.cert || !c.key) return null;
  return {
    login: c.login,
    password: c.password,
    cert: c.cert,
    key: c.key,
    baseUrl: (c.baseUrl || DEFAULT_API).replace(/\/$/, ""),
    autoCommit: c.autoCommit !== "0",
    fiscalize: c.fiscalize === "1",
    min: Number(c.minAmount) > 0 ? Number(c.minAmount) : DEFAULT_MIN,
    max: Number(c.maxAmount) > 0 ? Number(c.maxAmount) : DEFAULT_MAX,
  };
}

export async function dolyameEnabled() {
  return !!(await credentials());
}

/** Доступна ли оплата Долями для суммы (копейки): интеграция включена и сумма в допустимом диапазоне. */
export async function dolyameAvailableFor(totalKopecks: number) {
  const c = await credentials();
  if (!c) return false;
  const rub = totalKopecks / RUB;
  return rub >= c.min && rub <= c.max;
}

export class DolyameError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
  }
}

/** HTTPS-запрос с клиентским сертификатом: глобальный fetch (undici) сертификаты не принимает. */
export function request<T>(creds: Pick<Creds, "login" | "password" | "cert" | "key" | "baseUrl">, method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; data: T; correlationId: string }> {
  const url = new URL(creds.baseUrl + path);
  const correlationId = randomUUID();
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        cert: creds.cert,
        key: creds.key,
        auth: `${creds.login}:${creds.password}`,
        headers: {
          Accept: "application/json",
          "X-Correlation-ID": correlationId,
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data: unknown = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            data = { raw: text.slice(0, 300) };
          }
          resolve({ status: res.statusCode ?? 0, data: data as T, correlationId });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Долями не ответили за 15 секунд")));
    req.on("error", (e) => reject(e));
    if (payload) req.write(payload);
    req.end();
  });
}

async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const c = await credentials();
  if (!c) throw new Error("Долями не подключены: CRM → Интеграции → Долями");
  const r = await request<T & { message?: string; error?: string; detail?: string }>(c, method, path, body);
  if (r.status >= 400) {
    const d = r.data as { message?: string; error?: string; detail?: string } | undefined;
    throw new DolyameError(`Долями: ${d?.message ?? d?.error ?? d?.detail ?? `HTTP ${r.status}`} (запрос ${r.correlationId})`, r.status, r.data);
  }
  return r.data;
}

/** Проверка подключения: запрос info по несуществующему заказу. 404 — ключи и сертификат приняты; 401/403 — неверный логин; ошибка TLS — сертификат. */
export async function testCredentials(config: Record<string, string>) {
  if (!config.login || !config.password) return { ok: false as const, error: "Укажите логин и пароль" };
  if (!config.cert?.includes("BEGIN CERTIFICATE") || !config.key?.includes("PRIVATE KEY")) return { ok: false as const, error: "Вставьте сертификат и закрытый ключ в формате PEM (целиком, с BEGIN/END)" };
  try {
    const r = await request<unknown>({ login: config.login, password: config.password, cert: config.cert, key: config.key, baseUrl: (config.baseUrl || DEFAULT_API).replace(/\/$/, "") }, "GET", `/v1/orders/trcheck-${Date.now().toString(36)}/info`);
    if (r.status === 404) return { ok: true as const, info: "Логин, пароль и сертификат приняты" };
    if (r.status === 401 || r.status === 403) return { ok: false as const, error: "Долями отклонили логин или пароль" };
    if (r.status === 400 && JSON.stringify(r.data).includes("SSL")) return { ok: false as const, error: "Сервер не принял клиентский сертификат" };
    if (r.status < 400) return { ok: true as const, info: `Ответ ${r.status}: подключение работает` };
    return { ok: false as const, error: `Долями ответили HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 160)}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/PEM|key|cert|SSL|TLS|handshake/i.test(msg)) return { ok: false as const, error: `Сертификат не подошёл: ${msg}` };
    return { ok: false as const, error: msg };
  }
}

type DolyameItem = { name: string; quantity: number; price: number; sku?: string };
type OrderPayload = { provider?: string; confirmation_url?: string; dolyameId?: string; status?: string; committedAt?: string; receipts?: Record<string, unknown> };
/** payload платежа — JSON в базе; необязательные поля не нравятся типу Prisma, поэтому приводим явно */
const asJson = (x: object) => x as Prisma.InputJsonObject;

function toItems(order: { items: { productName: string; size: string; quantity: number; price: number; sku: string }[]; deliveryCost: number; discount: number; pointsUsed: number; giftUsed: number; total: number }): { items: DolyameItem[]; amount: number; prepaid: number } {
  // Долями считают сумму заказа как Σ price × quantity; скидки учитываем через цены позиций (единицы отдельными строками)
  const goods = order.items.filter((i) => i.quantity > 0);
  const goodsSum = goods.reduce((s, i) => s + i.price * i.quantity, 0);
  const target = Math.max(0, order.total + order.giftUsed - order.deliveryCost);
  let items: DolyameItem[];
  if (goodsSum <= target || goodsSum === 0) {
    items = goods.map((i) => ({ name: `${i.productName} ${i.size}`.trim().slice(0, 128), quantity: i.quantity, price: i.price / RUB, sku: i.sku }));
  } else {
    const units = goods.flatMap((i) => Array.from({ length: i.quantity }, () => ({ name: `${i.productName} ${i.size}`.trim().slice(0, 128), price: i.price, sku: i.sku })));
    let left = target;
    items = units.map((u, idx) => {
      const amount = idx === units.length - 1 ? left : Math.round((u.price / goodsSum) * target);
      left -= amount;
      return { name: u.name, quantity: 1, price: amount / RUB, sku: u.sku };
    });
  }
  if (order.deliveryCost > 0) items.push({ name: "Доставка", quantity: 1, price: order.deliveryCost / RUB });
  // prepaid_amount — часть, уже оплаченная (сертификатом); amount — то, что делится на четыре платежа
  return { items, amount: order.total / RUB, prepaid: order.giftUsed / RUB };
}

type CreateResponse = { id?: string; status?: DolyameStatus; link?: string };

/** Создать заявку Долями и вернуть ссылку на их страницу. Номер заявки — id платежа (≤ 30 символов). */
export async function createOrderPayment(orderId: string, returnUrl: string) {
  const c = await credentials();
  if (!c) throw new Error("Долями не подключены");
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { where: { status: "PENDING" }, take: 1 }, items: true } });
  if (order.status !== "NEW") throw new Error("Заказ уже оплачен или отменён");
  const payment = order.payments[0];
  if (!payment) throw new Error("Платёж не найден");
  const saved = payment.payload as OrderPayload | null;
  if (saved?.provider === "dolyame" && saved.confirmation_url) return saved.confirmation_url;
  const rub = order.total / RUB;
  if (rub < c.min || rub > c.max) throw new Error(`Долями принимают заказы от ${c.min.toLocaleString("ru-RU")} до ${c.max.toLocaleString("ru-RU")} ₽. Выберите другой способ оплаты.`);
  const { items, amount, prepaid } = toItems(order);
  const base = process.env.APP_URL ?? new URL(returnUrl).origin;
  const body = {
    order: { id: payment.id, amount, ...(prepaid > 0 ? { prepaid_amount: prepaid } : {}), items },
    client_info: { first_name: order.firstName, ...(order.lastName ? { last_name: order.lastName } : {}), phone: order.phone.replace(/[^\d+]/g, ""), ...(order.email ? { email: order.email } : {}) },
    notification_url: `${base}/api/payments/dolyame`,
    success_url: returnUrl,
    fail_url: returnUrl.includes("?") ? `${returnUrl}&failed=1` : `${returnUrl}?failed=1`,
  };
  const r = await api<CreateResponse>("POST", "/v1/orders/create", body);
  if (!r.link) throw new Error("Долями не вернули ссылку на оплату");
  await db.payment.update({ where: { id: payment.id }, data: { payload: asJson({ ...(saved ?? {}), provider: "dolyame", confirmation_url: r.link, dolyameId: payment.id, status: r.status ?? "new" }) } });
  await db.order.update({ where: { id: orderId }, data: { paymentUrl: r.link } });
  return r.link;
}

type InfoResponse = { id?: string; status?: DolyameStatus; amount?: number; residual_amount?: number; refund_info?: unknown };

export async function info(dolyameId: string) {
  return api<InfoResponse>("GET", `/v1/orders/${encodeURIComponent(dolyameId)}/info`);
}

const PAID_STATUSES = new Set<DolyameStatus>(["approved", "wait_for_commit", "committed", "completed"]);
const FAILED_STATUSES = new Set<DolyameStatus>(["rejected", "canceled"]);

/**
 * Сверить заявку с Долями и отразить в заказе: одобрение → заказ оплачен (и commit, если включён автокоммит),
 * отказ или отмена → платёж помечен. Вызывается из вебхука и при возврате клиентки со страницы Долями.
 */
export async function settle(dolyameId: string): Promise<{ ok: boolean; status?: string; reason?: string }> {
  const payment = await db.payment.findFirst({ where: { id: dolyameId }, include: { order: { include: { items: true } } } });
  if (!payment) return { ok: false, reason: "unknown payment" };
  const payload = (payment.payload as OrderPayload | null) ?? {};
  if (payload.provider !== "dolyame") return { ok: false, reason: "not a dolyame payment" };
  const fresh = await info(dolyameId);
  const status = fresh.status ?? "unknown";
  const order = payment.order;
  if (PAID_STATUSES.has(status)) {
    if (fresh.amount !== undefined && Math.round(fresh.amount * RUB) !== order.total) return { ok: false, reason: "amount mismatch" };
    if (order.status === "NEW") {
      await markOrderPaid(order.id, { externalId: `dolyame:${dolyameId}` });
      const c = await credentials();
      if (c?.fiscalize) void import("@/lib/payments/fiscal").then((m) => m.issueReceiptInBackground(order.id, "prepayment", null));
    }
    let committedAt = payload.committedAt;
    if (status === "wait_for_commit" && !committedAt) {
      const c = await credentials();
      if (c?.autoCommit) {
        const { items, amount, prepaid } = toItems(order);
        await api<unknown>("POST", `/v1/orders/${encodeURIComponent(dolyameId)}/commit`, { amount, ...(prepaid > 0 ? { prepaid_amount: prepaid } : {}), items });
        committedAt = new Date().toISOString();
        await db.orderEvent.create({ data: { orderId: order.id, message: "Долями: заявка подтверждена магазином (commit)" } });
      }
    }
    await db.payment.update({ where: { id: payment.id }, data: { payload: asJson({ ...payload, status, ...(committedAt ? { committedAt } : {}) }) } });
    return { ok: true, status };
  }
  if (FAILED_STATUSES.has(status)) {
    await db.payment.update({ where: { id: payment.id }, data: { payload: asJson({ ...payload, status }) } });
    if (order.status === "NEW") await db.orderEvent.create({ data: { orderId: order.id, message: status === "rejected" ? "Долями: заявка отклонена, клиентка может выбрать другой способ оплаты" : "Долями: заявка отменена" } });
    return { ok: true, status };
  }
  await db.payment.update({ where: { id: payment.id }, data: { payload: asJson({ ...payload, status }) } });
  return { ok: true, status };
}

/** Подтвердить заявку вручную (если автокоммит выключен): вызывается из CRM после отгрузки. */
export async function commit(orderId: string) {
  const payment = await db.payment.findFirst({ where: { orderId, status: { in: ["SUCCEEDED", "PENDING"] } }, include: { order: { include: { items: true } } }, orderBy: { createdAt: "desc" } });
  const payload = (payment?.payload as OrderPayload | null) ?? {};
  if (!payment || payload.provider !== "dolyame") throw new Error("Заказ оплачен не через Долями");
  if (payload.committedAt) return;
  const { items, amount, prepaid } = toItems(payment.order);
  await api<unknown>("POST", `/v1/orders/${encodeURIComponent(payment.id)}/commit`, { amount, ...(prepaid > 0 ? { prepaid_amount: prepaid } : {}), items });
  await db.payment.update({ where: { id: payment.id }, data: { payload: asJson({ ...payload, committedAt: new Date().toISOString() }) } });
  await db.orderEvent.create({ data: { orderId, message: "Долями: заявка подтверждена магазином (commit)" } });
}

/** Отмена заявки до подтверждения (заказ не оплачен или отменён до отгрузки): деньги клиентке не списываются. */
export async function cancelIfPending(orderId: string) {
  const c = await credentials();
  if (!c) return;
  const payment = await db.payment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
  const payload = (payment?.payload as OrderPayload | null) ?? {};
  if (!payment || payload.provider !== "dolyame" || payload.committedAt) return;
  if (payload.status && FAILED_STATUSES.has(payload.status)) return;
  try {
    await api<unknown>("POST", `/v1/orders/${encodeURIComponent(payment.id)}/cancel`, {});
    await db.payment.update({ where: { id: payment.id }, data: { payload: asJson({ ...payload, status: "canceled" }) } });
    await db.orderEvent.create({ data: { orderId, message: "Долями: заявка отменена" } });
  } catch (e) {
    // заявки в статусе new ещё нет на стороне банка или она уже закрыта — это не ошибка заказа
    if (!(e instanceof DolyameError && (e.status === 404 || e.status === 409))) console.error("dolyame cancel", orderId, e);
  }
}

/** Возврат после подтверждения (полный или частичный), сумма в копейках. Инициируется из CRM. */
export async function refund(orderId: string, amountKopecks: number) {
  const payment = await db.payment.findFirst({ where: { orderId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } }, include: { order: { include: { items: true } } } });
  const payload = (payment?.payload as OrderPayload | null) ?? {};
  if (!payment || payload.provider !== "dolyame") throw new Error("Заказ оплачен не через Долями");
  await api<unknown>("POST", `/v1/orders/${encodeURIComponent(payment.id)}/refund`, { amount: amountKopecks / RUB });
  await db.orderEvent.create({ data: { orderId, message: `Долями: возврат ${(amountKopecks / RUB).toLocaleString("ru-RU")} ₽ отправлен` } });
}

/** Уведомление Долями (notification_url): тело { id, status, amount, ... }. Доверяем только статусу из info. */
export async function handleWebhook(body: { id?: string; status?: string }, remoteIp: string | null) {
  if (!body?.id) return { ok: false, reason: "no id" };
  if (remoteIp && !isDolyameIp(remoteIp)) console.warn("dolyame webhook from unexpected ip", remoteIp);
  return settle(String(body.id));
}

/** Диапазоны адресов, с которых Долями шлют уведомления (из документации; проверка статуса через info всё равно обязательна). */
const WEBHOOK_RANGES = [
  ["91.194.226.0", 23],
  ["91.218.132.0", 22],
  ["212.233.80.0", 22],
] as const;

function ipToInt(ip: string) {
  const p = ip.trim().split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

export function isDolyameIp(ip: string) {
  const n = ipToInt(ip);
  if (n === null) return false;
  return WEBHOOK_RANGES.some(([base, bits]) => {
    const b = ipToInt(base)!;
    const mask = (~0 << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((b & mask) >>> 0);
  });
}

/** При возврате клиентки со страницы Долями: сверить заявку, если вебхук ещё не дошёл. */
export async function syncOrderPayment(orderId: string) {
  if (!(await dolyameEnabled())) return;
  const payment = await db.payment.findFirst({ where: { orderId, status: "PENDING" } });
  const payload = payment?.payload as OrderPayload | null;
  if (!payment || payload?.provider !== "dolyame") return;
  await settle(payment.id).catch((e) => console.error("dolyame sync", orderId, e));
}
