"use client";

import { useActionState } from "react";
import { addAddressAction, changePasswordAction, updateProfileAction } from "@/app/actions/account";

function Msg({ state }: { state: { error?: string; message?: string } | undefined }) {
  if (state?.error) return <p className="text-sm text-danger">{state.error}</p>;
  if (state?.message) return <p className="text-sm text-success">{state.message}</p>;
  return null;
}

type ProfileUser = {
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string;
  birthday: string | null;
  preferredSize: string | null;
  marketingConsent: boolean;
  height: number | null;
  bust: number | null;
  waist: number | null;
  hips: number | null;
};

const MEASURES: { name: "height" | "bust" | "waist" | "hips"; label: string }[] = [
  { name: "height", label: "Рост, см" },
  { name: "bust", label: "Грудь, см" },
  { name: "waist", label: "Талия, см" },
  { name: "hips", label: "Бёдра, см" },
];

export function ProfileForm({ user }: { user: ProfileUser }) {
  const [state, action, pending] = useActionState(updateProfileAction, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label><span className="label">Имя</span><input name="firstName" defaultValue={user.firstName} required className="input" /></label>
      <label><span className="label">Фамилия</span><input name="lastName" defaultValue={user.lastName ?? ""} className="input" /></label>
      <label><span className="label">Телефон</span><input name="phone" defaultValue={user.phone ?? ""} required className="input" /></label>
      <label><span className="label">Email</span><input value={user.email} disabled className="input opacity-60" /></label>
      <label>
        <span className="label">Дата рождения</span>
        <input name="birthday" type="date" defaultValue={user.birthday ?? ""} disabled={!!user.birthday} className="input disabled:opacity-60" />
        {user.birthday && <span className="mt-1 block text-xs text-muted">Изменить можно через менеджера</span>}
      </label>
      <label>
        <span className="label">Ваш размер</span>
        <select name="preferredSize" defaultValue={user.preferredSize ?? ""} className="input">
          <option value="">Не указан</option>
          {["XS", "S", "M", "L", "XL"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <div className="sm:col-span-2">
        <span className="label">Мерки</span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MEASURES.map((m) => (
            <label key={m.name}>
              <span className="mb-1 block text-xs text-muted">{m.label}</span>
              <input name={m.name} type="number" min={50} max={250} inputMode="numeric" defaultValue={user[m.name] ?? ""} className="input" />
            </label>
          ))}
        </div>
        <span className="mt-1 block text-xs text-muted">По меркам подскажем размер на странице каждой вещи. <a href="/sizes" className="underline">Как снять мерки</a></span>
      </div>
      <label className="flex gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="marketingConsent" defaultChecked={user.marketingConsent} className="accent-black" />
        Получать новости о коллекциях, закрытых показах и предпродажах
      </label>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>Сохранить</button>
        <Msg state={state} />
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label><span className="label">Текущий пароль</span><input name="current" type="password" required className="input" /></label>
      <label><span className="label">Новый пароль</span><input name="next" type="password" minLength={8} required className="input" /></label>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button className="btn-outline" disabled={pending}>Изменить пароль</button>
        <Msg state={state} />
      </div>
    </form>
  );
}

export function AddressForm() {
  const [state, action, pending] = useActionState(addAddressAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <label><span className="label">Название</span><input name="label" placeholder="Дом" className="input" /></label>
      <label><span className="label">Город</span><input name="city" required className="input" /></label>
      <label><span className="label">Индекс</span><input name="postcode" className="input" /></label>
      <label className="sm:col-span-2"><span className="label">Улица</span><input name="street" required className="input" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="label">Дом</span><input name="building" required className="input" /></label>
        <label><span className="label">Кв.</span><input name="apartment" className="input" /></label>
      </div>
      <label className="sm:col-span-3"><span className="label">Комментарий для курьера</span><input name="comment" className="input" /></label>
      <label className="flex gap-2 text-sm sm:col-span-3"><input type="checkbox" name="isDefault" className="accent-black" /> Сделать основным</label>
      <div className="flex items-center gap-4 sm:col-span-3">
        <button className="btn-outline" disabled={pending}>Добавить адрес</button>
        <Msg state={state} />
      </div>
    </form>
  );
}
