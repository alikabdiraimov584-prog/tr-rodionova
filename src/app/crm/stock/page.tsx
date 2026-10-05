import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { PageTitle, Stat } from "@/components/ui";
import { StockOperationForm } from "@/components/crm/catalog-forms";
import { qs, str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Склад" };

export default async function Stock({ searchParams }: PageProps<"/crm/stock">) {
  await requireSection("stock");
  const sp = await searchParams;
  const q = str(sp.q);
  const low = str(sp.low) === "1";
  const preset = str(sp.variant);
  const variants = await db.productVariant.findMany({
    where: {
      product: { status: { not: "ARCHIVED" } },
      ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }, { barcode: q }] } : {}),
    },
    include: { product: { include: { category: true } }, _count: { select: { alerts: { where: { notifiedAt: null } } } } },
    orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
  });
  const sales = await db.$queryRaw<{ variantId: string; qty: bigint }[]>`
    SELECT i."variantId", sum(i.quantity - i."returnedQty")::bigint AS qty FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
    WHERE o.status IN ('PAID','CONFIRMED','PACKING','SHIPPED','DELIVERED','COMPLETED') AND o."createdAt" > now() - interval '30 days' GROUP BY 1`;
  const sold30 = new Map(sales.map((s) => [s.variantId, Number(s.qty)]));
  const rows = variants.filter((v) => !low || v.stock - v.reserved <= 1);
  const totalUnits = variants.reduce((s, v) => s + v.stock, 0);
  const atCost = variants.reduce((s, v) => s + v.stock * (v.product.costPrice ?? 0), 0);
  const atRetail = variants.reduce((s, v) => s + v.stock * (v.price ?? v.product.price), 0);
  const reserved = variants.reduce((s, v) => s + v.reserved, 0);
  const waiting = variants.reduce((s, v) => s + v._count.alerts, 0);
  const all = await db.productVariant.findMany({ include: { product: true }, orderBy: [{ product: { name: "asc" } }, { sku: "asc" }] });
  return (
    <div className="space-y-6">
      <PageTitle title="Склад" actions={<Link href="/crm/stock/movements" className="btn-outline btn-sm">Журнал движений</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Единиц на складе" value={totalUnits} hint={`в резерве ${reserved}`} />
        <Stat label="Стоимость по себестоимости" value={formatMoney(atCost)} />
        <Stat label="Стоимость в розничных ценах" value={formatMoney(atRetail)} />
        <Stat label="Нет в наличии" value={variants.filter((v) => v.stock - v.reserved <= 0).length} hint="вариантов" tone="danger" />
        <Stat label="Ждут поступления" value={waiting} hint="подписок в листе ожидания" />
      </div>
      <div className="card p-5">
        <div className="eyebrow mb-3">Операция</div>
        <StockOperationForm key={preset} preset={preset} variants={all.map((v) => ({ id: v.id, label: `${v.product.name} · ${v.color ?? ""} · ${v.size} · ${v.sku} · ост. ${v.stock - v.reserved}` }))} />
      </div>
      <div className="flex flex-wrap gap-2">
        <form className="flex w-full gap-2 sm:w-auto">
          <input name="q" defaultValue={q} placeholder="Артикул, название, штрихкод" className="input w-full py-2 sm:w-72" />
          {low && <input type="hidden" name="low" value="1" />}
        </form>
        <Link href={qs("/crm/stock", { q, low: low ? undefined : 1 })} className={`badge ${low ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>Заканчивается (≤ 1)</Link>
      </div>
      <div className="card overflow-x-auto" tabIndex={0}>
        <table className="table">
          <thead><tr><th>Товар</th><th>Артикул</th><th>Размер</th><th className="text-right">На складе</th><th className="text-right">Резерв</th><th className="text-right">Свободно</th><th className="text-right">Продано 30 дн.</th><th className="text-right">Ждут</th><th className="text-right">Себест. остатка</th><th /></tr></thead>
          <tbody>
            {rows.map((v) => {
              const free = v.stock - v.reserved;
              const s30 = sold30.get(v.id) ?? 0;
              const cover = s30 ? Math.floor((free / s30) * 30) : null;
              return (
                <tr key={v.id}>
                  <td>{v.product.name}<div className="text-xs text-muted">{v.color}</div></td>
                  <td className="text-muted">{v.sku}</td>
                  <td>{v.size}</td>
                  <td className="text-right">{v.stock}</td>
                  <td className="text-right text-muted">{v.reserved || "—"}</td>
                  <td className={`text-right ${free <= 0 ? "text-danger" : free <= 1 ? "text-warning" : ""}`}>{free}</td>
                  <td className="text-right">{s30 || "—"}{cover !== null && <div className="text-[0.65rem] text-muted">хватит на ~{cover} дн.</div>}</td>
                  <td className="text-right">{v._count.alerts || "—"}</td>
                  <td className="whitespace-nowrap text-right text-muted">{formatMoney(v.stock * (v.product.costPrice ?? 0))}</td>
                  <td><Link href={qs("/crm/stock", { q, low: low ? 1 : undefined, variant: v.id })} className="text-xs underline">операция</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
