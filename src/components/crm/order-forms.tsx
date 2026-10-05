"use client";

import { useActionState } from "react";
import { changeOrderStatusAction, partialReturnAction, courierSoonAction, issueReceiptAction } from "@/app/actions/crm-orders";
import { ORDER_STATUS } from "@/lib/labels";
import type { OrderStatus } from "@/generated/prisma/enums";

export function StatusForm({ orderId, next, tracking }: { orderId: string; next: OrderStatus[]; tracking: string | null }) {
  const [state, action, pending] = useActionState(changeOrderStatusAction, undefined);
  if (next.length === 0) return <p className="text-sm text-muted">Заказ закрыт, дальнейших переходов нет.</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block">
        <span className="label">Новый статус</span>
        <select aria-label="Статус" name="status" className="input" defaultValue={next[0]}>
          {next.map((s) => <option key={s} value={s}>{ORDER_STATUS[s].label}</option>)}
        </select>
      </label>
      {next.includes("SHIPPED") && (
        <label className="block"><span className="label">Трек-номер</span><input name="trackingNumber" defaultValue={tracking ?? ""} className="input" /></label>
      )}
      <label className="block"><span className="label">Комментарий в историю</span><input name="note" className="input" placeholder="Необязательно" /></label>
      <button
        className="btn-primary w-full"
        disabled={pending}
        onClick={(e) => {
          const sel = (e.currentTarget.form?.elements.namedItem("status") as HTMLSelectElement | null)?.value;
          if ((sel === "CANCELLED" || sel === "RETURNED") && !confirm("Подтвердите: деньги и баллы будут возвращены клиенту, товар — на склад.")) e.preventDefault();
        }}
      >
        {pending ? "Сохраняем…" : "Применить"}
      </button>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.message && <p className="text-sm text-success">{state.message}</p>}
    </form>
  );
}

export function ReturnForm({ orderId, items }: { orderId: string; items: { id: string; name: string; left: number }[] }) {
  const [state, action, pending] = useActionState(partialReturnAction, undefined);
  const avail = items.filter((i) => i.left > 0);
  if (avail.length === 0) return <p className="text-sm text-muted">Все позиции возвращены.</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      {avail.map((i) => (
        <label key={i.id} className="flex items-center justify-between gap-3 text-sm">
          <span>{i.name}</span>
          <select name={`ret_${i.id}`} aria-label="Количество к возврату" className="min-h-10 border border-line bg-white px-2 py-1">
            {Array.from({ length: i.left + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      ))}
      <input name="reason" className="input" placeholder="Причина: не подошёл размер, брак…" />
      <label className="flex gap-2 text-sm"><input type="checkbox" name="restock" defaultChecked className="accent-black" /> Вернуть на склад (товар в продажном виде)</label>
      <button className="btn-outline w-full" disabled={pending}>Оформить возврат</button>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.message && <p className="text-sm text-success">{state.message}</p>}
    </form>
  );
}


export function CourierSoonForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(courierSoonAction, undefined);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <button className="btn-outline btn-sm" disabled={pending}>{pending ? "Отправляем…" : "Сообщить: курьер будет в течение часа"}</button>
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      {state?.message && <span className="text-xs text-success">{state.message}</span>}
    </form>
  );
}

/** Чеки 54-ФЗ: повторная отправка чека предоплаты или полного расчёта в CloudKassir. */
export function ReceiptForm({ orderId, kind, label }: { orderId: string; kind: "prepayment" | "settlement"; label: string }) {
  const [state, action, pending] = useActionState(issueReceiptAction, undefined);
  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="kind" value={kind} />
      <button className="btn-outline btn-sm" disabled={pending}>{pending ? "Отправляем…" : label}</button>
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      {state?.message && <span className="text-xs text-success">{state.message}</span>}
    </form>
  );
}
