import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { PRODUCT_STATUS } from "@/lib/labels";
import { Badge, PageTitle } from "@/components/ui";
import { str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Товары" };

export default async function Products({ searchParams }: PageProps<"/crm/products">) {
  await requireSection("products");
  const sp = await searchParams;
  const q = str(sp.q);
  const products = await db.product.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {},
    include: { category: true, variants: true, images: { take: 1, orderBy: { order: "asc" } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const sold = await db.$queryRaw<{ productId: string; qty: bigint }[]>`
    SELECT v."productId", sum(i.quantity - i."returnedQty")::bigint AS qty FROM "OrderItem" i
    JOIN "ProductVariant" v ON v.id = i."variantId" JOIN "Order" o ON o.id = i."orderId"
    WHERE o.status IN ('PAID','CONFIRMED','PACKING','SHIPPED','DELIVERED','COMPLETED') AND o."createdAt" > now() - interval '90 days'
    GROUP BY 1`;
  const soldBy = new Map(sold.map((s) => [s.productId, Number(s.qty)]));
  return (
    <div>
      <PageTitle title="Товары" actions={<><Link href="/crm/products/categories" className="btn-outline btn-sm">Категории и SEO</Link><Link href="/crm/products/new" className="btn-primary btn-sm">Новый товар</Link></>}>{products.length} моделей</PageTitle>
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Название или артикул" className="input w-72 py-2" /></form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Модель</th><th>Артикул</th><th>Категория</th><th>Статус</th><th className="text-right">Цена</th><th className="text-right">Маржа</th><th className="text-right">Остаток</th><th className="text-right">Продано, 90 дн.</th></tr></thead>
          <tbody>
            {products.map((p) => {
              const stock = p.variants.reduce((s, v) => s + v.stock - v.reserved, 0);
              const margin = p.costPrice ? Math.round(((p.price - p.costPrice) / p.price) * 100) : null;
              return (
                <tr key={p.id}>
                  <td><Link href={`/crm/products/${p.id}`} className="underline underline-offset-4">{p.name}</Link>{p.isNew && <span className="ml-2 text-[0.6rem] uppercase text-taupe-dark">new</span>}</td>
                  <td className="text-muted">{p.sku}</td>
                  <td className="text-muted">{p.category?.name ?? "—"}</td>
                  <td><Badge tone={PRODUCT_STATUS[p.status].tone}>{PRODUCT_STATUS[p.status].label}</Badge></td>
                  <td className="whitespace-nowrap text-right">{formatMoney(p.price)}</td>
                  <td className="text-right text-muted">{margin !== null ? `${margin}%` : "—"}</td>
                  <td className={`text-right ${stock <= 2 ? "text-warning" : ""}`}>{stock} <span className="text-xs text-muted">/ {p.variants.length} вар.</span></td>
                  <td className="text-right">{soldBy.get(p.id) ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
