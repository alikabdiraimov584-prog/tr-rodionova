"use client";

import { useActionState } from "react";
import { verifyTwoFactorAction } from "@/app/actions/totp";

export function TwoFactorForm() {
  const [state, action, pending] = useActionState(verifyTwoFactorAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="block"><span className="label">Код из приложения</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus className="input text-center text-lg tracking-[0.4em]" /></label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Проверяем…" : "Подтвердить"}</button>
    </form>
  );
}
