import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { ROLE } from "@/lib/labels";
import { SECTIONS } from "@/lib/permissions";
import { Badge, Eyebrow, PageTitle } from "@/components/ui";
import { ResetPasswordForm, StaffForm } from "@/components/crm/admin-forms";
import { SubmitButton, ConfirmButton } from "@/components/form";
import { updateStaffAction } from "@/app/actions/crm-admin";
import { adminResetTotpAction } from "@/app/actions/totp";

export const metadata: Metadata = { title: "Сотрудники" };

const SECTION_LABELS: Partial<Record<keyof typeof SECTIONS, string>> = {
  dashboard: "Дашборд", support: "Поддержка", orders: "Заказы (просмотр)", ordersEdit: "Заказы (изменение)", customers: "Клиенты (просмотр)",
  customersEdit: "Клиенты (изменение)", points: "Ручные баллы", tasks: "Задачи", products: "Товары", stock: "Склад", loyalty: "Лояльность",
  promos: "Промокоды", reviews: "Отзывы", finance: "Финансы", staff: "Сотрудники", settings: "Настройки", integrations: "Каналы", audit: "Журнал",
};

export default async function Staff() {
  const me = await requireSection("staff");
  const staff = await db.user.findMany({
    where: { role: { in: ["SUPPORT", "MANAGER", "ADMIN"] } },
    include: { _count: { select: { assignedChats: { where: { status: { not: "CLOSED" } } }, assigned: { where: { status: "OPEN" } } } } },
    orderBy: [{ isActive: "desc" }, { role: "desc" }, { firstName: "asc" }],
  });
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const replies = await db.message.groupBy({ by: ["authorId"], where: { direction: "OUT", createdAt: { gte: weekAgo } }, _count: true });
  const repliesBy = new Map(replies.map((r) => [r.authorId, r._count]));
  return (
    <div className="space-y-6">
      <PageTitle title="Сотрудники">Аккаунты менеджеров, поддержки и администраторов. Отключённый сотрудник не может войти, его открытые диалоги возвращаются в общую очередь.</PageTitle>
      <div className="card p-5">
        <Eyebrow>Новый сотрудник</Eyebrow>
        <div className="mt-3"><StaffForm /></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Сотрудник</th><th>Роль</th><th>Статус</th><th className="text-right">Диалогов в работе</th><th className="text-right">Ответов за 7 дней</th><th className="text-right">Задач</th><th>Последний вход</th><th /></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className={s.isActive ? "" : "opacity-50"}>
                <td>{s.firstName} {s.lastName}<div className="text-xs text-muted">{s.email}</div></td>
                <td>
                  <form action={updateStaffAction} className="flex gap-1">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="op" value="role" />
                    <select name="role" defaultValue={s.role} className="border border-line bg-white px-2 py-1 text-xs">
                      <option value="SUPPORT">{ROLE.SUPPORT}</option><option value="MANAGER">{ROLE.MANAGER}</option><option value="ADMIN">{ROLE.ADMIN}</option>
                    </select>
                    <SubmitButton className="text-xs underline">ок</SubmitButton>
                  </form>
                </td>
                <td><Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Активен" : "Отключён"}</Badge></td>
                <td className="text-right">{s._count.assignedChats}</td>
                <td className="text-right">{repliesBy.get(s.id) ?? 0}</td>
                <td className="text-right">{s._count.assigned}</td>
                <td className="whitespace-nowrap text-muted">{s.lastSeenAt ? formatDate(s.lastSeenAt, true) : "—"}</td>
                <td className="space-x-3 whitespace-nowrap">
                  {s.id !== me.id && (
                    <form action={updateStaffAction} className="inline">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="op" value="toggle" />
                      <ConfirmButton message={s.isActive ? "Отключить доступ сотрудника?" : "Включить доступ?"} className="text-xs text-muted underline hover:text-ink">{s.isActive ? "отключить" : "включить"}</ConfirmButton>
                    </form>
                  )}
                  <ResetPasswordForm id={s.id} />
                  {s.totpEnabledAt && s.id !== me.id && (
                    <form action={adminResetTotpAction} className="inline">
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmButton message="Сбросить двухфакторную защиту сотруднику? Все его сессии завершатся." className="text-xs text-muted underline hover:text-ink">сбросить 2FA</ConfirmButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card overflow-x-auto p-5">
        <Eyebrow>Права ролей</Eyebrow>
        <table className="table mt-3 text-xs">
          <thead><tr><th>Раздел</th><th className="text-center">Поддержка</th><th className="text-center">Менеджер</th><th className="text-center">Администратор</th></tr></thead>
          <tbody>
            {(Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).map((k) => (
              <tr key={k}>
                <td>{SECTION_LABELS[k] ?? k}</td>
                {(["SUPPORT", "MANAGER", "ADMIN"] as const).map((r) => <td key={r} className="text-center">{(SECTIONS[k] as readonly string[]).includes(r) ? "✓" : "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
