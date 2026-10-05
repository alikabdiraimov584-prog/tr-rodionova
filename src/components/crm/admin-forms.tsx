"use client";

import { useActionState } from "react";
import { addLedgerAction, createStaffAction, resetStaffPasswordAction, saveChannelAction, saveSettingsAction, telegramSetWebhookAction, testEmailChannelAction } from "@/app/actions/crm-admin";

function Msg({ s }: { s: { error?: string; message?: string } | undefined }) {
  if (s?.error) return <span className="text-xs text-danger">{s.error}</span>;
  if (s?.message) return <span className="text-xs text-success">{s.message}</span>;
  return null;
}

const LEDGER_OPTIONS: [string, string][] = [
  ["EXPENSE_PRODUCTION", "Производство: ткани, пошив, фурнитура"],
  ["EXPENSE_MARKETING", "Маркетинг"],
  ["EXPENSE_SHIPPING", "Доставка и логистика"],
  ["EXPENSE_SALARY", "Зарплаты и подрядчики"],
  ["EXPENSE_RENT", "Аренда"],
  ["EXPENSE_SERVICES", "Сервисы, сайт, связь, банк"],
  ["EXPENSE_TAX", "Налоги и взносы"],
  ["EXPENSE_ACQUIRING", "Эквайринг"],
  ["EXPENSE_OTHER", "Прочие расходы"],
  ["INCOME_OTHER", "Прочие доходы"],
  ["OWNER_CONTRIBUTION", "Взнос собственника / заём"],
  ["OWNER_WITHDRAWAL", "Вывод собственнику"],
];

export type LedgerInitial = { id: string; type: string; amount: number; date: string; category: string; counterparty: string; comment: string };

/** Ручная проводка: расход, прочий доход, взнос или вывод. В режиме правки заполнена существующей проводкой. */
export function LedgerForm({ initial, categories = [], counterparties = [], cancelHref }: { initial?: LedgerInitial; categories?: string[]; counterparties?: string[]; cancelHref?: string }) {
  const [state, action, pending] = useActionState(addLedgerAction, undefined);
  // дата по Москве, а не по UTC: ночью UTC ещё показывает вчерашний день
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.6fr_130px_150px_1fr_1fr_1.4fr_auto] xl:items-end">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <label><span className="label">Статья</span>
        <select aria-label="Статья" name="type" defaultValue={initial?.type ?? "EXPENSE_PRODUCTION"} className="input py-2">
          {LEDGER_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label><span className="label">Сумма, ₽</span><input name="amount" inputMode="decimal" defaultValue={initial ? (initial.amount / 100).toString() : ""} placeholder="12 500" required className="input py-2" /></label>
      <label><span className="label">Дата оплаты</span><input aria-label="Дата оплаты" name="date" type="date" defaultValue={initial?.date ?? today} max={today} className="input py-2" /></label>
      <label><span className="label">Категория</span><input name="category" list="ledger-categories" defaultValue={initial?.category ?? ""} placeholder="Ткани, блогеры, СДЭК…" className="input py-2" /></label>
      <label><span className="label">Кому / от кого</span><input name="counterparty" list="ledger-counterparties" defaultValue={initial?.counterparty ?? ""} placeholder="Фабрика, ИП, сервис" className="input py-2" /></label>
      <label><span className="label">Комментарий</span><input name="comment" defaultValue={initial?.comment ?? ""} placeholder="Счёт №, за что" className="input py-2" /></label>
      <div className="flex items-center gap-2">
        <button className="btn-primary btn-sm whitespace-nowrap" disabled={pending}>{initial ? "Сохранить" : "Добавить"}</button>
        {initial && cancelHref && <a href={cancelHref} className="text-xs text-muted underline">отмена</a>}
      </div>
      <datalist id="ledger-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="ledger-counterparties">{counterparties.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="sm:col-span-2 md:col-span-3 xl:col-span-7"><Msg s={state} /></div>
    </form>
  );
}

export function StaffForm() {
  const [state, action, pending] = useActionState(createStaffAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:items-end xl:grid-cols-[1fr_1fr_1.3fr_1fr_160px_auto]">
      <label><span className="label">Имя</span><input name="firstName" className="input py-2" /></label>
      <label><span className="label">Фамилия</span><input name="lastName" className="input py-2" /></label>
      <label><span className="label">Рабочий email</span><input name="email" type="email" className="input py-2" /></label>
      <label><span className="label">Телефон</span><input name="phone" className="input py-2" /></label>
      <label><span className="label">Роль</span>
        <select aria-label="Роль" name="role" defaultValue="SUPPORT" className="input py-2"><option value="SUPPORT">Поддержка</option><option value="MANAGER">Менеджер</option><option value="ADMIN">Администратор</option></select>
      </label>
      <button className="btn-primary btn-sm" disabled={pending}>Создать</button>
      <div className="sm:col-span-2 md:col-span-3 xl:col-span-6"><Msg s={state} /></div>
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resetStaffPasswordAction, undefined);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button className="text-xs text-muted underline hover:text-ink" disabled={pending}>сбросить пароль</button>
      {state?.message && <div className="mt-1 font-mono text-xs text-success">{state.message}</div>}
    </form>
  );
}

export function SettingsForm({ section, children }: { section: string; children: React.ReactNode }) {
  const [state, action, pending] = useActionState(saveSettingsAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="section" value={section} />
      {children}
      <div className="flex items-center gap-3"><button className="btn-outline btn-sm" disabled={pending}>Сохранить</button><Msg s={state} /></div>
    </form>
  );
}

type Field = { key: string; label: string; secret?: boolean; hint?: string };

export function ChannelForm({ channel, fields, values, enabled }: { channel: string; fields: Field[]; values: Record<string, string>; enabled: boolean }) {
  const [state, action, pending] = useActionState(saveChannelAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="channel" value={channel} />
      <label className="flex gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={enabled} className="accent-black" /> Канал включён</label>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="label">{f.label}</span>
            {f.secret ? (
              <>
                <input name={f.key} type="password" autoComplete="off" placeholder={values[f.key] ? "•••••• сохранено — оставьте пустым" : ""} className="input py-2" />
                {values[f.key] && <span className="mt-1 flex gap-1 text-[0.65rem] text-muted"><input type="checkbox" name={`clear_${f.key}`} /> удалить</span>}
              </>
            ) : (
              <input name={f.key} defaultValue={values[f.key] ?? ""} placeholder={f.hint} className="input py-2" />
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3"><button className="btn-outline btn-sm" disabled={pending}>Сохранить</button><Msg s={state} /></div>
    </form>
  );
}

/** Почта: тестовое письмо и проверка входа в ящик. Адрес по умолчанию — почта сотрудника, который нажал кнопку. */
export function EmailTestForm({ defaultTo }: { defaultTo: string }) {
  const [state, action, pending] = useActionState(testEmailChannelAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="to" type="email" defaultValue={defaultTo} aria-label="Куда отправить тестовое письмо" className="input w-full py-2 sm:w-72" />
      <button className="btn-outline btn-sm" disabled={pending}>{pending ? "Проверяю…" : "Отправить тестовое письмо и проверить IMAP"}</button>
      <Msg s={state} />
    </form>
  );
}

export function TelegramWebhookForm({ baseUrl }: { baseUrl: string }) {
  const [state, action, pending] = useActionState(telegramSetWebhookAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="baseUrl" defaultValue={baseUrl} placeholder="https://tr-rodionova.ru" className="input w-full py-2 sm:w-72" />
      <button className="btn-outline btn-sm" disabled={pending}>Установить вебхук</button>
      <Msg s={state} />
    </form>
  );
}
