"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { TaskKind, TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { addChecklistItemAction, addCommentAction, createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions/crm-tasks";
import type { ActionState } from "@/lib/action-result";
import { TASK_KIND, TASK_PRIORITY, TASK_STATUS } from "@/lib/labels";

export type StaffOption = { id: string; name: string };

function Msg({ s }: { s: ActionState }) {
  if (s?.error) return <p role="alert" className="text-xs text-danger">{s.error}</p>;
  if (s?.message) return <p role="status" className="text-xs text-success">{s.message}</p>;
  return null;
}

const KINDS = Object.values(TaskKind);
const PRIORITIES = Object.values(TaskPriority);
const STATUSES = Object.values(TaskStatus);

type QuickState = ActionState & { key: number };

/**
 * Быстрое создание: одна строка на десктопе, колонка на телефоне. После успеха поля очищаются (key на обёртке),
 * под формой — «Задача «…» создана → назначена Марии» со ссылкой, а на доске новая карточка подсвечивается
 * через ?new=<id>: раньше задача, назначенная другому, пропадала из вкладки «Мои» и казалась несозданной.
 */
export function QuickTaskForm({ staff, customerId, orderId, highlight = false, layout = "row" }: { staff: StaffOption[]; customerId?: string | null; orderId?: string | null; highlight?: boolean; layout?: "row" | "stack" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [more, setMore] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: QuickState, fd: FormData): Promise<QuickState> => {
      const r = await createTaskAction(prev, fd);
      if (!r?.ok) return { ...r, key: prev.key };
      if (highlight && r.code) {
        const p = new URLSearchParams(sp.toString());
        p.set("new", r.code);
        router.replace(`${pathname}?${p.toString()}`, { scroll: false });
      }
      return { ...r, key: prev.key + 1 };
    },
    { key: 0 },
  );
  const row = layout === "row";
  return (
    <form action={formAction} className="space-y-2">
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      {orderId && <input type="hidden" name="orderId" value={orderId} />}
      <div key={state.key} className="space-y-2">
        <div className={`grid gap-2 ${row ? "md:grid-cols-[minmax(0,1fr)_230px_150px_130px_140px_auto]" : ""}`}>
          <input name="title" placeholder="Что сделать" className="input py-2" required maxLength={300} aria-label="Название задачи" autoComplete="off" />
          <input aria-label="Срок" name="dueAt" type="datetime-local" className="input py-2" />
          <select aria-label="Ответственный" name="assigneeId" className="input py-2" defaultValue="">
            <option value="">Мне</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select aria-label="Приоритет" name="priority" className="input py-2" defaultValue="NORMAL">
            {PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
          </select>
          <select aria-label="Тип" name="kind" className="input py-2" defaultValue="OTHER">
            {KINDS.map((k) => <option key={k} value={k}>{TASK_KIND[k].label}</option>)}
          </select>
          <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Создаём…" : "Создать"}</button>
        </div>
        {more && <textarea name="details" rows={3} className="input" placeholder="Подробности: что именно сделать, контекст, ссылки" aria-label="Описание" />}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" onClick={() => setMore((v) => !v)} className="text-xs text-muted underline underline-offset-4 hover:text-ink" aria-expanded={more}>
          {more ? "скрыть описание" : "подробнее"}
        </button>
        {/* на доске (highlight) сообщение рендерит сервер по ?new=<id>: после смены адреса состояние формы теряется */}
        {!highlight && state.ok && state.message && (
          <p role="status" className="text-xs text-success">
            {state.message}
            {state.code && <> · <Link href={`/crm/tasks/${state.code}`} prefetch={false} className="underline underline-offset-4">открыть задачу</Link></>}
          </p>
        )}
        {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
      </div>
    </form>
  );
}

export type TaskEditData = {
  id: string;
  title: string;
  details: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  kind: TaskKind;
  dueAtLocal: string;
  assigneeId: string | null;
  customerId: string | null;
  orderId: string | null;
};

/** Правка всех полей на странице задачи. Смена этапа, срока, ответственного и приоритета попадает в историю. */
export function TaskEditForm({ task, staff }: { task: TaskEditData; staff: StaffOption[] }) {
  const [state, action, pending] = useActionState(updateTaskAction, undefined);
  return (
    <form action={action} className="space-y-3 text-sm">
      <input type="hidden" name="id" value={task.id} />
      {task.customerId && <input type="hidden" name="customerId" value={task.customerId} />}
      {task.orderId && <input type="hidden" name="orderId" value={task.orderId} />}
      <label className="block"><span className="label">Название</span><input name="title" defaultValue={task.title} className="input py-2" required maxLength={300} /></label>
      <label className="block"><span className="label">Описание</span><textarea name="details" rows={4} defaultValue={task.details ?? ""} className="input" placeholder="Что именно сделать, контекст, ссылки" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Этап</span>
          <select name="status" defaultValue={task.status} className="input py-2">
            {STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Приоритет</span>
          <select name="priority" defaultValue={task.priority} className="input py-2">
            {PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Тип</span>
          <select name="kind" defaultValue={task.kind} className="input py-2">
            {KINDS.map((k) => <option key={k} value={k}>{TASK_KIND[k].label}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Срок</span><input name="dueAt" type="datetime-local" defaultValue={task.dueAtLocal} className="input py-2" /></label>
        <label className="block sm:col-span-2"><span className="label">Ответственный</span>
          <select name="assigneeId" defaultValue={task.assigneeId ?? ""} className="input py-2">
            <option value="">Не назначена</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
        <Msg s={state} />
      </div>
    </form>
  );
}

/** Комментарий: поле очищается после отправки, иначе текст оставался в форме и его отправляли дважды. */
export function CommentForm({ taskId }: { taskId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await addCommentAction(prev, fd);
    if (r?.ok) ref.current?.reset();
    return r;
  }, undefined);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="id" value={taskId} />
      <textarea name="text" rows={2} className="input" placeholder="Комментарий для команды" aria-label="Комментарий" required />
      <div className="flex items-center gap-3">
        <button className="btn-outline btn-sm" disabled={pending}>Добавить</button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function ChecklistAddForm({ taskId }: { taskId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await addChecklistItemAction(prev, fd);
    if (r?.ok) ref.current?.reset();
    return r;
  }, undefined);
  return (
    <form ref={ref} action={action} className="space-y-1">
      <input type="hidden" name="id" value={taskId} />
      <div className="flex gap-2">
        <input name="text" className="input py-2" placeholder="Новый пункт" aria-label="Новый пункт чеклиста" required maxLength={300} autoComplete="off" />
        <button className="btn-outline btn-sm shrink-0" disabled={pending}>Добавить</button>
      </div>
      <Msg s={state} />
    </form>
  );
}

/** Удаление вторым нажатием (без confirm(): диалог браузера не виден на части телефонов и не читается скринридером). */
export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed) {
    return <button type="button" onClick={() => setArmed(true)} className="text-xs text-muted underline underline-offset-4 hover:text-danger">Удалить задачу</button>;
  }
  return (
    <form action={deleteTaskAction} className="flex flex-wrap items-center gap-2 text-xs">
      <input type="hidden" name="id" value={taskId} />
      <span className="text-danger">Удалить безвозвратно вместе с историей?</span>
      <button className="btn-outline btn-sm !border-danger !text-danger">Да, удалить</button>
      <button type="button" onClick={() => setArmed(false)} className="text-muted underline underline-offset-4">Оставить</button>
    </form>
  );
}
