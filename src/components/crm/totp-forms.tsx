"use client";

import { useActionState } from "react";
import { beginTotpSetupAction, confirmTotpAction, disableTotpAction } from "@/app/actions/totp";
import type { ActionState } from "@/lib/action-result";

function Msg({ s }: { s: ActionState }) {
  if (!s) return null;
  return <p className={`text-sm ${s.error ? "text-danger" : "text-success"}`}>{s.error ?? s.message}</p>;
}

export function BeginSetupButton() {
  const [state, action, pending] = useActionState(async () => beginTotpSetupAction(), undefined);
  return (
    <form action={action} className="space-y-2">
      <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Создаём…" : "Включить двухфакторную защиту"}</button>
      <Msg s={state} />
    </form>
  );
}

export function ConfirmCodeForm() {
  const [state, action, pending] = useActionState(confirmTotpAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label><span className="label">Код из приложения</span><input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="input w-40 py-2 text-center tracking-[0.3em]" /></label>
      <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Проверяем…" : "Подтвердить и включить"}</button>
      <Msg s={state} />
    </form>
  );
}

export function DisableForm() {
  const [state, action, pending] = useActionState(disableTotpAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label><span className="label">Код для отключения</span><input name="code" inputMode="numeric" maxLength={7} required className="input w-40 py-2 text-center tracking-[0.3em]" /></label>
      <button className="btn-outline btn-sm" disabled={pending}>{pending ? "…" : "Отключить"}</button>
      <Msg s={state} />
    </form>
  );
}
