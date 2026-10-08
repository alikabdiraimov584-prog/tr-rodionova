import { handleWebhook, verifySignature, type WebhookKind } from "@/lib/payments/cloudpayments";
import { recordCheck } from "@/lib/integrations/store";

/**
 * Вебхуки CloudPayments. В кабинете (Сайты → Уведомления) для Pay, Fail и Refund укажите один адрес как есть:
 *   https://<host>/api/payments/cloudpayments
 * Вид уведомления определяется по телу (прежние адреса с ?kind=pay | fail | refund тоже работают).
 * Подпись Content-HMAC проверяется по API Secret; формат тела — form-urlencoded или JSON.
 */
export async function POST(request: Request) {
  const param = new URL(request.url).searchParams.get("kind");
  const kind: WebhookKind | null = param === "pay" || param === "fail" || param === "refund" ? param : null;
  const raw = await request.text();
  if (!(await verifySignature(raw, request.headers.get("content-hmac")))) {
    // видно в CRM → Интеграции как ошибка: обычно API Secret в CRM не совпадает с кабинетом или выключена подпись HMAC
    await recordCheck("cloudpayments", false, "Уведомление отклонено: неверная подпись HMAC (проверьте API Secret и настройку подписи в кабинете)").catch(() => undefined);
    return new Response("bad signature", { status: 401 });
  }
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
    if (!r.ok) console.warn("cloudpayments webhook", kind ?? "auto", r.reason);
    else await recordCheck("cloudpayments", true).catch(() => undefined);
  } catch (e) {
    console.error("cloudpayments webhook", e);
    return Response.json({ code: 13 }, { status: 500 }); // CloudPayments повторит уведомление
  }
  return Response.json({ code: 0 });
}
