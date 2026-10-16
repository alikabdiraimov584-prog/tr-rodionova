import { readBoundedBody } from "@/lib/read-bounded-body";
import { handleWebhook } from "@/lib/payments/dolyame";
import { checkRate, clientIp } from "@/lib/ratelimit";

/**
 * Уведомления Долями: адрес передаётся в каждой заявке (notification_url = https://<host>/api/payments/dolyame).
 * Тело — JSON { id, status, ... }. Статус перепроверяется запросом info к Долями, поэтому подделка уведомления
 * ничего не меняет; отвечаем 200, иначе Долями повторяют отправку.
 */
export async function POST(request: Request) {
  // Обработчик перепроверяет статус через API партнёра; ограничиваем число внешних запросов.
  const ip = await clientIp();
  if (ip) {
    const rate = await checkRate(`dolyame-webhook:${ip}`, { limit: 120, windowSec: 60, lockSec: 60 });
    if (!rate.ok) return new Response("rate limited", { status: 429, headers: { "Retry-After": String(rate.retryAfterSec), "Cache-Control": "no-store" } });
  }
  const raw = await readBoundedBody(request, 16_384);
  if (raw === null) return new Response("payload too large or invalid UTF-8", { status: 413, headers: { "Cache-Control": "no-store" } });
  let body: { id?: string; status?: string };
  try {
    body = JSON.parse(raw) as { id?: string; status?: string };
    if (!body || typeof body !== "object" || Array.isArray(body)) return new Response("bad request", { status: 400 });
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    const r = await handleWebhook(body, ip);
    if (!r.ok) console.warn("dolyame webhook", r.reason, body.id);
  } catch (e) {
    console.error("dolyame webhook", e);
    return new Response("error", { status: 500 });
  }
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
