import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/money";
import { RESALE_STATUS } from "@/lib/labels";
import { Badge, Empty, PageTitle } from "@/components/ui";
import { qs, str } from "@/components/crm/pager";
import type { ResaleStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Выкуп и pre-loved" };

const STATUSES = Object.keys(RESALE_STATUS) as ResaleStatus[];

export default async function ResaleList({ searchParams }: PageProps<"/crm/resale">) {
  await requireSection("resale");
  const sp = await searchParams;
  const status = str(sp.status);
  const filter = status && STATUSES.includes(status as ResaleStatus) ? (status as ResaleStatus) : undefined;
  const [requests, counts] = await Promise.all([
    db.resaleRequest.findMany({
      where: filter ? { status: filter } : { status: { notIn: ["SOLD", "DECLINED", "CANCELLED"] } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        orderItem: { select: { productName: true, size: true, color: true, price: true } },
        product: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.resaleRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = new Map(counts.map((c) => [c.status, c._count._all]));
  return (
    <div>
      <PageTitle title="Выкуп и pre-loved" actions={<Link href="/preloved" target="_blank" className="btn-outline btn-sm">Витрина pre-loved</Link>}>
        Клиентки предлагают свои вещи, бренд выкупает их за баллы Circle и выставляет на витрину. Без фильтра — заявки в работе.
      </PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/crm/resale" className={`badge ${!filter ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>В работе</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={qs("/crm/resale", { status: s })} className={`badge ${filter === s ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>
            {RESALE_STATUS[s].label}{count.get(s) ? ` · ${count.get(s)}` : ""}
          </Link>
        ))}
      </div>
      {requests.length === 0 ? (
        <Empty title="Заявок нет" />
      ) : (
        <div className="card overflow-x-auto" tabIndex={0}>
          <table className="table">
            <thead>
              <tr><th>Дата</th><th>Клиентка</th><th>Вещь</th><th>Состояние</th><th className="text-right">Цена покупки</th><th className="text-right">Предложение</th><th>Статус</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-muted">{formatDate(r.createdAt)}</td>
                  <td><Link href={`/crm/customers/${r.user.id}`} className="underline">{r.user.firstName} {r.user.lastName}</Link></td>
                  <td><Link href={`/crm/resale/${r.id}`} className="underline">{r.orderItem?.productName ?? r.product?.name ?? "—"}</Link>{r.orderItem && <span className="text-muted"> · {r.orderItem.size}{r.orderItem.color ? `, ${r.orderItem.color}` : ""}</span>}</td>
                  <td className="text-muted">{r.condition ?? "—"}</td>
                  <td className="whitespace-nowrap text-right">{r.orderItem ? formatMoney(r.orderItem.price) : "—"}</td>
                  <td className="whitespace-nowrap text-right">{r.offerPoints != null ? `${r.offerPoints.toLocaleString("ru-RU")} б.` : "—"}</td>
                  <td><Badge tone={RESALE_STATUS[r.status].tone}>{RESALE_STATUS[r.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
