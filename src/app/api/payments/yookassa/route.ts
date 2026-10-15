import { readBoundedBody } from "@/lib/read-bounded-body";
import { handleYookassaEvent } from "@/lib/payments/yookassa";

/** Вебхук ЮKassa: укажите https://<host>/api/payments/yookassa в личном кабинете ЮKassa (события payment.succeeded, payment.canceled). */
export async function POST(request: Request) {
  const raw = await readBoundedBody(request, 65_536);
  if (raw === null) return new Response("payload too large or invalid UTF-8", { status: 413 });
  let body: { event?: string; object?: { id?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    await handleYookassaEvent(body);
  } catch (e) {
    console.error("yookassa webhook", e);
    return new Response("error", { status: 500 }); // ЮKassa повторит уведомление
  }
  return new Response("ok");
}
