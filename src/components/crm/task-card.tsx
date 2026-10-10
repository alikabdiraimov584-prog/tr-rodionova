import Link from "next/link";
import type { ReactNode } from "react";
import type { TaskKind, TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { TASK_KIND, TASK_PRIORITY } from "@/lib/labels";
import { Badge } from "@/components/ui";

/**
 * Карточка задачи без хуков и серверных импортов: её рисует и доска (клиентский компонент), и серверные
 * виды «План» и карточка клиентки. Все строки (срок, инициалы) подготовлены на сервере в cardData().
 */
export type TaskCardData = {
  id: string;
  title: string;
  hasDetails: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  kind: TaskKind;
  position: number;
  due: { at: number; tone: "danger" | "warning" | "muted"; label: string } | null;
  assignee: { id: string; name: string; initials: string } | null;
  customer: { id: string; name: string } | null;
  order: { id: string; number: number } | null;
  checklist: { done: number; total: number } | null;
  comments: number;
  completedAt: number | null;
  createdAt: number;
};

const dueClass = { danger: "text-danger", warning: "text-warning", muted: "text-muted" } as const;

/** Точка приоритета для списков, где карточка целиком не нужна (главная CRM, карточка клиентки). */
export function PriorityDot({ priority }: { priority: TaskPriority }) {
  const p = TASK_PRIORITY[priority];
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${p.bar}`} title={`Приоритет: ${p.label}`} aria-label={`Приоритет: ${p.label}`} />;
}

export function Initials({ name, initials }: { name: string; initials: string }) {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sand text-[0.6rem] font-semibold text-ink" title={`Ответственная: ${name}`} aria-label={`Ответственная: ${name}`}>
      {initials}
    </span>
  );
}

export function TaskCard({ t, highlighted = false, dragging = false, actions, className = "" }: { t: TaskCardData; highlighted?: boolean; dragging?: boolean; actions?: ReactNode; className?: string }) {
  const closed = t.status === "DONE" || t.status === "CANCELLED";
  return (
    <article
      id={`task-${t.id}`}
      className={`card relative overflow-hidden pl-4 pr-3 py-3 text-sm transition-shadow ${highlighted ? "ring-2 ring-ink ring-offset-2 ring-offset-ivory" : ""} ${dragging ? "opacity-50" : ""} ${className}`}
      aria-label={t.title}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${TASK_PRIORITY[t.priority].bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={TASK_KIND[t.kind].tone}>{TASK_KIND[t.kind].label}</Badge>
            {t.priority === "URGENT" && <Badge tone="danger">Срочно</Badge>}
            {t.priority === "HIGH" && <Badge tone="warning">Высокий</Badge>}
          </div>
          <Link href={`/crm/tasks/${t.id}`} prefetch={false} className={`block font-medium leading-snug hover:underline ${closed ? "text-muted line-through" : ""}`}>
            {t.title}
          </Link>
          {t.due && <div className={`mt-1 text-xs ${closed ? "text-muted" : dueClass[t.due.tone]}`}>{t.due.label}</div>}
          {(t.customer || t.order) && (
            <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
              {t.customer && <Link href={`/crm/customers/${t.customer.id}`} prefetch={false} className="underline underline-offset-2 hover:text-ink">{t.customer.name}</Link>}
              {t.order && <Link href={`/crm/orders/${t.order.id}`} prefetch={false} className="underline underline-offset-2 hover:text-ink">Заказ №{t.order.number}</Link>}
            </div>
          )}
        </div>
        {t.assignee && <Initials name={t.assignee.name} initials={t.assignee.initials} />}
      </div>
      {(t.checklist || t.comments > 0 || t.hasDetails || actions) && (
        <div className="mt-2 flex items-center gap-3 text-xs text-muted">
          {t.checklist && <span title="Чеклист" aria-label={`Чеклист: ${t.checklist.done} из ${t.checklist.total}`}>☑ {t.checklist.done}/{t.checklist.total}</span>}
          {t.comments > 0 && <span title="Комментарии" aria-label={`Комментариев: ${t.comments}`}>💬 {t.comments}</span>}
          {t.hasDetails && <span title="Есть описание" aria-label="Есть описание">≡</span>}
          {actions && <span className="ml-auto flex items-center gap-1">{actions}</span>}
        </div>
      )}
    </article>
  );
}
