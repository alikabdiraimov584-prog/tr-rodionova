import { readBoundedBody } from "@/lib/read-bounded-body";
import { handleYookassaEvent } from "@/lib/payments/yookassa";
import { checkRate, clientIp } from "@/lib/ratelimit";

/** Вебхук ЮKassa: укажите https://<host>/api/payments/yookassa в личном кабинете ЮKassa (события payment.succeeded, payment.canceled). */
export async function POST(request: Request) {
  // Публичный endpoint делает авторизованный запрос к API ЮKassa для каждого события.
  // Ограничиваем поток с одного проверенного адреса, чтобы не допустить API/ресурсного DoS.
  const ip = await clientIp();
  if (ip) {
    const rate = await checkRate(`yookassa-webhook:${ip}`, { limit: 120, windowSec: 60, lockSec: 60 });
    if (!rate.ok) return new Response("rate limited", { status: 429, headers: { "Retry-After": String(rate.retryAfterSec), "Cache-Control": "no-store" } });
  }
  const raw = await readBoundedBody(request, 65_536);
  if (raw === null) return new Response("payload too large or invalid UTF-8", { status: 413, headers: { "Cache-Control": "no-store" } });
  let body: { event?: string; object?: { id?: string } };
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return new Response("bad request", { status: 400 });
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    await handleYookassaEvent(body);
  } catch (e) {
    console.error("yookassa webhook", e);
    return new Response("error", { status: 500 }); // ЮKassa повторит уведомление
  }
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
