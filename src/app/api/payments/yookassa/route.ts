import { handleYookassaEvent } from "@/lib/payments/yookassa";

/** Вебхук ЮKassa: укажите https://<host>/api/payments/yookassa в личном кабинете ЮKassa (события payment.succeeded, payment.canceled). */
export async function POST(request: Request) {
  let body: { event?: string; object?: { id?: string } };
  try {
    body = await request.json();
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
