"use client";

import { useActionState } from "react";
import { listResaleAction, offerResaleAction } from "@/app/actions/crm-resale";
import { RESALE_CONDITIONS } from "@/lib/resale";

function Msg({ s }: { s: { error?: string; message?: string } | undefined }) {
  if (s?.error) return <p className="text-xs text-danger">{s.error}</p>;
  if (s?.message) return <p className="text-xs text-success">{s.message}</p>;
  return null;
}

export function OfferForm({ id, suggested, maxByCondition, current, note }: { id: string; suggested: number; maxByCondition: { label: string; pct: number; points: number }[]; current: number | null; note: string | null }) {
  const [state, action, pending] = useActionState(offerResaleAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="label">Баллов за вещь</span>
        <input aria-label="Баллы" name="points" type="number" min={1} step={1} defaultValue={current ?? suggested} className="input py-2" required />
      </label>
      <p className="text-xs text-muted">
        Расчёт от цены покупки: {maxByCondition.map((m) => `${m.label.toLowerCase()} — до ${m.pct}% = ${m.points.toLocaleString("ru-RU")} б.`).join(", ")}. По указанному состоянию: <span className="text-ink">{suggested.toLocaleString("ru-RU")}</span>.
      </p>
      <label className="block">
        <span className="label">Комментарий клиентке</span>
        <input name="managerNote" defaultValue={note ?? ""} className="input py-2" placeholder="Например: по фото небольшие катышки, поэтому 20%" />
      </label>
      <button className="btn-primary btn-sm" disabled={pending}>{current ? "Изменить предложение" : "Предложить баллы"}</button>
      <Msg s={state} />
    </form>
  );
}

export function ListForm({ id, condition, suggestedPrice }: { id: string; condition: string | null; suggestedPrice: number }) {
  const [state, action, pending] = useActionState(listResaleAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Цена на витрине, ₽</span>
          <input aria-label="Цена" name="price" type="number" min={1} step={1} defaultValue={suggestedPrice} className="input py-2" required />
        </label>
        <label className="block">
          <span className="label">Состояние</span>
          <select aria-label="Состояние" name="condition" defaultValue={condition ?? ""} className="input py-2" required>
            <option value="" disabled>Выберите</option>
            {RESALE_CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Описание для витрины</span>
        <textarea name="description" rows={2} className="input py-2" placeholder="Если пусто — соберём из состояния и описания клиентки" />
      </label>
      <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Создаём товар…" : "Выставить на витрину"}</button>
      <Msg s={state} />
    </form>
  );
}
