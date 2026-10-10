import { db } from "@/lib/db";
import { syncYandexClaim } from "@/lib/delivery/yandex";

/**
 * Уведомления Яндекс Доставки о смене статуса заявки (callback_url передаётся при создании заявки, настраивать
 * в кабинете ничего не нужно). Тело не подписано, поэтому ему не верим: берём только claim_id и сверяем заявку
 * запросом к API. Повтор того же статуса чаще раза в 5 секунд пропускаем — страховка от шторма уведомлений.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { claim_id?: string; status?: string } | null;
  const claimId = typeof body?.claim_id === "string" ? body.claim_id.trim() : "";
  if (!claimId || claimId.length > 128) return Response.json({ ok: false }, { status: 400 });
  const order = await db.order.findFirst({ where: { shipmentId: claimId, deliveryMethod: "YANDEX" }, select: { id: true, shipmentStatus: true, shipmentSyncedAt: true } });
  const sameRecently = !!order?.shipmentSyncedAt && Date.now() - order.shipmentSyncedAt.getTime() < 5_000 && (!body?.status || body.status === order.shipmentStatus);
  if (order && !sameRecently) {
    await syncYandexClaim(order.id).catch((e) => console.warn("yandex delivery callback", claimId, e instanceof Error ? e.message : e));
  }
  return Response.json({ ok: true });
}
