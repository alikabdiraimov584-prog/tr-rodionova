"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, resetPasswordAction } from "@/app/actions/password-reset";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="block"><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="break-all text-sm text-success">{state.message}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Отправляем…" : "Прислать ссылку"}</button>
      <p className="text-center text-xs text-muted"><Link href="/login" className="underline">Вспомнили пароль? Войти</Link></p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block"><span className="label">Новый пароль</span><input name="password" type="password" minLength={8} required autoComplete="new-password" className="input" /></label>
      {state?.error && <p className="text-sm text-danger">{state.error} <Link href="/forgot" className="underline">Запросить новую</Link></p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить пароль"}</button>
    </form>
  );
}
