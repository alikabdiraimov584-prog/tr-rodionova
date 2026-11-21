import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { PRODUCT_STATUS } from "@/lib/labels";
import { Badge, PageTitle } from "@/components/ui";
import { str } from "@/components/crm/pager";
import { toggleProductAction } from "@/app/actions/crm-catalog";

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
      <PageTitle title="Товары" actions={<><Link href="/crm/products/categories" className="btn-outline btn-sm">Категории</Link><Link href="/crm/products/new" className="btn-primary btn-sm">Новый товар</Link></>}>{products.length} моделей · на сайте {products.filter((p) => p.status === "ACTIVE").length}</PageTitle>
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Название или артикул" className="input w-full py-2 sm:w-72" /></form>
      <div className="card overflow-x-auto" tabIndex={0}>
        <table className="table">
          <thead><tr><th>Модель</th><th>Артикул</th><th>Категория</th><th>Статус</th><th>На сайте</th><th className="text-right">Цена</th><th className="text-right">Маржа</th><th className="text-right">Остаток</th><th className="text-right">Продано, 90 дн.</th></tr></thead>
          <tbody>
            {products.map((p) => {
              const stock = p.variants.reduce((s, v) => s + v.stock - v.reserved, 0);
              const margin = p.costPrice ? Math.round(((p.price - p.costPrice) / p.price) * 100) : null;
              return (
                <tr key={p.id}>
                  <td><Link href={`/crm/products/${p.id}`} prefetch={false} className="underline underline-offset-4">{p.name}</Link>{p.isNew && <span className="ml-2 text-[0.6rem] uppercase text-taupe-dark">new</span>}{p.isPreorder && <span className="ml-2 text-[0.6rem] uppercase text-warning">предзаказ</span>}</td>
                  <td className="text-muted">{p.sku}</td>
                  <td className="text-muted">{p.category ? `${p.category.name}${p.category.isActive ? "" : " (скрыта)"}` : "—"}</td>
                  <td className="whitespace-nowrap">{p.hiddenWithCategory ? <Badge tone="warning">скрыта с категорией</Badge> : <Badge tone={PRODUCT_STATUS[p.status].tone}>{PRODUCT_STATUS[p.status].label}</Badge>}</td>
                  <td>
                    {/* переключатель: включённая вещь «в продаже», выключенная — черновик; из скрытой категории не включается */}
                    {p.category && !p.category.isActive ? (
                      <span className="text-xs text-muted" title="Включите категорию в разделе «Категории»">категория скрыта</span>
                    ) : (
                      <form action={toggleProductAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="show" value={p.status === "ACTIVE" ? "0" : "1"} />
                        <button role="switch" aria-checked={p.status === "ACTIVE"} aria-label={`${p.name} на сайте`} title={p.status === "ACTIVE" ? "Снять с сайта" : "Показать на сайте"} className="flex min-h-9 items-center gap-2">
                          <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${p.status === "ACTIVE" ? "bg-success" : "bg-line"}`}>
                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${p.status === "ACTIVE" ? "left-[18px]" : "left-0.5"}`} />
                          </span>
                          <span className="text-xs text-muted">{p.status === "ACTIVE" ? "вкл" : "выкл"}</span>
                        </button>
                      </form>
                    )}
                  </td>
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
