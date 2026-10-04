import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { Empty, PageTitle } from "@/components/ui";
import { updateCartAction } from "@/app/actions/shop";
import { getGuestToken, guestCartItems } from "@/lib/guest-cart";

export const metadata: Metadata = { title: "Корзина" };

export default async function CartPage() {
  const user = await getCurrentUser();
  const items = user
    ? await db.cartItem.findMany({
        where: { userId: user.id },
        include: { variant: { include: { product: { include: { images: { orderBy: { order: "asc" }, take: 1 } } } } } },
        orderBy: { id: "asc" },
      })
    : await guestCartItems(await getGuestToken());
  const delivery = await getSetting("delivery");
  const subtotal = items.reduce((s, i) => s + (i.variant.price ?? i.variant.product.price) * i.quantity, 0);
  const pts = Math.floor((subtotal * (user?.loyaltyTier?.cashbackPct ?? 3)) / 100 / 100);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <PageTitle title="Корзина" />
      {items.length === 0 ? (
        <Empty title="В корзине пока пусто" action={<Link href="/catalog" className="btn-primary">В каталог</Link>} />
      ) : (
        <div className="grid gap-8 md:grid-cols-[1fr_300px] md:gap-10 lg:grid-cols-[1fr_340px]">
          <div className="divide-y divide-line border-y border-line">
            {items.map((i) => {
              const price = i.variant.price ?? i.variant.product.price;
              const available = i.variant.product.isPreorder ? 5 : i.variant.stock - i.variant.reserved;
              return (
                <div key={i.id} className="flex gap-4 py-5 sm:gap-5">
                  <Link href={`/product/${i.variant.product.slug}`} className="relative h-28 w-20 shrink-0 bg-sand sm:h-32 sm:w-24">
                    {i.variant.product.images[0] && <Image src={i.variant.product.images[0].url} alt="" fill unoptimized className="object-cover" />}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/product/${i.variant.product.slug}`}>{i.variant.product.name}</Link>
                        <div className="mt-1 text-xs text-muted">{i.variant.color} · {i.variant.size}{i.variant.product.isPreorder ? " · предзаказ" : ""}</div>
                        {available < i.quantity && <div className="mt-1 text-xs text-danger">Доступно только {Math.max(0, available)} шт.</div>}
                      </div>
                      <div className="shrink-0 text-sm">{formatMoney(price * i.quantity)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <form action={updateCartAction} className="flex items-center gap-2">
                        <input type="hidden" name="variantId" value={i.variantId} />
                        <select name="quantity" defaultValue={i.quantity} className="min-h-10 border border-line bg-white px-2 py-1 text-sm">
                          {Array.from({ length: Math.max(i.quantity, Math.min(5, Math.max(1, available))) }, (_, n) => n + 1).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                        <button className="min-h-10 px-1 text-[0.65rem] uppercase tracking-[0.18em] text-muted hover:text-ink">Обновить</button>
                      </form>
                      <form action={updateCartAction}>
                        <input type="hidden" name="variantId" value={i.variantId} />
                        <input type="hidden" name="quantity" value="0" />
                        <button className="min-h-10 px-1 text-[0.65rem] uppercase tracking-[0.18em] text-muted hover:text-danger">Удалить</button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <aside className="card h-fit p-5 md:p-6">
            <div className="flex justify-between text-sm"><span>Товары</span><span>{formatMoney(subtotal)}</span></div>
            <div className="mt-2 flex justify-between text-sm text-muted">
              <span>Доставка</span>
              <span>{user?.loyaltyTier?.freeShipping || subtotal >= delivery.freeFrom ? "бесплатно" : "при оформлении"}</span>
            </div>
            <div className="mt-4 border-t border-line pt-4 text-xs text-taupe-dark">
              +{pts.toLocaleString("ru-RU")} баллов после получения заказа{user ? ` · баланс ${user.pointsBalance.toLocaleString("ru-RU")} баллов` : " · 2 000 приветственных баллов при первом заказе"}
            </div>
            <Link href="/checkout" className="btn-primary mt-6 w-full">Оформить заказ</Link>
          </aside>
        </div>
      )}
    </div>
  );
}
