"use client";

import { useActionState } from "react";
import { applyRecommendationAction, campaignToggleAction, createStarterCampaignsAction, launchAllAction, setBudgetAction, syncAdsAction } from "@/app/actions/crm-ads";
import type { ActionState } from "@/lib/action-result";

function Msg({ s, className = "" }: { s: ActionState; className?: string }) {
  if (!s || (!s.error && !s.message)) return null;
  return <p className={`text-xs ${s.error ? "text-danger" : "text-success"} ${className}`}>{s.error ?? s.message}</p>;
}

export function StarterForm({ categories, defaultCpa, defaultBudget }: { categories: { slug: string; name: string; count: number }[]; defaultCpa: number; defaultBudget: number }) {
  const [state, action, pending] = useActionState(createStarterCampaignsAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label><span className="label">Бюджет в месяц, ₽</span><input name="monthlyBudget" type="number" min={3000} step={1000} defaultValue={defaultBudget} className="input py-2" /></label>
        <label><span className="label">Целевая стоимость заказа, ₽</span><input name="targetCpa" type="number" min={100} step={100} defaultValue={defaultCpa} className="input py-2" /></label>
        <fieldset className="sm:col-span-2">
          <legend className="label">Регионы показа</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="regions" value="msk" defaultChecked className="accent-black" /> Москва и область</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="regions" value="spb" defaultChecked className="accent-black" /> Санкт-Петербург и область</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="regions" value="ru" className="accent-black" /> Вся Россия</label>
          </div>
        </fieldset>
      </div>
      <fieldset>
        <legend className="label">Кампании</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="brand" defaultChecked className="accent-black" /> Бренд · поиск (10 % бюджета)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="retargeting" defaultChecked className="accent-black" /> Ретаргетинг · сети (20 %)</label>
          {categories.map((c) => (
            <label key={c.slug} className="flex items-center gap-2"><input type="checkbox" name="categories" value={c.slug} defaultChecked={c.count > 0} className="accent-black" /> {c.name} · поиск <span className="text-muted">({c.count} вещей)</span></label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Создаём в Директе…" : "Создать кампании на паузе"}</button>
        <span className="text-xs text-muted">Создание занимает до минуты: кампании, группы, фразы, два варианта объявления в каждой группе, быстрые ссылки и условие ретаргетинга.</span>
      </div>
      <Msg s={state} />
    </form>
  );
}

export function CampaignControls({ campaignId, state, weeklyRub, canEdit }: { campaignId: number; state: string | null; weeklyRub: number | null; canEdit: boolean }) {
  const [toggle, toggleAction, toggling] = useActionState(campaignToggleAction, undefined);
  const [budget, budgetAction, saving] = useActionState(setBudgetAction, undefined);
  if (!canEdit) return null;
  const canResume = state === "SUSPENDED";
  const canSuspend = state === "ON";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {(canResume || canSuspend) && (
          <form action={toggleAction}>
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="op" value={canSuspend ? "suspend" : "resume"} />
            <button className={`btn-sm ${canSuspend ? "btn-outline" : "btn-primary"}`} disabled={toggling}>{toggling ? "…" : canSuspend ? "Пауза" : "Запустить"}</button>
          </form>
        )}
        <form action={budgetAction} className="flex items-center gap-1">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input name="weeklyRub" type="number" min={300} step={100} defaultValue={weeklyRub ?? ""} placeholder="₽/нед" className="input w-24 py-1 text-xs" aria-label="Недельный бюджет, ₽" />
          <button className="btn-outline btn-sm" disabled={saving}>{saving ? "…" : "Бюджет"}</button>
        </form>
      </div>
      {state === "OFF" && <p className="text-xs text-muted">не остановлена вручную: показы начнутся после модерации и пополнения баланса</p>}
      <Msg s={toggle} />
      <Msg s={budget} />
    </div>
  );
}

export function SyncButton() {
  const [state, action, pending] = useActionState(syncAdsAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button className="btn-outline btn-sm" disabled={pending}>{pending ? "Читаем отчёты Директа…" : "Обновить статистику"}</button>
      <Msg s={state} />
    </form>
  );
}

export function LaunchAllButton({ count }: { count: number }) {
  const [state, action, pending] = useActionState(launchAllAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button className="btn-primary btn-sm" disabled={pending || count === 0}>{pending ? "Запускаем…" : count ? `Запустить все на паузе (${count})` : "Все кампании запущены"}</button>
      <Msg s={state} />
    </form>
  );
}

export function ApplyButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(applyRecommendationAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button className="btn-primary btn-sm" disabled={pending || !!state?.ok}>{pending ? "…" : state?.ok ? "Применено" : "Применить"}</button>
      <Msg s={state} />
    </form>
  );
}
