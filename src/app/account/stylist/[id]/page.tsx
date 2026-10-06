import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { Eyebrow, PageTitle } from "@/components/ui";
import { AddAllButton, SelectionItemCart, type CartItem } from "@/components/account/selection-cart";

export const metadata: Metadata = { title: "Подборка стилиста" };

export default async function SelectionView({ params }: PageProps<"/account/stylist/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/account/stylist/${id}`);
  const s = await db.selection.findFirst({
    where: { id, userId: user.id, status: { in: ["SENT", "VIEWED"] } },
    include: {
      stylist: { select: { firstName: true } },
      items: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { product: { include: { images: { orderBy: { order: "asc" }, take: 1 }, variants: true } } } },
    },
  });
  if (!s) notFound();
  if (s.status === "SENT") {
    await db.selection.update({ where: { id: s.id }, data: { status: "VIEWED", viewedAt: new Date() } });
  }
  const items = s.items.filter((it) => it.product.status === "ACTIVE");
  const cartItems: CartItem[] = items.map((it) => ({
    slug: it.product.slug,
    name: it.product.name,
    recommendedId: it.variantId,
    variants: it.product.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, available: v.stock - v.reserved })),
  }));
  return (
    <div className="space-y-10">
      <PageTitle eyebrow={`${s.stylist?.firstName ? `Стилист ${s.stylist.firstName} · ` : ""}${formatDate(s.sentAt ?? s.createdAt)}`} title={s.title} actions={<Link href="/account/support?topic=stylist" className="btn-outline btn-sm">Записаться к стилисту</Link>}>
        <Link href="/account/stylist" className="underline">← Все подборки</Link>
      </PageTitle>
      {s.note && (
        <div className="border-l-2 border-champagne pl-4 text-sm">
          <Eyebrow>Записка стилиста</Eyebrow>
          <p className="mt-2 whitespace-pre-wrap">{s.note}</p>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted">Вещи из этой подборки уже разобрали. Напишите стилисту — соберём новую.</p>
      ) : (
        <>
          <div className="divide-y divide-line border-y border-line">
            {items.map((it, idx) => {
              const img = it.product.images[0];
              const v = it.product.variants.find((x) => x.id === it.variantId);
              return (
                <div key={it.id} className="grid gap-5 py-6 sm:grid-cols-[120px_1fr]">
                  <Link href={`/product/${it.product.slug}`} className="relative block aspect-[4/5] bg-sand">
                    {img && <Image src={img.url} alt={img.alt ?? it.product.name} fill sizes="120px" className="object-cover" />}
                  </Link>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="eyebrow">{String(idx + 1).padStart(2, "0")}</div>
                        <Link href={`/product/${it.product.slug}`} className="text-lg">{it.product.name}</Link>
                        <div className="text-sm text-muted">
                          {formatMoney(it.product.price)}
                          {v && <> · рекомендуемый размер <span className="text-ink">{v.size}</span>{v.color ? `, ${v.color}` : ""}</>}
                        </div>
                      </div>
                    </div>
                    {it.comment && <p className="max-w-xl text-sm">{it.comment}</p>}
                    <SelectionItemCart item={cartItems[idx]} />
                  </div>
                </div>
              );
            })}
          </div>
          <AddAllButton items={cartItems} />
        </>
      )}
    </div>
  );
}
