import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { Eyebrow, PageTitle } from "@/components/ui";
import { ProductForm, VariantForm } from "@/components/crm/catalog-forms";
import { SubmitButton } from "@/components/form";
import { updateVariantAction } from "@/app/actions/crm-catalog";
import { ImageUpload } from "@/components/crm/image-upload";
import { moveProductImageAction, removeProductImageAction } from "@/app/actions/crm-upload";
import Image from "next/image";

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
      <div className="card p-5">
        <Eyebrow>Фотографии</Eyebrow>
        <p className="mt-1 text-xs text-muted">Первая — главная в каталоге, вторая показывается при наведении. Рекомендуем 3:4, от 1600 px по высоте, JPG до 12 МБ.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {p.images.map((img, i) => (
            <div key={img.id} className="w-28">
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-sand"><Image src={img.url} alt="" fill unoptimized className="object-cover" /></div>
              <div className="mt-1 flex justify-between text-[0.65rem] text-muted">
                <form action={moveProductImageAction}><input type="hidden" name="id" value={img.id} /><input type="hidden" name="dir" value="up" /><button disabled={i === 0} className="disabled:opacity-30">←</button></form>
                <form action={removeProductImageAction}><input type="hidden" name="id" value={img.id} /><button className="hover:text-danger">удалить</button></form>
                <form action={moveProductImageAction}><input type="hidden" name="id" value={img.id} /><input type="hidden" name="dir" value="down" /><button disabled={i === p.images.length - 1} className="disabled:opacity-30">→</button></form>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4"><ImageUpload productId={p.id} /></div>
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
                  <form action={updateVariantAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={v.id} />
                    <input name="price" defaultValue={v.price ? v.price / 100 : ""} placeholder={formatMoney(p.price)} className="min-h-9 w-28 border border-line px-2 py-1 text-xs" />
                    <input name="barcode" defaultValue={v.barcode ?? ""} placeholder="штрихкод" className="min-h-9 w-32 border border-line px-2 py-1 text-xs" />
                    <input name="colorHex" defaultValue={v.colorHex ?? ""} placeholder="#hex" className="min-h-9 w-20 border border-line px-2 py-1 text-xs" />
                    <SubmitButton className="min-h-9 px-2 text-xs underline">ок</SubmitButton>
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
