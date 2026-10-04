import { handleWebhook } from "@/lib/payments/dolyame";

/**
 * Уведомления Долями: адрес передаётся в каждой заявке (notification_url = https://<host>/api/payments/dolyame).
 * Тело — JSON { id, status, ... }. Статус перепроверяется запросом info к Долями, поэтому подделка уведомления
 * ничего не меняет; отвечаем 200, иначе Долями повторяют отправку.
 */
export async function POST(request: Request) {
  let body: { id?: string; status?: string };
  try {
    body = (await request.json()) as { id?: string; status?: string };
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  try {
    const r = await handleWebhook(body, ip);
    if (!r.ok) console.warn("dolyame webhook", r.reason, body.id);
  } catch (e) {
    console.error("dolyame webhook", e);
    return new Response("error", { status: 500 });
  }
  return new Response("ok");
}
