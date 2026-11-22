import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { rfmSegment, daysSince } from "@/lib/rfm";
import { formatDate, formatMoney } from "@/lib/money";
import { ORDER_STATUS, TASK_STATUS, TRAFFIC_CHANNEL } from "@/lib/labels";
import { Badge, Eyebrow, PageTitle, Stat } from "@/components/ui";
import { CustomerEditForm } from "@/components/crm/customer-forms";
import { TaskQuickForm } from "@/components/crm/task-forms";
import { PriorityDot } from "@/components/crm/task-card";
import { SubmitButton } from "@/components/form";
import { can } from "@/lib/permissions";
import { addNoteAction, anonymizeCustomerAction, deleteNoteAction } from "@/app/actions/crm-customers";
import { setTaskStatusAction } from "@/app/actions/crm-tasks";
import { ConfirmButton } from "@/components/form";

export default async function CustomerCard({ params }: PageProps<"/crm/customers/[id]">) {
  const me = await requireSection("customers");
  const { id } = await params;
  const c = await db.user.findUnique({
    where: { id },
    include: {
      orders: { orderBy: { createdAt: "desc" }, include: { items: true } },
      notes: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }], include: { assignee: { select: { firstName: true } } } },
      wishlist: { include: { product: true } },
      stockAlerts: { where: { variant: { archivedAt: null } }, include: { variant: { include: { product: true } } } },
      addresses: true,
      reviews: { include: { product: true } },
    },
  });
  if (!c || c.role !== "CUSTOMER") notFound();
  const staff = await db.user.findMany({ where: { id: { in: c.notes.flatMap((note) => note.createdBy ? [note.createdBy] : []) } }, select: { id: true, firstName: true } });
  const staffName = new Map(staff.map((member) => [member.id, member.firstName]));
  const paid = c.orders.filter((o) => ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"].includes(o.status));
  const last = paid[0]?.createdAt ?? null;
  const seg = rfmSegment({ lastOrderAt: last, ordersCount: paid.length, lifetimeSpent: c.lifetimeSpent, createdAt: c.createdAt });
  const sizes = new Map<string, number>();
  for (const o of paid) for (const i of o.items) sizes.set(i.size, (sizes.get(i.size) ?? 0) + i.quantity);
  const returnedQty = c.orders.flatMap((o) => o.items).reduce((s, i) => s + i.returnedQty, 0);
  const boughtQty = paid.flatMap((o) => o.items).reduce((s, i) => s + i.quantity, 0);
  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow={`Клиент с ${formatDate(c.createdAt)} · ${c.source ?? "источник не указан"}`}
        title={`${c.firstName} ${c.lastName ?? ""}`}
        actions={
          <>
            <Badge tone={seg.tone}>{seg.label}</Badge>
            {can(me.role, "ordersEdit") && <Link href={`/crm/orders/new?customer=${c.id}`} className="btn-primary btn-sm">Новый заказ</Link>}
          </>
        }
      >
        {c.email} · {c.phone ?? "без телефона"}{c.firstChannel && ` · пришла из: ${TRAFFIC_CHANNEL[c.firstChannel]}${c.firstSource ? ` (${c.firstSource}${c.firstCampaign ? `, ${c.firstCampaign}` : ""})` : ""}`} {c.birthday && `· ДР ${c.birthday.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`} · {c.marketingConsent ? "согласна на рассылки" : "без согласия на рассылки"}
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="LTV" value={formatMoney(c.lifetimeSpent)} hint={`за 12 мес. ${formatMoney(c.yearSpent)}`} />
        <Stat label="Заказов" value={paid.length} hint={paid.length ? `ср. чек ${formatMoney(Math.round(paid.reduce((s, o) => s + o.total, 0) / paid.length))}` : undefined} />
        <Stat label="Последний заказ" value={last ? `${daysSince(last)} дн.` : "—"} hint={last ? formatDate(last) : undefined} />
        <Stat label="Возвраты" value={boughtQty ? `${Math.round((returnedQty / boughtQty) * 100)}%` : "—"} hint={`размеры: ${[...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).join(", ") || c.preferredSize || "—"}`} />
      </div>
      <p className="text-xs text-muted">Рекомендация для сегмента: {seg.advice}</p>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <div className="card overflow-x-auto" tabIndex={0}>
            <div className="p-4 pb-0"><Eyebrow>Заказы</Eyebrow></div>
            <table className="table">
              <thead><tr><th>№</th><th>Дата</th><th>Состав</th><th>Статус</th><th className="text-right">Сумма</th></tr></thead>
              <tbody>
                {c.orders.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/crm/orders/${o.id}`} className="underline">{o.number}</Link></td>
                    <td className="whitespace-nowrap text-muted">{formatDate(o.createdAt)}</td>
                    <td className="max-w-sm truncate">{o.items.map((i) => `${i.productName} ${i.size}`).join(", ")}</td>
                    <td><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></td>
                    <td className="whitespace-nowrap text-right">{formatMoney(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.orders.length === 0 && <p className="p-4 text-sm text-muted">Заказов нет</p>}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="card p-5 text-sm">
              <Eyebrow>Избранное</Eyebrow>
              <ul className="mt-2 space-y-1">{c.wishlist.map((w) => <li key={w.productId}>{w.product.name}</li>)}{c.wishlist.length === 0 && <li className="text-muted">—</li>}</ul>
              <Eyebrow className="mt-5">Ждёт поступления</Eyebrow>
              <ul className="mt-2 space-y-1">{c.stockAlerts.map((a) => <li key={a.id}>{a.variant.product.name} · {a.variant.size} {a.variant.stock - a.variant.reserved > 0 && <Badge tone="success">в наличии</Badge>}</li>)}{c.stockAlerts.length === 0 && <li className="text-muted">—</li>}</ul>
            </div>
            <div className="card p-5 text-sm">
              <Eyebrow className="mt-5">Адреса</Eyebrow>
              <ul className="mt-2 space-y-1 text-muted">{c.addresses.map((a) => <li key={a.id}>{[a.city, a.street, a.building, a.apartment].filter(Boolean).join(", ")}</li>)}</ul>
              {c.reviews.length > 0 && (
                <>
                  <Eyebrow className="mt-5">Отзывы</Eyebrow>
                  <ul className="mt-2 space-y-1">{c.reviews.map((r) => <li key={r.id}>{"★".repeat(r.rating)} {r.product.name}</li>)}</ul>
                </>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="card space-y-3 p-5">
            <Eyebrow>Заметки стилиста и менеджера</Eyebrow>
            <form action={addNoteAction} className="space-y-2">
              <input type="hidden" name="userId" value={c.id} />
              <textarea name="text" rows={2} className="input" placeholder="Предпочтения, мерки, повод покупки…" />
              <SubmitButton className="btn-outline btn-sm">Добавить</SubmitButton>
            </form>
            <ul className="space-y-3 text-sm">
              {c.notes.map((n) => (
                <li key={n.id} className="border-l-2 border-champagne pl-3">
                  <p>{n.text}</p>
                  <div className="flex justify-between text-xs text-muted">
                    <span>{formatDate(n.createdAt)}{n.createdBy && staffName.get(n.createdBy) ? ` · ${staffName.get(n.createdBy)}` : ""}</span>
                    <form action={deleteNoteAction}><input type="hidden" name="id" value={n.id} /><button className="hover:text-danger">удалить</button></form>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card space-y-3 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <Eyebrow>Задачи</Eyebrow>
              <Link href="/crm/tasks" prefetch={false} className="text-xs underline">Доска</Link>
            </div>
            <TaskQuickForm customerId={c.id} />
            <ul className="space-y-2 text-sm">
              {c.tasks.map((t) => {
                const closed = t.status === "DONE" || t.status === "CANCELLED";
                const overdue = !closed && !!t.dueAt && t.dueAt < new Date();
                return (
                  <li key={t.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <PriorityDot priority={t.priority} />
                        <Link href={`/crm/tasks/${t.id}`} prefetch={false} className={`hover:underline ${closed ? "text-muted line-through" : ""}`}>{t.title}</Link>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 pl-4 text-xs text-muted">
                        <span className={overdue ? "text-danger" : ""}>{t.dueAt ? `${overdue ? "просрочена · " : ""}${formatDate(t.dueAt, true)}` : "без срока"}</span>
                        <span>· {t.assignee?.firstName ?? "не назначена"} ·</span>
                        <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>
                      </div>
                    </div>
                    {!closed && (
                      <form action={setTaskStatusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="DONE" /><button className="whitespace-nowrap text-xs text-success">готово</button></form>
                    )}
                  </li>
                );
              })}
              {c.tasks.length === 0 && <li className="text-xs text-muted">Задач по клиентке пока нет</li>}
            </ul>
          </div>
          {can(me.role, "customersEdit") && <div className="card space-y-3 p-5">
            {can(me.role, "customersEdit") && !c.anonymizedAt && (
              <form action={anonymizeCustomerAction}>
                <input type="hidden" name="userId" value={c.id} />
                <ConfirmButton className="text-xs text-danger underline" message="Обезличить клиента? Имя, контакты, мерки и адреса будут стёрты, заказы останутся. Действие необратимо.">Обезличить по запросу клиента</ConfirmButton>
              </form>
            )}
          </div>}
          {can(me.role, "customersEdit") && <div className="card p-5">
            <Eyebrow>Профиль</Eyebrow>
            <div className="mt-3">
              <CustomerEditForm c={{ id: c.id, tags: c.tags, source: c.source, preferredSize: c.preferredSize, phone: c.phone, birthday: c.birthday?.toISOString().slice(0, 10) ?? null }} />
            </div>
          </div>}
        </aside>
      </div>
    </div>
  );
}
