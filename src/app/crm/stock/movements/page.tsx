import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/money";
import { STOCK_MOVEMENT } from "@/lib/labels";
import { Badge, PageTitle } from "@/components/ui";
import { Pager, qs, str } from "@/components/crm/pager";
import type { StockMovementType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Журнал движений" };
const PER = 50;

export default async function Movements({ searchParams }: PageProps<"/crm/stock/movements">) {
  await requireSection("stock");
  const sp = await searchParams;
  const type = str(sp.type) as StockMovementType | undefined;
  const q = str(sp.q);
  const page = Math.max(1, Number(str(sp.page) ?? 1));
  const where = {
    ...(type ? { type } : { type: { notIn: ["RESERVE", "RELEASE"] as StockMovementType[] } }),
    ...(q ? { variant: { OR: [{ sku: { contains: q, mode: "insensitive" as const } }, { product: { name: { contains: q, mode: "insensitive" as const } } }] } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.stockMovement.findMany({ where, include: { variant: { include: { product: true } }, order: { select: { id: true, number: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER }),
    db.stockMovement.count({ where }),
  ]);
  const staffIds = [...new Set(rows.map((r) => r.createdBy).filter((x): x is string => !!x))];
  const staff = new Map((await db.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, firstName: true } })).map((u) => [u.id, u.firstName]));
  return (
    <div>
      <PageTitle title="Журнал движений" actions={<Link href="/crm/stock" className="btn-ghost btn-sm">← Склад</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={qs("/crm/stock/movements", { q })} className={`badge ${!type ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>Все, кроме резервов</Link>
        {(Object.keys(STOCK_MOVEMENT) as StockMovementType[]).map((t) => (
          <Link key={t} href={qs("/crm/stock/movements", { q, type: t })} className={`badge ${type === t ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>{STOCK_MOVEMENT[t].label}</Link>
        ))}
        <form className="ml-auto">{type && <input type="hidden" name="type" value={type} />}<input name="q" defaultValue={q} placeholder="Артикул или товар" className="input w-60 py-2" /></form>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Дата</th><th>Операция</th><th>Товар</th><th className="text-right">Кол-во</th><th className="text-right">Себест. ед.</th><th>Основание</th><th>Сотрудник</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-muted">{formatDate(m.createdAt, true)}</td>
                <td><Badge tone={STOCK_MOVEMENT[m.type].tone}>{STOCK_MOVEMENT[m.type].label}</Badge></td>
                <td>{m.variant.product.name} · {m.variant.size}<div className="text-xs text-muted">{m.variant.sku}</div></td>
                <td className={`text-right ${m.quantity > 0 ? "text-success" : m.quantity < 0 ? "text-danger" : ""}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td>
                <td className="text-right text-muted">{m.unitCost ? formatMoney(m.unitCost) : "—"}</td>
                <td>{m.order ? <Link href={`/crm/orders/${m.order.id}`} className="underline">Заказ №{m.order.number}</Link> : m.reason ?? "—"}</td>
                <td className="text-muted">{m.createdBy ? staff.get(m.createdBy) ?? "—" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={Math.ceil(total / PER)} href={(p) => qs("/crm/stock/movements", { type, q, page: p })} />
    </div>
  );
}
