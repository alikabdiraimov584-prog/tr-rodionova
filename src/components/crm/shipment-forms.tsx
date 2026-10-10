"use client";

import { useActionState } from "react";
import { acceptYandexClaimAction, cancelYandexClaimAction, createCdekShipmentAction, createYandexClaimAction, syncCdekShipmentAction, syncYandexClaimAction } from "@/app/actions/crm-shipments";
import { formatMoney } from "@/lib/money";

export type YandexShipmentView = {
  claimId: string;
  status: string;
  label: string;
  terminal: boolean;
  price: number | null;
  finalPrice: number | null;
  trackingLink: string | null;
  eta: string | null;
  performer: { name: string; car: string | null; phone: string | null; phoneExt: string | null } | null;
  error: string | null;
};

/**
 * Карточка Яндекс Доставки в заказе: вызвать курьера (заявка оценивается, цена видна до подтверждения), подтвердить,
 * обновить статус, отменить. Платная отмена требует второго нажатия: действие возвращает code PAID_CANCEL с ценой.
 */
export function YandexShipmentForm({ orderId, shipment, canCreate, canEdit, syncedAt }: { orderId: string; shipment: YandexShipmentView | null; canCreate: boolean; canEdit: boolean; syncedAt: string | null }) {
  const [created, createAction, creating] = useActionState(createYandexClaimAction, undefined);
  const [accepted, acceptAction, accepting] = useActionState(acceptYandexClaimAction, undefined);
  const [synced, syncAction, syncing] = useActionState(syncYandexClaimAction, undefined);
  const [cancelled, cancelAction, cancelling] = useActionState(cancelYandexClaimAction, undefined);
  const state = cancelled ?? accepted ?? created ?? synced;
  const paidCancel = cancelled?.code === "PAID_CANCEL";
  const active = !!shipment && !shipment.terminal;
  const price = shipment?.finalPrice ?? shipment?.price ?? null;
  return (
    <div className="space-y-3 text-sm">
      {shipment && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span>Статус: <strong>{shipment.label}</strong></span>
            {syncedAt && <span className="text-xs text-muted">сверено {syncedAt}</span>}
          </div>
          {price != null && <div>Стоимость доставки{shipment.finalPrice ? "" : " (оценка)"}: <strong>{formatMoney(price)}</strong></div>}
          {shipment.performer && (
            <div>
              Курьер: {shipment.performer.name}{shipment.performer.car ? `, ${shipment.performer.car}` : ""}
              {shipment.performer.phone && <> · <a href={`tel:${shipment.performer.phone}`} className="underline">{shipment.performer.phone}</a>{shipment.performer.phoneExt ? ` доб. ${shipment.performer.phoneExt}` : ""}</>}
            </div>
          )}
          {shipment.eta && <div className="text-muted">Ожидаемое прибытие к клиентке: {shipment.eta}</div>}
          {shipment.trackingLink && <a href={shipment.trackingLink} target="_blank" rel="noreferrer" className="inline-block text-xs underline">Следить за курьером на карте ↗</a>}
          {shipment.error && <p className="text-danger">{shipment.error}</p>}
          <div className="text-xs text-muted break-all">заявка {shipment.claimId}</div>
        </>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {shipment?.status === "ready_for_approval" && (
            <form action={acceptAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <button className="btn-primary btn-sm" disabled={accepting}>{accepting ? "Подтверждаем…" : `Подтвердить${shipment.price ? ` за ${formatMoney(shipment.price)}` : ""}`}</button>
            </form>
          )}
          {active && (
            <form action={syncAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <button className="btn-outline btn-sm" disabled={syncing}>{syncing ? "Запрашиваем…" : "Обновить статус"}</button>
            </form>
          )}
          {active && (
            <form action={cancelAction}>
              <input type="hidden" name="orderId" value={orderId} />
              {paidCancel && <input type="hidden" name="confirmPaid" value="1" />}
              <button className={paidCancel ? "btn-primary btn-sm" : "btn-sm text-xs text-muted hover:text-danger"} disabled={cancelling}>{cancelling ? "Отменяем…" : paidCancel ? "Отменить платно" : "Отменить заявку"}</button>
            </form>
          )}
          {!active && canCreate && (
            <form action={createAction} className="space-y-2">
              <input type="hidden" name="orderId" value={orderId} />
              <p className="text-muted">{shipment ? "Предыдущая заявка закрыта — курьера можно вызвать заново." : "Сначала Яндекс покажет цену, курьер поедет за посылкой после подтверждения — вызывайте, когда заказ собран."}</p>
              <button className="btn-primary btn-sm" disabled={creating}>{creating ? "Создаём заявку…" : shipment ? "Вызвать курьера заново" : "Вызвать курьера"}</button>
            </form>
          )}
          {!active && !canCreate && !shipment && <p className="text-muted">Курьера можно вызвать после оплаты, до отгрузки.</p>}
        </div>
      )}
      {state?.error && <p className={paidCancel && state === cancelled ? "text-warning" : "text-danger"}>{state.error}</p>}
      {state?.message && <p className="text-success">{state.message}</p>}
    </div>
  );
}

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
