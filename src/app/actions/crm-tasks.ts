"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TaskKind, TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { errorMessage, type ActionState } from "@/lib/action-result";
import {
  addChecklistItem,
  addComment,
  createTask,
  deleteTask,
  moveTask,
  parseLocalDateTime,
  removeChecklistItem,
  staffName,
  toggleChecklistItem,
  updateTask,
} from "@/lib/tasks";

/**
 * Действия раздела «Задачи». Все страницы CRM обновляются целиком (revalidatePath("/crm", "layout")):
 * задача видна на доске, на главной, в карточке клиентки и в счётчике меню, где бы её ни поменяли.
 */
const refresh = () => revalidatePath("/crm", "layout");

const statusEnum = z.enum(TaskStatus);
const priorityEnum = z.enum(TaskPriority);
const kindEnum = z.enum(TaskKind);
const optionalId = z.string().trim().optional().transform((v) => v || null);

const CreateSchema = z.object({
  title: z.string().trim().min(1, "Введите название задачи").max(300, "Название слишком длинное"),
  details: z.string().trim().max(5000, "Описание слишком длинное").optional(),
  dueAt: z.string().trim().optional(),
  priority: priorityEnum.default("NORMAL"),
  kind: kindEnum.default("OTHER"),
  assigneeId: optionalId,
  customerId: optionalId,
  orderId: optionalId,
});

export async function createTaskAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("tasks");
  const parsed = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.dueAt && !parseLocalDateTime(d.dueAt)) return { error: "Срок указан неверно" };
  try {
    // «Мне» — пустое значение в списке ответственных
    const task = await createTask({ ...d, dueAt: parseLocalDateTime(d.dueAt), assigneeId: d.assigneeId ?? staff.id }, staff.id);
    await audit(staff.id, "task.create", "CrmTask", task.id, { title: task.title, assigneeId: task.assigneeId });
    refresh();
    return { ok: true, message: `Задача «${task.title}» создана → назначена ${task.assignee ? (task.assignee.id === staff.id ? "вам" : staffName(task.assignee)) : "никому"}`, code: task.id };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

const UpdateSchema = CreateSchema.extend({
  id: z.string().min(1),
  status: statusEnum,
});

export async function updateTaskAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("tasks");
  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.dueAt && !parseLocalDateTime(d.dueAt)) return { error: "Срок указан неверно" };
  try {
    const task = await updateTask(d.id, { title: d.title, details: d.details ?? null, dueAt: parseLocalDateTime(d.dueAt), priority: d.priority, kind: d.kind, status: d.status, assigneeId: d.assigneeId, customerId: d.customerId, orderId: d.orderId }, staff.id);
    await audit(staff.id, "task.update", "CrmTask", task.id, { status: task.status, assigneeId: task.assigneeId });
    refresh();
    return { ok: true, message: "Сохранено" };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Кнопки «В работу / На проверку / Готово / Отменить / Вернуть» в обычных формах. */
export async function setTaskStatusAction(formData: FormData) {
  const staff = await requireSection("tasks");
  const id = String(formData.get("id") ?? "");
  const status = statusEnum.safeParse(formData.get("status"));
  if (!id || !status.success) return;
  const task = await updateTask(id, { status: status.data }, staff.id);
  await audit(staff.id, "task.status", "CrmTask", task.id, { status: task.status });
  refresh();
}

const MoveSchema = z.object({ id: z.string().min(1), status: statusEnum, position: z.number().int().min(0).max(100_000) });

/** Перенос карточки на доске: вызывается из клиентского обработчика перетаскивания и меню «Переместить». */
export async function moveTaskAction(input: { id: string; status: TaskStatus; position: number }): Promise<ActionState> {
  const staff = await requireSection("tasks");
  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) return { error: "Неверные данные переноса" };
  try {
    const task = await moveTask(parsed.data.id, parsed.data.status, parsed.data.position, staff.id);
    await audit(staff.id, "task.move", "CrmTask", task.id, { status: task.status, position: task.position });
    refresh();
    return { ok: true, code: task.status };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addChecklistItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("tasks");
  const id = String(formData.get("id") ?? "");
  try {
    await addChecklistItem(id, String(formData.get("text") ?? ""));
    refresh();
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function toggleChecklistItemAction(formData: FormData) {
  await requireSection("tasks");
  await toggleChecklistItem(String(formData.get("id") ?? ""), String(formData.get("itemId") ?? ""));
  refresh();
}

export async function removeChecklistItemAction(formData: FormData) {
  await requireSection("tasks");
  await removeChecklistItem(String(formData.get("id") ?? ""), String(formData.get("itemId") ?? ""));
  refresh();
}

export async function addCommentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("tasks");
  const id = String(formData.get("id") ?? "");
  try {
    await addComment(id, String(formData.get("text") ?? ""), staff.id);
    refresh();
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Удаление — только администратор; остальным доступна отмена задачи. */
export async function deleteTaskAction(formData: FormData) {
  const staff = await requireSection("tasks");
  if (staff.role !== "ADMIN") return;
  const id = String(formData.get("id") ?? "");
  await deleteTask(id);
  await audit(staff.id, "task.delete", "CrmTask", id);
  refresh();
  redirect("/crm/tasks");
}
