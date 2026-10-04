import { handleWebhook, verifySignature } from "@/lib/payments/cloudpayments";

/**
 * Вебхуки CloudPayments. В кабинете (Сайты → Уведомления) укажите один адрес для Pay, Fail и Refund:
 *   https://<host>/api/payments/cloudpayments?kind=pay | fail | refund
 * Подпись Content-HMAC проверяется по API Secret; формат тела — form-urlencoded или JSON.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "pay" && kind !== "fail" && kind !== "refund") return Response.json({ code: 13 }, { status: 400 });
  const raw = await request.text();
  if (!(await verifySignature(raw, request.headers.get("content-hmac")))) return new Response("bad signature", { status: 401 });
  let fields: Record<string, string> = {};
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(j)) fields[k] = v == null ? "" : String(v);
    } else {
      fields = Object.fromEntries(new URLSearchParams(raw));
    }
  } catch {
    return Response.json({ code: 13 }, { status: 400 });
  }
  try {
    const r = await handleWebhook(kind, fields);
    if (!r.ok) console.warn("cloudpayments webhook", kind, r.reason);
  } catch (e) {
    console.error("cloudpayments webhook", e);
    return Response.json({ code: 13 }, { status: 500 }); // CloudPayments повторит уведомление
  }
  return Response.json({ code: 0 });
}
