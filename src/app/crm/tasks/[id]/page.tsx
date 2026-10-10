import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { TaskStatus } from "@/generated/prisma/enums";
import { requireSection } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { TASK_KIND, TASK_PRIORITY, TASK_STATUS } from "@/lib/labels";
import { formatDue, getTask, isActiveStatus, parseChecklist, staffList, staffName, toLocalInputValue } from "@/lib/tasks";
import { Badge, Eyebrow, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/form";
import { ChecklistAddForm, CommentForm, DeleteTaskButton, TaskEditForm } from "@/components/crm/task-forms-client";
import { staffOptions } from "@/components/crm/task-forms";
import { removeChecklistItemAction, setTaskStatusAction, toggleChecklistItemAction } from "@/app/actions/crm-tasks";

export const metadata: Metadata = { title: "Задача" };

/** Какие кнопки этапа показывать: первая — следующий шаг по доске, остальные — назад и отмена. */
const TRANSITIONS: Record<TaskStatus, { to: TaskStatus; label: string; primary?: boolean }[]> = {
  OPEN: [{ to: "IN_PROGRESS", label: "В работу", primary: true }, { to: "REVIEW", label: "На проверку" }, { to: "DONE", label: "Готово" }, { to: "CANCELLED", label: "Отменить" }],
  IN_PROGRESS: [{ to: "REVIEW", label: "На проверку", primary: true }, { to: "DONE", label: "Готово" }, { to: "OPEN", label: "Вернуть в новые" }, { to: "CANCELLED", label: "Отменить" }],
  REVIEW: [{ to: "DONE", label: "Готово", primary: true }, { to: "IN_PROGRESS", label: "Вернуть в работу" }, { to: "CANCELLED", label: "Отменить" }],
  DONE: [{ to: "IN_PROGRESS", label: "Вернуть в работу" }],
  CANCELLED: [{ to: "OPEN", label: "Вернуть" }],
};

export default async function TaskPage({ params }: PageProps<"/crm/tasks/[id]">) {
  const me = await requireSection("tasks");
  const { id } = await params;
  const [task, staff] = await Promise.all([getTask(id), staffList()]);
  if (!task) notFound();
  const now = new Date();
  const checklist = parseChecklist(task.checklist);
  const doneCount = checklist.filter((i) => i.done).length;
  const overdue = !!task.dueAt && task.dueAt < now && isActiveStatus(task.status);
  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow={`Задача · создана ${formatDate(task.createdAt, true)}${task.createdBy ? ` · ${staffName(task.createdBy)}` : ""}`}
        title={task.title}
        actions={
          <>
            <Badge tone={TASK_KIND[task.kind].tone}>{TASK_KIND[task.kind].label}</Badge>
            <Badge tone={TASK_PRIORITY[task.priority].tone}>{TASK_PRIORITY[task.priority].label}</Badge>
            <Badge tone={TASK_STATUS[task.status].tone}>{TASK_STATUS[task.status].label}</Badge>
          </>
        }
      >
        {task.dueAt ? <span className={overdue ? "text-danger" : ""}>{overdue ? "Просрочена: срок " : "Срок: "}{formatDue(task.dueAt, now)}</span> : "Без срока"}
        {" · "}ответственная: {staffName(task.assignee)}
        {task.completedAt && ` · выполнена ${formatDate(task.completedAt, true)}`}
        {" · "}<Link href="/crm/tasks" prefetch={false} className="underline underline-offset-4">к доске</Link>
      </PageTitle>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <div className="card p-5">
            <Eyebrow className="mb-3">Поля задачи</Eyebrow>
            <TaskEditForm
              staff={staffOptions(staff)}
              task={{ id: task.id, title: task.title, details: task.details, status: task.status, priority: task.priority, kind: task.kind, dueAtLocal: toLocalInputValue(task.dueAt), assigneeId: task.assigneeId, customerId: task.customerId, orderId: task.orderId }}
            />
          </div>

          <div className="card space-y-3 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>Чеклист</Eyebrow>
              {checklist.length > 0 && <span className="text-xs text-muted">{doneCount} из {checklist.length}</span>}
            </div>
            {checklist.length > 0 && (
              <div className="h-1 w-full overflow-hidden rounded bg-sand" role="progressbar" aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={doneCount} aria-label="Выполнено пунктов">
                <div className="h-full bg-success transition-all" style={{ width: `${Math.round((doneCount / checklist.length) * 100)}%` }} />
              </div>
            )}
            <ul className="space-y-1 text-sm">
              {checklist.map((i) => (
                <li key={i.id} className="flex items-center gap-2">
                  <form action={toggleChecklistItemAction} className="min-w-0 flex-1">
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="itemId" value={i.id} />
                    <button className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-sand ${i.done ? "text-muted line-through" : ""}`} aria-pressed={i.done} aria-label={`${i.done ? "Снять отметку" : "Отметить выполненным"}: ${i.text}`}>
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[0.6rem] ${i.done ? "border-success bg-success text-white" : "border-line bg-white"}`} aria-hidden>{i.done ? "✓" : ""}</span>
                      <span className="min-w-0 break-words">{i.text}</span>
                    </button>
                  </form>
                  <form action={removeChecklistItemAction}>
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="itemId" value={i.id} />
                    <button className="px-1 text-xs text-muted hover:text-danger" aria-label={`Удалить пункт: ${i.text}`}>удалить</button>
                  </form>
                </li>
              ))}
              {checklist.length === 0 && <li className="text-xs text-muted">Разбейте задачу на шаги — прогресс будет виден на карточке доски.</li>}
            </ul>
            <ChecklistAddForm taskId={task.id} />
          </div>

          <div className="card space-y-4 p-5">
            <Eyebrow>Комментарии и история</Eyebrow>
            <CommentForm taskId={task.id} />
            <ul className="space-y-3">
              {task.comments.map((c) =>
                c.isSystem ? (
                  <li key={c.id} className="text-xs text-muted">
                    <span className="whitespace-pre-line">{c.text}</span> · {c.author ? c.author.firstName : "система"} · {formatDate(c.createdAt, true)}
                  </li>
                ) : (
                  <li key={c.id} className="border-l-2 border-champagne pl-3">
                    <p className="whitespace-pre-line text-sm">{c.text}</p>
                    <div className="text-xs text-muted">{c.author ? staffName(c.author) : "—"} · {formatDate(c.createdAt, true)}</div>
                  </li>
                ),
              )}
              {task.comments.length === 0 && <li className="text-xs text-muted">Пока пусто: здесь появятся комментарии команды и записи о смене этапа, срока и ответственного.</li>}
            </ul>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="card space-y-3 p-5">
            <Eyebrow>Этап</Eyebrow>
            <div className="flex items-center gap-2 text-sm">
              <Badge tone={TASK_STATUS[task.status].tone}>{TASK_STATUS[task.status].label}</Badge>
              {task.status === "DONE" && task.completedAt && <span className="text-xs text-muted">{formatDate(task.completedAt, true)}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {TRANSITIONS[task.status].map((tr) => (
                <form key={tr.to} action={setTaskStatusAction}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="status" value={tr.to} />
                  <SubmitButton className={tr.primary ? "btn-primary btn-sm" : tr.to === "CANCELLED" ? "btn-outline btn-sm !text-muted" : "btn-outline btn-sm"}>{tr.label}</SubmitButton>
                </form>
              ))}
            </div>
            <p className="text-xs text-muted">Смена этапа записывается в историю. Доска: новая → в работе → на проверке → выполнена.</p>
          </div>

          <div className="card space-y-2 p-5 text-sm">
            <Eyebrow>Связи</Eyebrow>
            <div>
              <span className="text-muted">Клиентка: </span>
              {task.customer ? (
                <>
                  <Link href={`/crm/customers/${task.customer.id}`} prefetch={false} className="underline underline-offset-4">{task.customer.firstName} {task.customer.lastName}</Link>
                  {task.customer.phone && <span className="text-muted"> · {task.customer.phone}</span>}
                </>
              ) : (
                <span className="text-muted">—</span>
              )}
            </div>
            <div>
              <span className="text-muted">Заказ: </span>
              {task.order ? <Link href={`/crm/orders/${task.order.id}`} prefetch={false} className="underline underline-offset-4">№{task.order.number}</Link> : <span className="text-muted">—</span>}
            </div>
            <div><span className="text-muted">Ответственная: </span>{staffName(task.assignee)}</div>
            <div><span className="text-muted">Обновлена: </span>{formatDate(task.updatedAt, true)}</div>
          </div>

          {me.role === "ADMIN" && (
            <div className="card p-5">
              <Eyebrow className="mb-2">Удаление</Eyebrow>
              <p className="mb-2 text-xs text-muted">Обычно задачу достаточно отменить — она останется в списке. Удаление стирает её вместе с комментариями.</p>
              <DeleteTaskButton taskId={task.id} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
