import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { Eyebrow, PageTitle } from "@/components/ui";
import { ProductForm, VariantForm } from "@/components/crm/catalog-forms";
import { SubmitButton } from "@/components/form";
import { updateVariantAction } from "@/app/actions/crm-catalog";

export default async function ProductEdit({ params }: PageProps<"/crm/products/[id]">) {
  await requireSection("products");
  const { id } = await params;
  const [p, categories, collections] = await Promise.all([
    db.product.findUnique({ where: { id }, include: { images: { orderBy: { order: "asc" } }, variants: { orderBy: { sku: "asc" }, include: { _count: { select: { alerts: { where: { notifiedAt: null } } } } } } } }),
    db.category.findMany({ orderBy: { order: "asc" } }),
    db.collection.findMany(),
  ]);
  if (!p) notFound();
  return (
    <div className="space-y-6">
      <PageTitle eyebrow={p.sku} title={p.name} actions={<Link href={`/product/${p.slug}`} target="_blank" className="btn-ghost btn-sm">На сайте ↗</Link>} />
      <div className="card p-6">
        <ProductForm
          categories={categories}
          collections={collections}
          p={{ ...p, images: p.images.map((i) => i.url) }}
        />
      </div>
      <div className="card overflow-x-auto">
        <div className="p-5 pb-2"><Eyebrow>Варианты (размер × цвет)</Eyebrow></div>
        <table className="table">
          <thead><tr><th>Артикул</th><th>Размер</th><th>Цвет</th><th className="text-right">Остаток</th><th className="text-right">Резерв</th><th className="text-right">Ждут</th><th>Цена / штрихкод / цвет</th></tr></thead>
          <tbody>
            {p.variants.map((v) => (
              <tr key={v.id}>
                <td className="text-muted">{v.sku}</td>
                <td>{v.size}</td>
                <td><span className="mr-2 inline-block h-3 w-3 rounded-full border border-line align-middle" style={{ background: v.colorHex ?? undefined }} />{v.color}</td>
                <td className="text-right">{v.stock}</td>
                <td className="text-right text-muted">{v.reserved}</td>
                <td className="text-right">{v._count.alerts || "—"}</td>
                <td>
                  <form action={updateVariantAction} className="flex gap-2">
                    <input type="hidden" name="id" value={v.id} />
                    <input name="price" defaultValue={v.price ? v.price / 100 : ""} placeholder={formatMoney(p.price)} className="w-28 border border-line px-2 py-1 text-xs" />
                    <input name="barcode" defaultValue={v.barcode ?? ""} placeholder="штрихкод" className="w-32 border border-line px-2 py-1 text-xs" />
                    <input name="colorHex" defaultValue={v.colorHex ?? ""} placeholder="#hex" className="w-20 border border-line px-2 py-1 text-xs" />
                    <SubmitButton className="text-xs underline">ок</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line p-5"><VariantForm productId={p.id} /></div>
        <p className="px-5 pb-5 text-xs text-muted">Остатки меняются только через <Link href={`/crm/stock?q=${p.sku}`} className="underline">склад</Link> — так каждое движение остаётся в журнале.</p>
      </div>
    </div>
  );
}
