import Link from "next/link";
import type { Metadata } from "next";
import { TaskKind, TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { requireSection } from "@/lib/auth";
import { formatDate, plural } from "@/lib/money";
import { TASK_KIND, TASK_PRIORITY, TASK_STATUS } from "@/lib/labels";
import { ACTIVE_STATUSES, BOARD_COLUMNS, DONE_WINDOW_DAYS, cardData, listTasks, moscowClock, staffList, taskSummary, type TaskRow } from "@/lib/tasks";
import { Badge, Eyebrow, PageTitle, Stat } from "@/components/ui";
import { qs, str } from "@/components/crm/pager";
import { TaskBoard } from "@/components/crm/task-board";
import { PriorityDot, TaskCard } from "@/components/crm/task-card";
import { QuickTaskForm } from "@/components/crm/task-forms-client";
import { staffOptions } from "@/components/crm/task-forms";

export const metadata: Metadata = { title: "Задачи" };

const VIEWS = [["board", "Доска"], ["list", "Список"], ["plan", "План"]] as const;
const DAY = 86_400_000;
const isEnum = <T extends string>(values: readonly T[], v: string | undefined): T | undefined => (v && (values as readonly string[]).includes(v) ? (v as T) : undefined);

/**
 * Раздел «Задачи»: быстрая форма, сводка «что горит», три вида (доска / список / план) и фильтры в адресе.
 * Стартовый экран — все открытые задачи команды: раньше по умолчанию стоял фильтр «Мои», и задача,
 * назначенная коллеге, исчезала сразу после создания, как будто не сохранилась.
 */
export default async function Tasks({ searchParams }: PageProps<"/crm/tasks">) {
  const user = await requireSection("tasks");
  const sp = await searchParams;
  const view = isEnum(["board", "list", "plan"] as const, str(sp.view)) ?? "board";
  const scope = str(sp.scope) === "mine" ? "mine" : "all";
  const kind = isEnum(Object.values(TaskKind), str(sp.kind));
  const priority = isEnum(Object.values(TaskPriority), str(sp.priority));
  const assignee = str(sp.assignee);
  const q = str(sp.q)?.slice(0, 100);
  const statusParam = str(sp.status) ?? "active";
  const highlight = str(sp.new);
  const now = new Date();
  const current = { view, scope: scope === "mine" ? "mine" : undefined, kind, priority, assignee, q, status: view === "list" && statusParam !== "active" ? statusParam : undefined };
  const link = (patch: Record<string, string | undefined>) => qs("/crm/tasks", { ...current, ...patch });

  const base = { mineOf: scope === "mine" ? user.id : undefined, assigneeId: assignee, kind, priority, q };
  const listStatuses: TaskStatus[] = statusParam === "all" ? Object.values(TaskStatus) : isEnum(Object.values(TaskStatus), statusParam) ? [statusParam as TaskStatus] : ACTIVE_STATUSES;
  const [staff, summary, tasks] = await Promise.all([
    staffList(),
    taskSummary(now),
    view === "board"
      ? listTasks({ ...base, statuses: [...ACTIVE_STATUSES, "DONE"], closedSince: new Date(now.getTime() - DONE_WINDOW_DAYS * DAY) })
      : view === "list"
        ? listTasks({ ...base, statuses: listStatuses, take: 300 })
        : listTasks({ ...base, statuses: ACTIVE_STATUSES }),
  ]);
  const cards = tasks.map((t) => cardData(t, now));
  const filtersOn = !!(kind || priority || assignee || q || scope === "mine");
  const chip = (active: boolean) => `badge whitespace-nowrap ${active ? "border-ink bg-ink text-ivory" : "border-line bg-white hover:bg-sand"}`;

  return (
    <div className="space-y-6">
      <PageTitle title="Задачи" actions={<Link href={link({ view: "plan" })} prefetch={false} className="btn-outline btn-sm">План на день</Link>}>
        Доска команды: новые → в работе → на проверке → выполнены. Срок необязателен, «срочно» — для действительно горящих.
      </PageTitle>

      <div className="card p-4 md:p-5">
        <Eyebrow className="mb-3">Новая задача</Eyebrow>
        <QuickTaskForm staff={staffOptions(staff)} highlight layout="row" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Просрочено" value={summary.overdue} tone={summary.overdue > 0 ? "danger" : undefined} hint={summary.overdue > 0 ? "срок прошёл, задача открыта" : "всё в срок"} />
        <Stat label="Сегодня" value={summary.today} hint="срок до конца дня" />
        <Stat label="На неделе" value={summary.week} hint={`без срока: ${summary.noDue}`} />
        <Stat label="В работе" value={summary.inProgress} hint={`на проверке: ${summary.review}`} />
        <Stat label="Готово за 7 дней" value={summary.done7} tone={summary.done7 > 0 ? "success" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Нагрузка:</span>
        {summary.byAssignee.map((a) => (
          <Link key={a.id} href={link({ assignee: assignee === a.id ? undefined : a.id })} prefetch={false} className={chip(assignee === a.id)}>
            {a.name} · {a.open} {plural(a.open, ["открытая", "открытые", "открытых"])}{a.overdue > 0 && <span className={assignee === a.id ? "" : "text-danger"}> · {a.overdue} {plural(a.overdue, ["просрочена", "просрочены", "просрочено"])}</span>}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-sand p-1" aria-label="Вид">
            {VIEWS.map(([k, v]) => (
              <Link key={k} href={link({ view: k })} prefetch={false} aria-current={view === k ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-sm ${view === k ? "bg-white font-semibold shadow-sm" : "text-muted hover:text-ink"}`}>{v}</Link>
            ))}
          </div>
          <form action="/crm/tasks" className="flex w-full gap-2 sm:w-auto">
            {Object.entries(current).map(([k, v]) => (k !== "q" && v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
            <input name="q" defaultValue={q ?? ""} placeholder="Поиск по названию и описанию" className="input py-2 sm:w-72" aria-label="Поиск задач" />
            <button className="btn-outline btn-sm shrink-0">Найти</button>
          </form>
        </div>
        <div className="scroll-row -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-xs md:mx-0 md:flex-wrap md:px-0">
          <Link href={link({ scope: undefined })} prefetch={false} className={chip(scope === "all")}>Все</Link>
          <Link href={link({ scope: "mine" })} prefetch={false} className={chip(scope === "mine")}>Мои</Link>
          <span className="w-px shrink-0 bg-line" aria-hidden />
          {Object.values(TaskKind).map((k) => (
            <Link key={k} href={link({ kind: kind === k ? undefined : k })} prefetch={false} className={chip(kind === k)}>{TASK_KIND[k].label}</Link>
          ))}
          <span className="w-px shrink-0 bg-line" aria-hidden />
          {Object.values(TaskPriority).map((p) => (
            <Link key={p} href={link({ priority: priority === p ? undefined : p })} prefetch={false} className={chip(priority === p)}>{TASK_PRIORITY[p].label}</Link>
          ))}
          {view === "list" && (
            <>
              <span className="w-px shrink-0 bg-line" aria-hidden />
              {[["active", "Открытые"], ...Object.values(TaskStatus).map((s) => [s, TASK_STATUS[s].label]), ["all", "Все этапы"]].map(([k, v]) => (
                <Link key={k} href={link({ status: k === "active" ? undefined : k })} prefetch={false} className={chip(statusParam === k)}>{v}</Link>
              ))}
            </>
          )}
          {filtersOn && <Link href="/crm/tasks" prefetch={false} className="badge border-transparent text-muted underline underline-offset-4 whitespace-nowrap">сбросить</Link>}
        </div>
      </div>

      {view === "board" && <TaskBoard tasks={cards} highlightId={highlight} columns={BOARD_COLUMNS.map((s) => ({ status: s, hint: s === "DONE" ? `за ${DONE_WINDOW_DAYS} дней` : undefined }))} />}
      {view === "list" && <TaskTable tasks={tasks} highlight={highlight} now={now} />}
      {view === "plan" && <TaskPlan tasks={tasks} highlight={highlight} now={now} />}
    </div>
  );
}

function TaskTable({ tasks, highlight, now }: { tasks: TaskRow[]; highlight?: string; now: Date }) {
  const dueClass = { danger: "text-danger", warning: "text-warning", muted: "text-muted" } as const;
  return (
    <div className="card overflow-x-auto" tabIndex={0}>
      <table className="table">
        <thead>
          <tr><th>Задача</th><th>Этап</th><th>Приоритет</th><th>Срок</th><th>Ответственная</th><th>Обновлена</th></tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const c = cardData(t, now);
            return (
              <tr key={t.id} className={t.id === highlight ? "bg-sand/60" : ""}>
                <td className="max-w-md">
                  <Link href={`/crm/tasks/${t.id}`} prefetch={false} className="font-medium hover:underline">{t.title}</Link>
                  <div className="flex flex-wrap gap-x-2 text-xs text-muted">
                    <span>{TASK_KIND[t.kind].label}</span>
                    {c.customer && <Link href={`/crm/customers/${c.customer.id}`} prefetch={false} className="underline underline-offset-2">{c.customer.name}</Link>}
                    {c.order && <Link href={`/crm/orders/${c.order.id}`} prefetch={false} className="underline underline-offset-2">Заказ №{c.order.number}</Link>}
                    {c.checklist && <span>☑ {c.checklist.done}/{c.checklist.total}</span>}
                    {c.comments > 0 && <span>💬 {c.comments}</span>}
                  </div>
                </td>
                <td><Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge></td>
                <td><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><PriorityDot priority={t.priority} />{TASK_PRIORITY[t.priority].label}</span></td>
                <td className={`whitespace-nowrap text-xs ${c.due ? dueClass[c.due.tone] : "text-muted"}`}>{c.due ? c.due.label : "—"}</td>
                <td className="whitespace-nowrap">{c.assignee ? c.assignee.name : <span className="text-muted">не назначена</span>}</td>
                <td className="whitespace-nowrap text-xs text-muted">{formatDate(t.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {tasks.length === 0 && <p className="p-6 text-center text-sm text-muted">По этим условиям задач нет. Снимите фильтры или создайте задачу в форме выше.</p>}
      {tasks.length >= 300 && <p className="p-3 text-center text-xs text-muted">Показаны первые 300 — уточните фильтры или поиск.</p>}
    </div>
  );
}

/** Повестка: просроченные, сегодня, завтра, на неделе, позже, без срока — группами, чтобы распланировать день. */
function TaskPlan({ tasks, highlight, now }: { tasks: TaskRow[]; highlight?: string; now: Date }) {
  const { end } = moscowClock(now);
  const tomorrowEnd = new Date(end.getTime() + DAY);
  const weekEnd = new Date(end.getTime() + 7 * DAY);
  const groups: { key: string; title: string; hint: string; tone?: "danger" | "warning"; items: TaskRow[] }[] = [
    { key: "overdue", title: "Просрочено", hint: "сначала они: срок уже прошёл", tone: "danger", items: [] },
    { key: "today", title: "Сегодня", hint: "до конца дня", tone: "warning", items: [] },
    { key: "tomorrow", title: "Завтра", hint: "", items: [] },
    { key: "week", title: "На неделе", hint: "следующие 7 дней", items: [] },
    { key: "later", title: "Позже", hint: "", items: [] },
    { key: "none", title: "Без срока", hint: "решите, когда делать, или оставьте как фон", items: [] },
  ];
  for (const t of tasks) {
    const g = !t.dueAt ? "none" : t.dueAt < now ? "overdue" : t.dueAt < end ? "today" : t.dueAt < tomorrowEnd ? "tomorrow" : t.dueAt < weekEnd ? "week" : "later";
    groups.find((x) => x.key === g)!.items.push(t);
  }
  if (tasks.length === 0) return <div className="card p-8 text-center text-sm text-muted">Открытых задач по этим условиям нет — хороший день.</div>;
  return (
    <div className="space-y-6">
      {groups.filter((g) => g.items.length > 0).map((g) => (
        <section key={g.key} aria-label={g.title}>
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className={`text-sm font-semibold ${g.tone === "danger" ? "text-danger" : g.tone === "warning" ? "text-warning" : ""}`}>{g.title} <span className="text-xs font-normal text-muted">{g.items.length}</span></h2>
            {g.hint && <span className="text-xs text-muted">· {g.hint}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((t) => <TaskCard key={t.id} t={cardData(t, now)} highlighted={t.id === highlight} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
