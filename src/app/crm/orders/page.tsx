import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/money";
import { DELIVERY_METHOD, ORDER_STATUS } from "@/lib/labels";
import { Badge, PageTitle } from "@/components/ui";
import { Pager, qs, str } from "@/components/crm/pager";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Заказы" };
const PER = 30;

export default async function CrmOrders({ searchParams }: PageProps<"/crm/orders">) {
  const me = await requireSection("orders");
  const sp = await searchParams;
  const status = str(sp.status) as OrderStatus | undefined;
  const q = str(sp.q);
  const page = Math.max(1, Number(str(sp.page) ?? 1));
  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            ...(Number.isFinite(Number(q)) ? [{ number: Number(q) }] : []),
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { trackingNumber: { contains: q } },
          ],
        }
      : {}),
  };
  const [orders, total, counts] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { items: { select: { quantity: true } }, user: { select: { loyaltyTier: { select: { name: true } } } } } }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const countBy = new Map(counts.map((c) => [c.status, c._count]));
  return (
    <div>
      <PageTitle title="Заказы" actions={me.role !== "SUPPORT" ? <Link href="/crm/orders/new" className="btn-primary btn-sm">Продажа в шоуруме</Link> : undefined} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={qs("/crm/orders", { q })} className={`badge ${!status ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>Все</Link>
        {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => (
          <Link key={s} href={qs("/crm/orders", { status: s, q })} className={`badge ${status === s ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>
            {ORDER_STATUS[s].label} · {countBy.get(s) ?? 0}
          </Link>
        ))}
        <form className="ml-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="№, имя, email, телефон, трек" className="input w-72 py-2" />
        </form>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Уровень</th><th>Шт.</th><th>Доставка</th><th>Статус</th><th className="text-right">Сумма</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/crm/orders/${o.id}`} className="underline underline-offset-4">{o.number}</Link></td>
                <td className="whitespace-nowrap text-muted">{formatDate(o.createdAt, true)}</td>
                <td>{o.firstName} {o.lastName}<div className="text-xs text-muted">{o.phone}</div></td>
                <td className="text-muted">{o.user?.loyaltyTier?.name ?? "—"}</td>
                <td>{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                <td className="text-muted">{DELIVERY_METHOD[o.deliveryMethod].label}</td>
                <td><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></td>
                <td className="whitespace-nowrap text-right">{formatMoney(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <p className="p-6 text-center text-sm text-muted">Заказов не найдено</p>}
      </div>
      <Pager page={page} pages={Math.ceil(total / PER)} href={(p) => qs("/crm/orders", { status, q, page: p })} />
    </div>
  );
}
