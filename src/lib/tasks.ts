import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TaskKind, TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { sendAlert } from "@/lib/alerts";
import { TASK_PRIORITY, TASK_STATUS } from "@/lib/labels";
import { plural } from "@/lib/money";
import type { TaskCardData } from "@/components/crm/task-card";

/**
 * Задачи команды: доска с четырьмя этапами, сводка «что горит» и утренняя сводка в Telegram.
 * Весь учёт времени — по Москве (команда и клиентки в одном часовом поясе), независимо от TZ сервера:
 * «сегодня», «на неделе» и час отправки сводки считаются через Intl с timeZone Europe/Moscow.
 */

export type ChecklistItem = { id: string; text: string; done: boolean };

/** Этапы, в которых задача ещё требует внимания: только они считаются просроченными и попадают в сводку. */
export const ACTIVE_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS", "REVIEW"];
/** Колонки доски слева направо. Отменённые — только в списке. */
export const BOARD_COLUMNS: TaskStatus[] = ["OPEN", "IN_PROGRESS", "REVIEW", "DONE"];
/** В колонке «Выполнена» и в сводке — выполненные за последние N дней, старше — в списке по фильтру. */
export const DONE_WINDOW_DAYS = 7;

const MSK = "Europe/Moscow";
const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

export function isActiveStatus(s: TaskStatus) {
  return ACTIVE_STATUSES.includes(s);
}

/**
 * Московские «часы» для момента now: час (для расписания сводки), ключ даты и границы суток как моменты времени.
 * Смещение не зашито (+3), а выводится из разницы между московскими цифрами и настоящим моментом.
 */
export function moscowClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: MSK, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const [y, m, d, h, min, s] = [get("year"), get("month"), get("day"), get("hour") % 24, get("minute"), get("second")];
  const offsetMs = Date.UTC(y, m - 1, d, h, min, s) - Math.floor(now.getTime() / 1000) * 1000;
  const start = new Date(Date.UTC(y, m - 1, d) - offsetMs);
  return { hour: h, dateKey: `${y}-${pad(m)}-${pad(d)}`, dateLabel: `${pad(d)}.${pad(m)}.${y}`, start, end: new Date(start.getTime() + DAY), offsetMs };
}

/** Значение поля datetime-local («2026-10-10T14:00») как момент времени по Москве. Пустая или кривая строка — null. */
export function parseLocalDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  if (!Number.isFinite(wall)) return null;
  return new Date(wall - moscowClock(new Date(wall)).offsetMs);
}

/** Обратно: момент времени → значение для datetime-local по Москве. */
export function toLocalInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleString("sv-SE", { timeZone: MSK, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" ", "T");
}

/** Срок в тексте: «10.10, 14:00» (год — только если не текущий, время — если не полночь). */
export function formatDue(d: Date, now = new Date()) {
  const dateParts = d.toLocaleDateString("ru-RU", { timeZone: MSK, day: "2-digit", month: "2-digit", year: "numeric" });
  const [dd, mm, yyyy] = dateParts.split(".");
  const time = d.toLocaleTimeString("ru-RU", { timeZone: MSK, hour: "2-digit", minute: "2-digit" });
  const sameYear = yyyy === now.toLocaleDateString("ru-RU", { timeZone: MSK, year: "numeric" });
  return `${dd}.${mm}${sameYear ? "" : `.${yyyy}`}${time === "00:00" ? "" : `, ${time}`}`;
}

export function parseChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ id: String(x.id ?? ""), text: String(x.text ?? ""), done: x.done === true }))
    .filter((x) => x.id && x.text);
}

export const taskInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
  order: { select: { id: true, number: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { comments: { where: { isSystem: false } } } },
} satisfies Prisma.CrmTaskInclude;

export type TaskRow = Prisma.CrmTaskGetPayload<{ include: typeof taskInclude }>;

export type TaskFilters = {
  /** Этапы; по умолчанию — активные (новая, в работе, на проверке). */
  statuses?: TaskStatus[];
  /** Выполненные и отменённые — только закрытые после этой даты (колонка «Выполнена» показывает неделю). */
  closedSince?: Date;
  /** «Мои»: назначенные этому сотруднику или никому. */
  mineOf?: string;
  /** Конкретный ответственный или "none" — без ответственного. */
  assigneeId?: string;
  kind?: TaskKind;
  priority?: TaskPriority;
  customerId?: string;
  orderId?: string;
  /** Поиск по названию и описанию. */
  q?: string;
  take?: number;
};

function whereFor(f: TaskFilters): Prisma.CrmTaskWhereInput {
  const and: Prisma.CrmTaskWhereInput[] = [];
  const statuses = f.statuses ?? ACTIVE_STATUSES;
  if (f.closedSince) {
    const or: Prisma.CrmTaskWhereInput[] = [];
    const open = statuses.filter(isActiveStatus);
    if (open.length) or.push({ status: { in: open } });
    if (statuses.includes("DONE")) or.push({ status: "DONE", completedAt: { gte: f.closedSince } });
    if (statuses.includes("CANCELLED")) or.push({ status: "CANCELLED", updatedAt: { gte: f.closedSince } });
    and.push({ OR: or });
  } else and.push({ status: { in: statuses } });
  if (f.mineOf) and.push({ OR: [{ assigneeId: f.mineOf }, { assigneeId: null }] });
  if (f.assigneeId) and.push(f.assigneeId === "none" ? { assigneeId: null } : { assigneeId: f.assigneeId });
  if (f.kind) and.push({ kind: f.kind });
  if (f.priority) and.push({ priority: f.priority });
  if (f.customerId) and.push({ customerId: f.customerId });
  if (f.orderId) and.push({ orderId: f.orderId });
  if (f.q) and.push({ OR: [{ title: { contains: f.q, mode: "insensitive" } }, { details: { contains: f.q, mode: "insensitive" } }] });
  return { AND: and };
}

export async function listTasks(filters: TaskFilters = {}): Promise<TaskRow[]> {
  return db.crmTask.findMany({
    where: whereFor(filters),
    include: taskInclude,
    // просроченные и ближайшие — выше, без срока — по порядку на доске
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { position: "asc" }, { createdAt: "desc" }],
    take: filters.take,
  });
}

/** Порядок карточек в колонке: сначала по сроку (просроченные выше), без срока — по position; «Выполнена» — свежие сверху. */
export function compareInColumn(status: TaskStatus) {
  return (a: Pick<TaskRow, "dueAt" | "position" | "createdAt" | "completedAt">, b: typeof a) => {
    if (status === "DONE") return (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
    if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return a.position - b.position || b.createdAt.getTime() - a.createdAt.getTime();
  };
}

export async function getTask(id: string) {
  return db.crmTask.findUnique({
    where: { id },
    include: {
      ...taskInclude,
      createdBy: { select: { firstName: true, lastName: true } },
      comments: { include: { author: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
}

/** Сотрудники, которым можно назначить задачу (отключённые не предлагаются). */
export async function staffList() {
  return db.user.findMany({
    where: { role: { in: ["SUPPORT", "MANAGER", "ADMIN"] }, isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: { firstName: "asc" },
  });
}

export function staffName(u: { firstName: string; lastName?: string | null } | null | undefined) {
  return u ? `${u.firstName} ${u.lastName ?? ""}`.trim() : "не назначена";
}

export type TaskSummary = Awaited<ReturnType<typeof taskSummary>>;

/** Сводка для ежедневного обзора: что просрочено, что на сегодня и неделю, нагрузка по сотрудникам и типам. */
export async function taskSummary(now = new Date()) {
  const { start, end } = moscowClock(now);
  const weekEnd = new Date(start.getTime() + 7 * DAY);
  const since = new Date(now.getTime() - DONE_WINDOW_DAYS * DAY);
  const active = { status: { in: ACTIVE_STATUSES } };
  const [overdue, today, week, inProgress, review, done7, noDue, rows, kinds, staff] = await Promise.all([
    db.crmTask.count({ where: { ...active, dueAt: { lt: now } } }),
    db.crmTask.count({ where: { ...active, dueAt: { gte: now, lt: end } } }),
    db.crmTask.count({ where: { ...active, dueAt: { gte: end, lt: weekEnd } } }),
    db.crmTask.count({ where: { status: "IN_PROGRESS" } }),
    db.crmTask.count({ where: { status: "REVIEW" } }),
    db.crmTask.count({ where: { status: "DONE", completedAt: { gte: since } } }),
    db.crmTask.count({ where: { ...active, dueAt: null } }),
    db.crmTask.findMany({ where: active, select: { assigneeId: true, dueAt: true } }),
    db.crmTask.groupBy({ by: ["kind"], where: active, _count: { _all: true }, orderBy: { _count: { kind: "desc" } } }),
    staffList(),
  ]);
  const load = new Map<string | null, { open: number; overdue: number }>();
  for (const r of rows) {
    const acc = load.get(r.assigneeId) ?? { open: 0, overdue: 0 };
    acc.open++;
    if (r.dueAt && r.dueAt < now) acc.overdue++;
    load.set(r.assigneeId, acc);
  }
  const byAssignee = staff.map((s) => ({ id: s.id, name: s.firstName, ...(load.get(s.id) ?? { open: 0, overdue: 0 }) }));
  const unassigned = load.get(null);
  if (unassigned) byAssignee.push({ id: "none", name: "Без ответственного", ...unassigned });
  return {
    overdue,
    today,
    week,
    inProgress,
    review,
    done7,
    noDue,
    byAssignee,
    byKind: kinds.map((k) => ({ kind: k.kind, count: k._count._all })),
  };
}

export type TaskInput = {
  title: string;
  details?: string | null;
  dueAt?: Date | null;
  priority?: TaskPriority;
  kind?: TaskKind;
  status?: TaskStatus;
  assigneeId?: string | null;
  customerId?: string | null;
  orderId?: string | null;
};

export async function createTask(input: TaskInput, actorId: string | null): Promise<TaskRow> {
  const status = input.status ?? "OPEN";
  // новая карточка встаёт в конец своей колонки
  const last = await db.crmTask.aggregate({ where: { status }, _max: { position: true } });
  return db.crmTask.create({
    data: {
      title: input.title,
      details: input.details || null,
      dueAt: input.dueAt ?? null,
      priority: input.priority ?? "NORMAL",
      kind: input.kind ?? "OTHER",
      status,
      completedAt: status === "DONE" ? new Date() : null,
      position: (last._max.position ?? -1) + 1,
      assigneeId: input.assigneeId || null,
      customerId: input.customerId || null,
      orderId: input.orderId || null,
      createdById: actorId,
    },
    include: taskInclude,
  });
}

export type TaskPatch = Partial<Omit<TaskInput, "status">> & { status?: TaskStatus };

/**
 * Правка полей. Смена этапа, срока, ответственного и приоритета оставляет системную запись в истории —
 * команда видит, кто и когда передвинул задачу, без отдельного журнала.
 */
export async function updateTask(id: string, patch: TaskPatch, actorId: string | null): Promise<TaskRow> {
  return db.$transaction(async (tx) => {
    const cur = await tx.crmTask.findUnique({ where: { id }, include: { assignee: { select: { firstName: true, lastName: true } } } });
    if (!cur) throw new Error("Задача не найдена");
    const notes: string[] = [];
    const data: Prisma.CrmTaskUncheckedUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.details !== undefined) data.details = patch.details || null;
    if (patch.kind !== undefined) data.kind = patch.kind;
    if (patch.customerId !== undefined) data.customerId = patch.customerId || null;
    if (patch.orderId !== undefined) data.orderId = patch.orderId || null;
    if (patch.status !== undefined && patch.status !== cur.status) {
      notes.push(`Этап: ${TASK_STATUS[cur.status].label} → ${TASK_STATUS[patch.status].label}`);
      data.status = patch.status;
      data.completedAt = patch.status === "DONE" ? new Date() : null;
      if (isActiveStatus(patch.status)) {
        const last = await tx.crmTask.aggregate({ where: { status: patch.status }, _max: { position: true } });
        data.position = (last._max.position ?? -1) + 1;
      }
    }
    if (patch.dueAt !== undefined && (patch.dueAt?.getTime() ?? null) !== (cur.dueAt?.getTime() ?? null)) {
      notes.push(`Срок: ${cur.dueAt ? formatDue(cur.dueAt) : "без срока"} → ${patch.dueAt ? formatDue(patch.dueAt) : "без срока"}`);
      data.dueAt = patch.dueAt ?? null;
    }
    if (patch.priority !== undefined && patch.priority !== cur.priority) {
      notes.push(`Приоритет: ${TASK_PRIORITY[cur.priority].label} → ${TASK_PRIORITY[patch.priority].label}`);
      data.priority = patch.priority;
    }
    if (patch.assigneeId !== undefined && (patch.assigneeId || null) !== cur.assigneeId) {
      const next = patch.assigneeId ? await tx.user.findUnique({ where: { id: patch.assigneeId }, select: { firstName: true, lastName: true } }) : null;
      notes.push(`Ответственный: ${staffName(cur.assignee)} → ${staffName(next)}`);
      data.assigneeId = patch.assigneeId || null;
    }
    const task = await tx.crmTask.update({ where: { id }, data, include: taskInclude });
    if (notes.length) await tx.crmTaskComment.create({ data: { taskId: id, authorId: actorId, text: notes.join("\n"), isSystem: true } });
    return task;
  });
}

/**
 * Перенос карточки на доске: новый этап и место в колонке (индекс среди остальных карточек).
 * Позиции в активной колонке перенумеровываются подряд; «Выполнена» сортируется по времени завершения, там позиция не важна.
 */
export async function moveTask(id: string, status: TaskStatus, position: number, actorId: string | null): Promise<TaskRow> {
  return db.$transaction(async (tx) => {
    const cur = await tx.crmTask.findUnique({ where: { id } });
    if (!cur) throw new Error("Задача не найдена");
    let newPosition = 0;
    if (isActiveStatus(status)) {
      const others = await tx.crmTask.findMany({ where: { status, id: { not: id } }, orderBy: [{ position: "asc" }, { createdAt: "desc" }], select: { id: true, position: true } });
      const idx = Math.max(0, Math.min(Math.trunc(position), others.length));
      newPosition = idx;
      // перенумеровываем только сдвинувшиеся карточки
      const ordered = [...others.slice(0, idx), null, ...others.slice(idx)];
      for (const [i, t] of ordered.entries()) if (t && t.position !== i) await tx.crmTask.update({ where: { id: t.id }, data: { position: i } });
    }
    const task = await tx.crmTask.update({
      where: { id },
      data: { status, position: newPosition, completedAt: status === "DONE" ? cur.completedAt ?? new Date() : null },
      include: taskInclude,
    });
    if (cur.status !== status) {
      await tx.crmTaskComment.create({ data: { taskId: id, authorId: actorId, text: `Этап: ${TASK_STATUS[cur.status].label} → ${TASK_STATUS[status].label}`, isSystem: true } });
    }
    return task;
  });
}

/** «Готово» одной кнопкой: этап DONE и время завершения. */
export async function completeTask(id: string, actorId: string | null) {
  return updateTask(id, { status: "DONE" }, actorId);
}

async function saveChecklist(id: string, mutate: (list: ChecklistItem[]) => ChecklistItem[]) {
  return db.$transaction(async (tx) => {
    const cur = await tx.crmTask.findUnique({ where: { id }, select: { checklist: true } });
    if (!cur) throw new Error("Задача не найдена");
    const list = mutate(parseChecklist(cur.checklist));
    return tx.crmTask.update({ where: { id }, data: { checklist: list }, select: { id: true, checklist: true } });
  });
}

export async function addChecklistItem(id: string, text: string) {
  const t = text.trim();
  if (!t) throw new Error("Введите пункт чеклиста");
  return saveChecklist(id, (list) => [...list, { id: randomUUID().slice(0, 8), text: t, done: false }]);
}

export async function toggleChecklistItem(id: string, itemId: string) {
  return saveChecklist(id, (list) => list.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)));
}

export async function removeChecklistItem(id: string, itemId: string) {
  return saveChecklist(id, (list) => list.filter((i) => i.id !== itemId));
}

export async function addComment(id: string, text: string, authorId: string | null) {
  const t = text.trim();
  if (!t) throw new Error("Введите комментарий");
  return db.crmTaskComment.create({ data: { taskId: id, authorId, text: t } });
}

/** Удаление вместе с историей (комментарии каскадом). Право — только у администратора, проверяется в действии. */
export async function deleteTask(id: string) {
  await db.crmTask.delete({ where: { id } });
}

/** Данные карточки для доски и списка: строки уже отформатированы по Москве, чтобы клиент ничего не пересчитывал. */
export function cardData(t: TaskRow, now = new Date()): TaskCardData {
  const { end } = moscowClock(now);
  let due: TaskCardData["due"] = null;
  if (t.dueAt) {
    const active = isActiveStatus(t.status);
    const overdue = active && t.dueAt < now;
    const today = t.dueAt >= now && t.dueAt < end;
    const tomorrow = !today && t.dueAt >= end && t.dueAt < new Date(end.getTime() + DAY);
    const time = t.dueAt.toLocaleTimeString("ru-RU", { timeZone: MSK, hour: "2-digit", minute: "2-digit" });
    const withTime = (word: string) => (time === "00:00" ? word : `${word}, ${time}`);
    due = {
      at: t.dueAt.getTime(),
      tone: overdue ? "danger" : today ? "warning" : "muted",
      label: overdue ? `просрочена · ${formatDue(t.dueAt, now)}` : today ? withTime("сегодня") : tomorrow ? withTime("завтра") : formatDue(t.dueAt, now),
    };
  }
  const checklist = parseChecklist(t.checklist);
  return {
    id: t.id,
    title: t.title,
    hasDetails: !!t.details,
    status: t.status,
    priority: t.priority,
    kind: t.kind,
    position: t.position,
    due,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.firstName, initials: `${t.assignee.firstName[0] ?? ""}${t.assignee.lastName?.[0] ?? ""}`.toUpperCase() } : null,
    customer: t.customer ? { id: t.customer.id, name: `${t.customer.firstName} ${t.customer.lastName ?? ""}`.trim() } : null,
    order: t.order ? { id: t.order.id, number: t.order.number } : null,
    checklist: checklist.length ? { done: checklist.filter((i) => i.done).length, total: checklist.length } : null,
    comments: t._count.comments,
    completedAt: t.completedAt?.getTime() ?? null,
    createdAt: t.createdAt.getTime(),
  };
}

/**
 * Утренняя сводка владельцу в Telegram: просроченные и сегодняшние задачи, раз в день в 09:00–09:59 по Москве.
 * Вызывается из ежечасных задач; повтор в тот же день отсекается отметкой remindedAt на задачах,
 * поэтому в sendAlert уходит force: true (его собственный интервал повторов — 6 часов — здесь не нужен).
 */
export async function remindOverdueTasks(now = new Date()): Promise<{ sent: boolean; reason?: string; overdue?: number; today?: number }> {
  const clock = moscowClock(now);
  if (clock.hour !== 9) return { sent: false, reason: "сводка уходит в 09:00 по Москве" };
  const tasks = await db.crmTask.findMany({
    where: { status: { in: ACTIVE_STATUSES }, dueAt: { lt: clock.end } },
    include: { assignee: { select: { firstName: true } }, customer: { select: { firstName: true, lastName: true } } },
    orderBy: { dueAt: "asc" },
  });
  if (tasks.length === 0) return { sent: false, reason: "нечего напоминать" };
  if (tasks.some((t) => t.remindedAt && t.remindedAt >= clock.start)) return { sent: false, reason: "сводка за сегодня уже отправлена" };
  const overdue = tasks.filter((t) => t.dueAt! < now);
  const today = tasks.filter((t) => t.dueAt! >= now);
  const line = (t: (typeof tasks)[number]) =>
    `• ${t.title}${t.customer ? ` — ${t.customer.firstName} ${t.customer.lastName ?? ""}`.trimEnd() : ""} · ${formatDue(t.dueAt!, now)} · ${t.assignee?.firstName ?? "не назначена"}`;
  // Telegram принимает до 4096 символов: длинный список обрезаем, хвост — одной строкой
  const block = (title: string, list: typeof tasks) => {
    if (list.length === 0) return null;
    const shown = list.slice(0, 15);
    return `${title} (${list.length}):\n${shown.map(line).join("\n")}${list.length > shown.length ? `\n…и ещё ${list.length - shown.length} ${plural(list.length - shown.length, ["задача", "задачи", "задач"])}` : ""}`;
  };
  const site = process.env.APP_URL ?? "https://tr-rodionova.ru";
  const text = [`Задачи на ${clock.dateLabel}`, block("Просрочено", overdue), block("Сегодня", today), `${site}/crm/tasks?view=plan`].filter(Boolean).join("\n\n");
  const r = await sendAlert(text, { key: `tasks-digest-${clock.dateKey}`, force: true });
  if (r.sent) await db.crmTask.updateMany({ where: { id: { in: tasks.map((t) => t.id) } }, data: { remindedAt: now } });
  return { ...r, overdue: overdue.length, today: today.length };
}
