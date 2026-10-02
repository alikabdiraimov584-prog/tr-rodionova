import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/money";
import { AddToCart } from "@/components/shop/add-to-cart";
import { ProductCard } from "@/components/shop/product-card";
import { Eyebrow, Star } from "@/components/ui";
import { toggleWishlistAction } from "@/app/actions/shop";

async function load(slug: string) {
  return db.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { order: "asc" } },
      variants: { orderBy: { sku: "asc" } },
      category: true,
      reviews: { where: { isPublic: true }, include: { user: { select: { firstName: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const p = await load((await params).slug);
  return { title: p?.name ?? "Товар", description: p?.description ?? undefined };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p || p.status !== "ACTIVE") notFound();
  const user = await getCurrentUser();
  const [inWishlist, tier, related] = await Promise.all([
    user ? db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId: p.id } } }) : null,
    user?.loyaltyTier ?? db.loyaltyTier.findFirst({ orderBy: { threshold: "asc" } }),
    db.product.findMany({
      where: { status: "ACTIVE", categoryId: p.categoryId, id: { not: p.id } },
      include: { images: { orderBy: { order: "asc" } }, variants: true },
      take: 4,
    }),
  ]);
  const pts = Math.floor((p.price * (tier?.cashbackPct ?? 3)) / 100 / 100);
  const rating = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : null;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
      <nav className="mb-6 text-[0.65rem] uppercase tracking-[0.2em] text-muted">
        <Link href="/catalog">Каталог</Link>
        {p.category && <> / <Link href={`/catalog?category=${p.category.slug}`}>{p.category.name}</Link></>}
      </nav>
      <div className="grid gap-10 md:grid-cols-[1.3fr_1fr]">
        <div className="grid grid-cols-2 gap-2">
          {p.images.map((img, i) => (
            <div key={img.id} className={`relative aspect-[4/5] bg-sand ${i === 0 ? "col-span-2" : ""}`}>
              <Image src={img.url} alt={img.alt ?? p.name} fill unoptimized priority={i === 0} sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />
            </div>
          ))}
        </div>
        <div className="md:sticky md:top-32 md:self-start">
          <Eyebrow>{p.sku}</Eyebrow>
          <h1 className="mt-2 text-4xl">{p.name}</h1>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-xl">{formatMoney(p.price)}</span>
            {p.compareAt && <span className="text-sm text-muted line-through">{formatMoney(p.compareAt)}</span>}
          </div>
          <div className="mt-2 text-xs text-taupe-dark">
            <Star /> +{pts.toLocaleString("ru-RU")} баллов Circle {tier ? `(уровень ${tier.name}, ${tier.cashbackPct}%)` : ""}
          </div>
          {rating && <div className="mt-1 text-xs text-muted">★ {rating.toFixed(1)} · {p.reviews.length} отзыв(ов)</div>}
          <p className="mt-6 text-sm leading-relaxed text-ink/80">{p.description}</p>
          <div className="mt-8">
            <AddToCart
              slug={p.slug}
              loggedIn={!!user}
              variants={p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, colorHex: v.colorHex, available: v.stock - v.reserved }))}
            />
          </div>
          <form action={toggleWishlistAction} className="mt-3">
            <input type="hidden" name="productId" value={p.id} />
            <input type="hidden" name="back" value={`/product/${p.slug}`} />
            <button className="btn-ghost w-full">{inWishlist ? "♥ В избранном" : "♡ В избранное"}</button>
          </form>
          <dl className="mt-8 divide-y divide-line border-y border-line text-sm">
            {[
              ["Состав", p.composition],
              ["Уход", p.care],
              ["Производство", p.madeIn],
              ["Доставка", "Курьером с примеркой по Москве и Петербургу, СДЭК по России"],
              ["Возврат", "14 дней с момента получения, для Privé — бесплатный обратный забор"],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-4 py-3">
                  <dt className="eyebrow pt-0.5">{k}</dt>
                  <dd className="text-ink/80">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>

      {p.reviews.length > 0 && (
        <section className="mt-20">
          <h2 className="text-3xl">Отзывы</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {p.reviews.map((r) => (
              <div key={r.id} className="card p-6">
                <div className="text-sm text-champagne-dark">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
                <p className="mt-3 text-sm">{r.text}</p>
                <div className="mt-3 text-xs text-muted">{r.user.firstName} · {formatDate(r.createdAt)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-8 text-3xl">С этим носят</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((r) => (
              <ProductCard key={r.id} p={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
