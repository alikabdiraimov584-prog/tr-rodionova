import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { Eyebrow, PageTitle } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/form";
import { LookForm, LookItemAddForm } from "@/components/crm/content-forms";
import { deleteLookAction, removeLookItemAction, updateLookItemAction } from "@/app/actions/crm-content";

export const metadata: Metadata = { title: "Образ" };

async function covers() {
  const imgs = await db.productImage.findMany({ select: { url: true }, distinct: ["url"], orderBy: { url: "asc" } });
  return imgs.map((i) => i.url);
}

export default async function LookEdit({ params }: PageProps<"/crm/content/looks/[id]">) {
  await requireSection("content");
  const { id } = await params;
  if (id === "new") {
    return (
      <div className="max-w-5xl">
        <PageTitle title="Новый образ">После создания добавьте вещи — они покажутся на странице образа в заданном порядке.</PageTitle>
        <div className="card p-6"><LookForm covers={await covers()} /></div>
      </div>
    );
  }
  const [look, products, coverList] = await Promise.all([
    db.look.findUnique({
      where: { id },
      include: { items: { orderBy: { order: "asc" }, include: { product: { include: { images: { orderBy: { order: "asc" }, take: 1 } } } } } },
    }),
    db.product.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true } }),
    covers(),
  ]);
  if (!look) notFound();
  const inLook = new Set(look.items.map((i) => i.productId));
  const total = look.items.reduce((s, i) => s + i.product.price, 0);
  return (
    <div className="max-w-5xl space-y-6">
      <PageTitle
        eyebrow={look.season ?? "Образ"}
        title={look.title}
        actions={
          <>
            <Link href="/crm/content?tab=looks" className="btn-ghost btn-sm">← Все образы</Link>
            {look.isPublished && <Link href={`/lookbook/${look.slug}`} target="_blank" className="btn-ghost btn-sm">На сайте ↗</Link>}
          </>
        }
      />
      <div className="card p-6"><LookForm look={look} covers={coverList} /></div>
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between p-5 pb-2">
          <Eyebrow>Состав образа · {look.items.length} вещей · {formatMoney(total)}</Eyebrow>
        </div>
        <table className="table">
          <thead><tr><th /><th>Товар</th><th className="text-right">Цена</th><th>Порядок / заметка</th><th /></tr></thead>
          <tbody>
            {look.items.map((it) => (
              <tr key={it.id}>
                <td className="w-12">
                  <div className="relative h-14 w-11 bg-sand">
                    {it.product.images[0] && <Image src={it.product.images[0].url} alt={it.product.name} fill unoptimized sizes="44px" className="object-cover" />}
                  </div>
                </td>
                <td>
                  <Link href={`/crm/products/${it.productId}`} className="underline underline-offset-4">{it.product.name}</Link>
                  <div className="text-xs text-muted">{it.product.sku}{it.product.status !== "ACTIVE" ? " · не в продаже" : ""}</div>
                </td>
                <td className="whitespace-nowrap text-right">{formatMoney(it.product.price)}</td>
                <td>
                  <form action={updateLookItemAction} className="flex gap-2">
                    <input type="hidden" name="id" value={it.id} />
                    <input name="order" type="number" min={0} defaultValue={it.order} className="w-16 border border-line px-2 py-1 text-xs" />
                    <input name="note" defaultValue={it.note ?? ""} placeholder="заметка" className="w-56 border border-line px-2 py-1 text-xs" />
                    <SubmitButton className="text-xs underline">ок</SubmitButton>
                  </form>
                </td>
                <td className="text-right">
                  <form action={removeLookItemAction}>
                    <input type="hidden" name="id" value={it.id} />
                    <ConfirmButton className="text-xs text-danger underline" message="Убрать вещь из образа?">убрать</ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
            {look.items.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-sm text-muted">В образе пока нет вещей</td></tr>}
          </tbody>
        </table>
        <div className="border-t border-line p-5"><LookItemAddForm lookId={look.id} products={products.filter((p) => !inLook.has(p.id))} /></div>
      </div>
      <form action={deleteLookAction} className="flex justify-end">
        <input type="hidden" name="id" value={look.id} />
        <ConfirmButton className="text-xs text-danger underline" message="Удалить образ целиком? Это действие нельзя отменить.">Удалить образ</ConfirmButton>
      </form>
    </div>
  );
}
