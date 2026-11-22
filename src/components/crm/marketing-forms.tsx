"use client";

import { useActionState } from "react";
import { createPromoAction } from "@/app/actions/crm-marketing";

function Msg({ s }: { s: { error?: string; message?: string } | undefined }) {
  if (s?.error) return <span className="text-xs text-danger">{s.error}</span>;
  if (s?.message) return <span className="text-xs text-success">{s.message}</span>;
  return null;
}

export function PromoForm() {
  const [state, action, pending] = useActionState(createPromoAction, undefined);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-4 md:items-end">
      <label><span className="label">Код</span><input name="code" placeholder="PRIVE15" className="input py-2 uppercase" /></label>
      <label><span className="label">Тип</span>
        <select aria-label="Тип" name="type" className="input py-2"><option value="PERCENT">Скидка, %</option><option value="FIXED">Скидка, ₽</option><option value="FREE_SHIPPING">Бесплатная доставка</option></select>
      </label>
      <label><span className="label">Размер</span><input name="value" placeholder="10" className="input py-2" /></label>
      <label><span className="label">Мин. сумма, ₽</span><input name="minSubtotal" placeholder="0" className="input py-2" /></label>
      <label><span className="label">Лимит использований</span><input name="maxUses" placeholder="без лимита" className="input py-2" /></label>
      <label><span className="label">На клиента</span><input name="perUser" defaultValue="1" className="input py-2" /></label>
      <label><span className="label">С</span><input aria-label="Начало" name="startsAt" type="date" className="input py-2" /></label>
      <label><span className="label">По</span><input aria-label="Окончание" name="endsAt" type="date" className="input py-2" /></label>
      <div className="flex items-center gap-3 md:col-span-4"><button className="btn-primary btn-sm" disabled={pending}>Создать</button><Msg s={state} /></div>
    </form>
  );
}
