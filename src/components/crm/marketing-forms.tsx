"use client";

import { useActionState } from "react";
import { createPromoAction, runJobsAction, saveLoyaltySettingsAction, saveTierAction } from "@/app/actions/crm-marketing";

function Msg({ s }: { s: { error?: string; message?: string } | undefined }) {
  if (s?.error) return <span className="text-xs text-danger">{s.error}</span>;
  if (s?.message) return <span className="text-xs text-success">{s.message}</span>;
  return null;
}

type Tier = { id: string; name: string; threshold: number; cashbackPct: number; maxPayPct: number; birthdayBonus: number; perks: string[]; freeShipping: boolean; freeReturns: boolean; earlyAccess: boolean; stylist: boolean };

export function TierForm({ t, editable }: { t: Tier; editable: boolean }) {
  const [state, action, pending] = useActionState(saveTierAction, undefined);
  return (
    <form action={action} className="space-y-3 text-sm">
      <input type="hidden" name="id" value={t.id} />
      <fieldset disabled={!editable} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label><span className="label">Название</span><input name="name" defaultValue={t.name} className="input py-2" /></label>
          <label><span className="label">Порог за 12 мес., ₽</span><input name="threshold" defaultValue={t.threshold / 100} className="input py-2" /></label>
          <label><span className="label">Баллами, %</span><input name="cashbackPct" type="number" defaultValue={t.cashbackPct} className="input py-2" /></label>
          <label><span className="label">Оплата баллами до, %</span><input name="maxPayPct" type="number" defaultValue={t.maxPayPct} className="input py-2" /></label>
          <label className="col-span-2"><span className="label">Подарок ко ДР, баллов</span><input name="birthdayBonus" type="number" defaultValue={t.birthdayBonus} className="input py-2" /></label>
        </div>
        <label className="block"><span className="label">Привилегии (по строке)</span><textarea name="perks" rows={4} defaultValue={t.perks.join("\n")} className="input" /></label>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <label className="flex gap-2"><input type="checkbox" name="freeShipping" defaultChecked={t.freeShipping} className="accent-black" /> Бесплатная доставка</label>
          <label className="flex gap-2"><input type="checkbox" name="freeReturns" defaultChecked={t.freeReturns} className="accent-black" /> Бесплатный возврат</label>
          <label className="flex gap-2"><input type="checkbox" name="earlyAccess" defaultChecked={t.earlyAccess} className="accent-black" /> Ранний доступ</label>
          <label className="flex gap-2"><input type="checkbox" name="stylist" defaultChecked={t.stylist} className="accent-black" /> Стилист</label>
        </div>
        {editable && <div className="flex items-center gap-3"><button className="btn-outline btn-sm" disabled={pending}>Сохранить</button><Msg s={state} /></div>}
      </fieldset>
    </form>
  );
}

export function LoyaltySettingsForm({ s, editable }: { s: { welcomePoints: number; referralPoints: number; reviewPoints: number; pointsExpireDays: number }; editable: boolean }) {
  const [state, action, pending] = useActionState(saveLoyaltySettingsAction, undefined);
  return (
    <form action={action}>
      <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <label><span className="label">Welcome-баллы</span><input name="welcomePoints" type="number" defaultValue={s.welcomePoints} className="input py-2" /></label>
        <label><span className="label">За приглашение</span><input name="referralPoints" type="number" defaultValue={s.referralPoints} className="input py-2" /></label>
        <label><span className="label">За отзыв</span><input name="reviewPoints" type="number" defaultValue={s.reviewPoints} className="input py-2" /></label>
        <label><span className="label">Срок жизни, дней</span><input name="pointsExpireDays" type="number" defaultValue={s.pointsExpireDays} className="input py-2" /></label>
        {editable && <div className="flex items-center gap-3 sm:col-span-4"><button className="btn-outline btn-sm" disabled={pending}>Сохранить</button><Msg s={state} /></div>}
      </fieldset>
    </form>
  );
}

export function RunJobsButton() {
  const [state, action, pending] = useActionState(runJobsAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Выполняем…" : "Запустить ежедневные задачи"}</button>
      <div><Msg s={state} /></div>
    </form>
  );
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
