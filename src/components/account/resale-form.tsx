"use client";

import { useActionState } from "react";
import { createResaleRequestAction } from "@/app/actions/resale";
import { RESALE_CONDITIONS } from "@/lib/resale";

export type ResaleCandidate = { id: string; label: string; priceLabel: string };

export function ResaleRequestForm({ items }: { items: ResaleCandidate[] }) {
  const [state, action, pending] = useActionState(createResaleRequestAction, undefined);
  if (items.length === 0) {
    return <p className="text-sm text-muted">Пока нет вещей, которые можно предложить к выкупу: заявку можно подать по доставленным и завершённым заказам.</p>;
  }
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="label">Вещь</span>
        <select name="orderItemId" required className="input" defaultValue="">
          <option value="" disabled>Выберите из купленного</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.label} — {i.priceLabel}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Состояние</span>
        <select name="condition" required className="input" defaultValue="">
          <option value="" disabled>Выберите</option>
          {RESALE_CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label} — до {c.pct}%</option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted">{RESALE_CONDITIONS.map((c) => `${c.label.toLowerCase()}: ${c.hint}`).join(". ")}.</span>
      </label>
      <label className="sm:col-span-2">
        <span className="label">Описание</span>
        <textarea name="description" rows={3} required minLength={10} className="input" placeholder="Сколько раз надевали, была ли химчистка, есть ли дефекты…" />
      </label>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Отправляем…" : "Отправить заявку"}</button>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        {state?.message && <p className="text-sm text-success">{state.message}</p>}
      </div>
    </form>
  );
}
