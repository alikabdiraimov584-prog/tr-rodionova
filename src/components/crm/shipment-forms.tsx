"use client";

import { useActionState } from "react";
import { createCdekShipmentAction, syncCdekShipmentAction } from "@/app/actions/crm-shipments";

export function CdekShipmentForm({ orderId, shipmentId, statusLabel, syncedAt, canCreate }: { orderId: string; shipmentId: string | null; statusLabel: string; syncedAt: string | null; canCreate: boolean }) {
  const [created, createAction, creating] = useActionState(createCdekShipmentAction, undefined);
  const [synced, syncAction, syncing] = useActionState(syncCdekShipmentAction, undefined);
  const state = created ?? synced;
  return (
    <div className="space-y-3 text-sm">
      {shipmentId ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <span>Статус СДЭК: <strong>{statusLabel}</strong></span>
            {syncedAt && <span className="text-xs text-muted">сверено {syncedAt}</span>}
          </div>
          <div className="text-xs text-muted break-all">uuid {shipmentId}</div>
          <form action={syncAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <button className="btn-outline btn-sm" disabled={syncing}>{syncing ? "Запрашиваем…" : "Обновить статус"}</button>
          </form>
        </>
      ) : canCreate ? (
        <form action={createAction} className="space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          <p className="text-muted">Отправление создаётся в СДЭК по адресу заказа; накладная и статусы подтянутся автоматически.</p>
          <button className="btn-primary btn-sm" disabled={creating}>{creating ? "Создаём…" : "Создать отправление в СДЭК"}</button>
        </form>
      ) : (
        <p className="text-muted">Отправление создаётся после оплаты, до отгрузки.</p>
      )}
      {state?.error && <p className="text-danger">{state.error}</p>}
      {state?.message && <p className="text-success">{state.message}</p>}
    </div>
  );
}
