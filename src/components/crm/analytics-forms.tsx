"use client";

import { useActionState } from "react";
import { createTrackingLinkAction } from "@/app/actions/crm-analytics";

export function TrackingLinkForm() {
  const [state, action, pending] = useActionState(createTrackingLinkAction, undefined);
  return (
    <form action={action} className="grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr_auto] md:items-end">
      <label><span className="label">Название</span><input name="name" placeholder="Stories AW26" className="input py-2" /></label>
      <label><span className="label">/go/…</span><input name="slug" placeholder="stories-aw26" className="input py-2" /></label>
      <label><span className="label">Куда ведёт</span><input name="targetPath" defaultValue="/catalog" className="input py-2" /></label>
      <label><span className="label">Источник</span><input name="source" placeholder="instagram" list="src" className="input py-2" /></label>
      <label><span className="label">Тип</span><input name="medium" placeholder="stories" list="med" className="input py-2" /></label>
      <label><span className="label">Кампания</span><input name="campaign" placeholder="aw26" className="input py-2" /></label>
      <button className="btn-primary btn-sm" disabled={pending}>Создать</button>
      <datalist id="src"><option value="instagram" /><option value="telegram" /><option value="vk" /><option value="yandex" /><option value="blogger" /><option value="email" /><option value="qr" /></datalist>
      <datalist id="med"><option value="stories" /><option value="post" /><option value="bio" /><option value="cpc" /><option value="newsletter" /><option value="referral" /><option value="offline" /></datalist>
      {(state?.error || state?.message) && <p className={`text-xs md:col-span-7 ${state.error ? "text-danger" : "text-success"}`}>{state.error ?? state.message}</p>}
    </form>
  );
}
