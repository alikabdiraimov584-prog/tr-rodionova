import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProductCard } from "@/components/shop/product-card";
import { Empty, PageTitle } from "@/components/ui";
import { toggleWishlistAction } from "@/app/actions/shop";

export const metadata: Metadata = { title: "Избранное" };

export default async function WishlistPage() {
  const user = await requireUser("/account/wishlist");
  const items = await db.wishlistItem.findMany({
    where: { userId: user.id },
    include: { product: { include: { images: { orderBy: { order: "asc" } }, variants: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageTitle title="Избранное" />
      {items.length === 0 ? (
        <Empty title="В избранном пусто" action={<Link href="/catalog" className="btn-primary">В каталог</Link>}>Отмечайте понравившиеся вещи сердцем на странице товара.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3">
          {items.map((i) => (
            <div key={i.productId}>
              <ProductCard p={i.product} />
              <form action={toggleWishlistAction} className="mt-2">
                <input type="hidden" name="productId" value={i.productId} />
                <input type="hidden" name="back" value="/account/wishlist" />
                <button className="text-[0.62rem] uppercase tracking-[0.18em] text-muted hover:text-danger">Убрать</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
