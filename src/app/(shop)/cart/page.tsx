import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { Empty, PageTitle } from "@/components/ui";
import { updateCartAction } from "@/app/actions/shop";

export const metadata: Metadata = { title: "Корзина" };

export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Empty title="Корзина доступна после входа" action={<Link href="/login?next=/cart" className="btn-primary">Войти</Link>}>
          Войдите или зарегистрируйтесь — и получите 2 000 приветственных баллов.
        </Empty>
      </div>
    );
  }
  const items = await db.cartItem.findMany({
    where: { userId: user.id },
    include: { variant: { include: { product: { include: { images: { orderBy: { order: "asc" }, take: 1 } } } } } },
    orderBy: { id: "asc" },
  });
  const delivery = await getSetting("delivery");
  const subtotal = items.reduce((s, i) => s + (i.variant.price ?? i.variant.product.price) * i.quantity, 0);
  const pts = Math.floor((subtotal * (user.loyaltyTier?.cashbackPct ?? 3)) / 100 / 100);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-8">
      <PageTitle title="Корзина" />
      {items.length === 0 ? (
        <Empty title="В корзине пока пусто" action={<Link href="/catalog" className="btn-primary">В каталог</Link>} />
      ) : (
        <div className="grid gap-10 md:grid-cols-[1fr_340px]">
          <div className="divide-y divide-line border-y border-line">
            {items.map((i) => {
              const price = i.variant.price ?? i.variant.product.price;
              const available = i.variant.stock - i.variant.reserved;
              return (
                <div key={i.id} className="flex gap-5 py-5">
                  <Link href={`/product/${i.variant.product.slug}`} className="relative h-32 w-24 shrink-0 bg-sand">
                    {i.variant.product.images[0] && <Image src={i.variant.product.images[0].url} alt="" fill unoptimized className="object-cover" />}
                  </Link>
                  <div className="flex flex-1 flex-col justify-between">
                    <div className="flex justify-between gap-4">
                      <div>
                        <Link href={`/product/${i.variant.product.slug}`}>{i.variant.product.name}</Link>
                        <div className="mt-1 text-xs text-muted">{i.variant.color} · {i.variant.size}</div>
                        {available < i.quantity && <div className="mt-1 text-xs text-danger">Доступно только {Math.max(0, available)} шт.</div>}
                      </div>
                      <div className="text-sm">{formatMoney(price * i.quantity)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={updateCartAction} className="flex items-center gap-2">
                        <input type="hidden" name="variantId" value={i.variantId} />
                        <select name="quantity" defaultValue={i.quantity} className="border border-line bg-white px-2 py-1 text-sm">
                          {Array.from({ length: Math.max(i.quantity, Math.min(5, Math.max(1, available))) }, (_, n) => n + 1).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                        <button className="text-[0.65rem] uppercase tracking-[0.18em] text-muted hover:text-ink">Обновить</button>
                      </form>
                      <form action={updateCartAction}>
                        <input type="hidden" name="variantId" value={i.variantId} />
                        <input type="hidden" name="quantity" value="0" />
                        <button className="text-[0.65rem] uppercase tracking-[0.18em] text-muted hover:text-danger">Удалить</button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <aside className="card h-fit p-6">
            <div className="flex justify-between text-sm"><span>Товары</span><span>{formatMoney(subtotal)}</span></div>
            <div className="mt-2 flex justify-between text-sm text-muted">
              <span>Доставка</span>
              <span>{user.loyaltyTier?.freeShipping || subtotal >= delivery.freeFrom ? "бесплатно" : "при оформлении"}</span>
            </div>
            <div className="mt-4 border-t border-line pt-4 text-xs text-taupe-dark">
              +{pts.toLocaleString("ru-RU")} баллов после получения заказа · баланс {user.pointsBalance.toLocaleString("ru-RU")} баллов
            </div>
            <Link href="/checkout" className="btn-primary mt-6 w-full">Оформить заказ</Link>
          </aside>
        </div>
      )}
    </div>
  );
}
