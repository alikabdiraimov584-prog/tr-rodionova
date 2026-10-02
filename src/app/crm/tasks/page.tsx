import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { TASK_STATUS } from "@/lib/labels";
import { Badge, PageTitle } from "@/components/ui";
import { TaskForm } from "@/components/crm/customer-forms";
import { setTaskStatusAction } from "@/app/actions/crm-customers";
import { qs, str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Задачи" };

export default async function Tasks({ searchParams }: PageProps<"/crm/tasks">) {
  const user = await requireSection("tasks");
  const sp = await searchParams;
  const scope = str(sp.scope) ?? "mine";
  const status = (str(sp.status) ?? "OPEN") as "OPEN" | "DONE" | "CANCELLED";
  const [tasks, staff] = await Promise.all([
    db.crmTask.findMany({
      where: { status, ...(scope === "mine" ? { OR: [{ assigneeId: user.id }, { assigneeId: null }] } : {}) },
      include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true } }, assignee: { select: { firstName: true } } },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    }),
    db.user.findMany({ where: { role: { in: ["MANAGER", "ADMIN"] } }, select: { id: true, firstName: true } }),
  ]);
  const now = new Date();
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div>
        <PageTitle title="Задачи" />
        <div className="mb-4 flex flex-wrap gap-2">
          {[["mine", "Мои"], ["all", "Все"]].map(([k, v]) => (
            <Link key={k} href={qs("/crm/tasks", { scope: k, status })} className={`badge ${scope === k ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>{v}</Link>
          ))}
          <span className="mx-2" />
          {(["OPEN", "DONE", "CANCELLED"] as const).map((s) => (
            <Link key={s} href={qs("/crm/tasks", { scope, status: s })} className={`badge ${status === s ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>{TASK_STATUS[s].label}</Link>
          ))}
        </div>
        <div className="card divide-y divide-line">
          {tasks.map((t) => {
            const overdue = t.status === "OPEN" && t.dueAt && t.dueAt < now;
            return (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-sm">{t.title}</div>
                  <div className="text-xs text-muted">
                    {t.customer && <><Link href={`/crm/customers/${t.customer.id}`} className="underline">{t.customer.firstName} {t.customer.lastName}</Link> {t.customer.phone} · </>}
                    {t.assignee?.firstName ?? "не назначена"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {t.dueAt && <span className={`text-xs ${overdue ? "text-danger" : "text-muted"}`}>{overdue ? "просрочена · " : ""}{formatDate(t.dueAt)}</span>}
                  <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>
                  {t.status === "OPEN" && (
                    <>
                      <form action={setTaskStatusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="DONE" /><button className="btn-outline btn-sm">Готово</button></form>
                      <form action={setTaskStatusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="CANCELLED" /><button className="text-xs text-muted hover:text-danger">Отменить</button></form>
                    </>
                  )}
                  {t.status !== "OPEN" && (
                    <form action={setTaskStatusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="OPEN" /><button className="text-xs text-muted hover:text-ink">Вернуть в работу</button></form>
                  )}
                </div>
              </div>
            );
          })}
          {tasks.length === 0 && <p className="p-6 text-center text-sm text-muted">Задач нет</p>}
        </div>
      </div>
      <aside className="card h-fit p-5">
        <div className="eyebrow mb-3">Новая задача</div>
        <TaskForm staff={staff.map((s) => ({ id: s.id, name: s.firstName }))} />
      </aside>
    </div>
  );
}
