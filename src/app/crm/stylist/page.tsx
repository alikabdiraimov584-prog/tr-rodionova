import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { SELECTION_STATUS } from "@/lib/labels";
import { Badge, Empty, Eyebrow, PageTitle } from "@/components/ui";
import { qs, str } from "@/components/crm/pager";
import type { SelectionStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Стилист онлайн" };

const STATUSES = Object.keys(SELECTION_STATUS) as SelectionStatus[];

export default async function StylistList({ searchParams }: PageProps<"/crm/stylist">) {
  await requireSection("stylist");
  const sp = await searchParams;
  const status = str(sp.status);
  const filter = status && STATUSES.includes(status as SelectionStatus) ? (status as SelectionStatus) : undefined;
  const [selections, customers] = await Promise.all([
    db.selection.findMany({
      where: filter ? { status: filter } : { status: { not: "ARCHIVED" } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        stylist: { select: { firstName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    db.user.findMany({ where: { role: "CUSTOMER", isActive: true }, select: { id: true, firstName: true, lastName: true, email: true, preferredSize: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
  ]);
  return (
    <div>
      <PageTitle title="Стилист онлайн">Персональные подборки: стилист собирает вещи с рекомендованным размером и комментарием, клиентка видит их в кабинете и добавляет в корзину в один клик.</PageTitle>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Link href="/crm/stylist" className={`badge ${!filter ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>Активные</Link>
            {STATUSES.map((s) => (
              <Link key={s} href={qs("/crm/stylist", { status: s })} className={`badge ${filter === s ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>{SELECTION_STATUS[s].label}</Link>
            ))}
          </div>
          {selections.length === 0 ? (
            <Empty title="Подборок нет">Создайте первую: выберите клиентку справа.</Empty>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table">
                <thead><tr><th>Подборка</th><th>Клиентка</th><th>Стилист</th><th>Статус</th><th className="text-right">Вещей</th><th>Дата</th></tr></thead>
                <tbody>
                  {selections.map((s) => (
                    <tr key={s.id}>
                      <td><Link href={`/crm/stylist/${s.id}`} className="underline">{s.title}</Link></td>
                      <td><Link href={`/crm/customers/${s.user.id}`} className="underline">{s.user.firstName} {s.user.lastName}</Link></td>
                      <td className="text-muted">{s.stylist?.firstName ?? "—"}</td>
                      <td><Badge tone={SELECTION_STATUS[s.status].tone}>{SELECTION_STATUS[s.status].label}</Badge></td>
                      <td className="text-right">{s._count.items}</td>
                      <td className="whitespace-nowrap text-muted">{formatDate(s.sentAt ?? s.createdAt)}{s.viewedAt ? ` · просмотрена ${formatDate(s.viewedAt)}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="card h-fit space-y-3 p-5">
          <Eyebrow>Новая подборка</Eyebrow>
          <form action="/crm/stylist/new" className="space-y-2">
            <label className="block">
              <span className="label">Клиентка</span>
              <select name="customer" className="input py-2" required defaultValue="">
                <option value="" disabled>Выберите</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.lastName ? `${c.lastName} ${c.firstName}` : c.firstName} · {c.email}{c.preferredSize ? ` · ${c.preferredSize}` : ""}</option>
                ))}
              </select>
            </label>
            <button className="btn-primary btn-sm">Новая подборка</button>
          </form>
          <p className="text-xs text-muted">Клиентка получит сообщение в чат кабинета, когда вы нажмёте «Отправить клиентке».</p>
        </aside>
      </div>
    </div>
  );
}
