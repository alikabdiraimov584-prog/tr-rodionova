import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { Eyebrow } from "@/components/ui";
import { LookCart } from "@/components/shop/look-cart";

async function load(slug: string) {
  return db.look.findUnique({
    where: { slug },
    include: {
      items: {
        orderBy: { order: "asc" },
        include: { product: { include: { images: { orderBy: { order: "asc" }, take: 1 }, variants: { orderBy: { sku: "asc" } } } } },
      },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/lookbook/[slug]">): Promise<Metadata> {
  const look = await load((await params).slug);
  return { title: look ? `Образ «${look.title}»` : "Образ", description: look?.description ?? undefined };
}

export default async function LookPage({ params }: PageProps<"/lookbook/[slug]">) {
  const { slug } = await params;
  const look = await load(slug);
  if (!look || !look.isPublished) notFound();
  const user = await getCurrentCustomer();
  const items = look.items.filter((i) => i.product.status === "ACTIVE");
  const total = items.reduce((s, i) => s + i.product.price, 0);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
      <nav className="mb-6 text-[0.65rem] uppercase tracking-[0.2em] text-muted">
        <Link href="/lookbook">Лукбук</Link> / {look.title}
      </nav>
      <div className="grid gap-10 md:grid-cols-[1.2fr_1fr]">
        <div className="relative aspect-[3/4] bg-sand">
          {(look.coverUrl ?? look.items[0]?.product.images[0]?.url) && <Image src={look.coverUrl ?? look.items[0]!.product.images[0]!.url} alt={look.title} fill priority sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />}
        </div>
        <div className="md:sticky md:top-32 md:self-start">
          {look.season && <Eyebrow>{look.season}</Eyebrow>}
          <h1 className="mt-2">{look.title}</h1>
          {look.description && <p className="mt-4 text-sm leading-relaxed text-ink/80">{look.description}</p>}
          <div className="mt-2 text-xs text-muted">
            {items.length} {items.length === 1 ? "вещь" : items.length < 5 ? "вещи" : "вещей"} · весь образ {formatMoney(total)}
          </div>
          <div className="mt-8">
            {items.length === 0 ? (
              <p className="text-sm text-muted">Вещи этого образа сейчас недоступны.</p>
            ) : (
              <LookCart
                slug={look.slug}
                loggedIn={!!user}
                items={items.map((i) => ({
                  productId: i.productId,
                  slug: i.product.slug,
                  name: i.product.name,
                  price: i.product.price,
                  image: i.product.images[0]?.url ?? null,
                  note: i.note,
                  variants: i.product.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, available: v.stock - v.reserved })),
                }))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
