"use client";

import { useActionState } from "react";
import { adjustPointsAction, createTaskAction, updateCustomerAction } from "@/app/actions/crm-customers";

function Msg({ s }: { s: { error?: string; message?: string } | undefined }) {
  if (s?.error) return <p className="text-xs text-danger">{s.error}</p>;
  if (s?.message) return <p className="text-xs text-success">{s.message}</p>;
  return null;
}

export function PointsForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(adjustPointsAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <input name="amount" type="number" placeholder="+500 / −500" className="input py-2" />
        <input name="comment" placeholder="Причина (видна клиенту)" className="input py-2" />
      </div>
      <button className="btn-outline btn-sm" disabled={pending}>Провести</button>
      <Msg s={state} />
    </form>
  );
}

export function TaskForm({ customerId, staff }: { customerId?: string; staff: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createTaskAction, undefined);
  return (
    <form action={action} className="space-y-2">
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      <input name="title" placeholder="Что сделать" className="input py-2" required />
      <div className="grid grid-cols-2 gap-2">
        <input name="dueAt" type="date" className="input py-2" />
        <select aria-label="Ответственный" name="assigneeId" className="input py-2" defaultValue="">
          <option value="">Мне</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <button className="btn-outline btn-sm" disabled={pending}>Создать задачу</button>
      <Msg s={state} />
    </form>
  );
}

export function CustomerEditForm({ c }: { c: { id: string; tags: string[]; source: string | null; preferredSize: string | null; phone: string | null; birthday: string | null } }) {
  const [state, action, pending] = useActionState(updateCustomerAction, undefined);
  return (
    <form action={action} className="space-y-2 text-sm">
      <input type="hidden" name="userId" value={c.id} />
      <label className="block"><span className="label">Теги через запятую</span><input name="tags" defaultValue={c.tags.join(", ")} className="input py-2" placeholder="vip, кашемир, офис" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="label">Телефон</span><input name="phone" defaultValue={c.phone ?? ""} className="input py-2" /></label>
        <label className="block"><span className="label">Размер</span><input name="preferredSize" defaultValue={c.preferredSize ?? ""} className="input py-2" /></label>
        <label className="block"><span className="label">Источник</span><input name="source" defaultValue={c.source ?? ""} className="input py-2" /></label>
        <label className="block"><span className="label">Дата рождения</span><input name="birthday" type="date" defaultValue={c.birthday ?? ""} className="input py-2" /></label>
      </div>
      <button className="btn-outline btn-sm" disabled={pending}>Сохранить</button>
      <Msg s={state} />
    </form>
  );
}
