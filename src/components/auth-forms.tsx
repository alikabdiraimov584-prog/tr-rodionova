"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, registerAction } from "@/app/actions/auth";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block"><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
      <label className="block"><span className="label">Пароль</span><input name="password" type="password" required autoComplete="current-password" className="input" /></label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Входим…" : "Войти"}</button>
      <p className="text-center text-xs text-muted"><Link href="/forgot" className="underline">Забыли пароль?</Link></p>
      <p className="text-center text-sm text-muted">
        Нет аккаунта? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-ink underline">Регистрация</Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next, refCode, referrerName }: { next?: string; refCode?: string; referrerName?: string }) {
  const [state, action, pending] = useActionState(registerAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <input type="hidden" name="ref" value={refCode ?? ""} />
      {referrerName && <p className="border border-champagne bg-champagne/20 px-4 py-3 text-sm">Вас пригласила {referrerName} ✦</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">Имя</span><input name="firstName" required className="input" /></label>
        <label className="block"><span className="label">Фамилия</span><input name="lastName" className="input" /></label>
      </div>
      <label className="block"><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
      <label className="block"><span className="label">Телефон</span><input name="phone" type="tel" required placeholder="+7" className="input" /></label>
      <label className="block">
        <span className="label">Дата рождения</span>
        <input name="birthday" type="date" className="input" />
        <span className="mt-1 block text-xs text-muted">Для подарочных баллов. Указывается один раз.</span>
      </label>
      <label className="block"><span className="label">Пароль</span><input name="password" type="password" minLength={8} required autoComplete="new-password" className="input" /></label>
      <label className="flex gap-2 py-1 text-xs text-muted">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0 accent-black" />
        <span>Даю <Link href="/privacy#consent" target="_blank" className="underline">согласие на обработку персональных данных</Link> на условиях <Link href="/privacy" target="_blank" className="underline">политики</Link></span>
      </label>
      <label className="flex gap-2 py-1 text-xs text-muted">
        <input type="checkbox" name="offer" required className="mt-0.5 h-4 w-4 shrink-0 accent-black" />
        <span>Принимаю условия <Link href="/offer" target="_blank" className="underline">публичной оферты</Link> и <Link href="/offer#loyalty" target="_blank" className="underline">правила программы Circle</Link></span>
      </label>
      <label className="flex gap-2 py-1 text-xs text-muted">
        <input type="checkbox" name="marketingConsent" className="mt-0.5 h-4 w-4 shrink-0 accent-black" />
        <span>Хочу получать новости о коллекциях и закрытых показах (<Link href="/privacy#marketing" target="_blank" className="underline">согласие на рассылки</Link>)</span>
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Создаём…" : "Создать аккаунт"}</button>
      <p className="text-center text-sm text-muted">Уже есть аккаунт? <Link href="/login" className="text-ink underline">Войти</Link></p>
    </form>
  );
}
