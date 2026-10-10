import { staffList } from "@/lib/tasks";
import { QuickTaskForm, type StaffOption } from "@/components/crm/task-forms-client";

/** Список сотрудников для выпадающего «Ответственный» (имя и первая буква фамилии — хватает для команды из трёх человек). */
export function staffOptions(staff: { id: string; firstName: string; lastName: string | null }[]): StaffOption[] {
  return staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName ?? ""}`.trim() }));
}

/**
 * Быстрая форма задачи для карточек клиентки и заказа: сама подтягивает сотрудников, снаружи нужны только
 * customerId / orderId. Серверный компонент — вставляется в любую страницу CRM одной строкой.
 */
export async function TaskQuickForm({ customerId, orderId, layout = "stack" }: { customerId?: string | null; orderId?: string | null; layout?: "row" | "stack" }) {
  const staff = await staffList();
  return <QuickTaskForm staff={staffOptions(staff)} customerId={customerId} orderId={orderId} layout={layout} />;
}
