import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { getCurrentCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { PageTitle } from "@/components/ui";
import { updateCartAction } from "@/app/actions/shop";
import { getGuestToken, guestCartItems } from "@/lib/guest-cart";
import { ProductCard } from "@/components/shop/product-card";
import { isRealPhoto } from "@/lib/photos";
import { dolyameAvailableFor } from "@/lib/payments/dolyame";

export const metadata: Metadata = { title: "Корзина" };

export default async function CartPage() {
  const user = await getCurrentCustomer();
  const items = user
    ? await db.cartItem.findMany({
        where: { userId: user.id },
        include: { variant: { include: { product: { include: { images: { orderBy: { order: "asc" }, take: 1 } } } } } },
        orderBy: { id: "asc" },
      })
    : await guestCartItems(await getGuestToken());
  const delivery = await getSetting("delivery");
  // пустая корзина — не тупик: показываем новинки со съёмкой
  const suggestions = items.length === 0
    ? (await db.product.findMany({ where: { status: "ACTIVE", isPreloved: false, isNew: true }, include: { images: { orderBy: { order: "asc" } }, variants: true }, orderBy: { createdAt: "desc" }, take: 12 })).filter((p) => isRealPhoto(p.images[0]?.url)).slice(0, 4)
    : [];
  const subtotal = items.reduce((s, i) => s + (i.variant.price ?? i.variant.product.price) * i.quantity, 0);
  const pts = Math.floor((subtotal * (user?.loyaltyTier?.cashbackPct ?? 3)) / 100 / 100);
  const installments = subtotal > 0 && (await dolyameAvailableFor(subtotal).catch(() => false));
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <PageTitle title="Корзина" />
      {items.length === 0 ? (
        <div className="border-t border-line pt-10 text-center">
          <p className="text-[0.95rem]">В корзине пока пусто</p>
          <Link href="/catalog?new=1" className="btn-primary mt-6">Смотреть новинки</Link>
          {suggestions.length > 0 && (
            <div className="mt-14 text-left">
              <h2 className="section-title mb-5 px-1">Новинки</h2>
              <div className="grid grid-cols-2 gap-x-1 md:grid-cols-4">{suggestions.map((p) => <ProductCard key={p.id} p={p} />)}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[1fr_300px] md:gap-10 lg:grid-cols-[1fr_340px]">
          <div className="divide-y divide-line border-y border-line">
            {items.map((i) => {
              const price = i.variant.price ?? i.variant.product.price;
              const available = i.variant.product.isPreorder ? 5 : i.variant.stock - i.variant.reserved;
              return (
                <div key={i.id} className="flex gap-4 py-5 sm:gap-5">
                  {/* фото дублирует ссылку с названием рядом: для Tab и диктора одна ссылка */}
                  <Link href={`/product/${i.variant.product.slug}`} tabIndex={-1} aria-hidden className="relative h-28 w-20 shrink-0 bg-sand sm:h-32 sm:w-24">
                    {i.variant.product.images[0] && <Image src={i.variant.product.images[0].url} alt="" fill sizes="96px" className="object-cover" />}
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
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      {/* количество в один шаг: «−» и «+» сразу сохраняют, без отдельной кнопки «Обновить» */}
                      <div className="flex items-center border border-line" role="group" aria-label={`Количество: ${i.variant.product.name}`}>
                        <form action={updateCartAction}>
                          <input type="hidden" name="variantId" value={i.variantId} />
                          <input type="hidden" name="quantity" value={i.quantity - 1} />
                          <button aria-label="Меньше" disabled={i.quantity <= 1} className="flex h-10 w-10 items-center justify-center text-[1rem] hover:bg-sand disabled:cursor-not-allowed disabled:text-line">−</button>
                        </form>
                        <span className="min-w-8 text-center text-sm" aria-live="polite">{i.quantity}</span>
                        <form action={updateCartAction}>
                          <input type="hidden" name="variantId" value={i.variantId} />
                          <input type="hidden" name="quantity" value={i.quantity + 1} />
                          <button aria-label="Больше" disabled={i.quantity >= Math.min(5, Math.max(1, available))} className="flex h-10 w-10 items-center justify-center text-[1rem] hover:bg-sand disabled:cursor-not-allowed disabled:text-line">+</button>
                        </form>
                      </div>
                      <form action={updateCartAction}>
                        <input type="hidden" name="variantId" value={i.variantId} />
                        <input type="hidden" name="quantity" value="0" />
                        <button className="min-h-10 px-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted hover:text-danger">Удалить</button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <aside className="h-fit bg-sand p-5 md:p-6">
            <div className="flex justify-between text-sm"><span>Товары</span><span>{formatMoney(subtotal)}</span></div>
            <div className="mt-2 flex justify-between text-sm text-muted">
              <span>Доставка</span>
              <span>{user?.loyaltyTier?.freeShipping || subtotal >= delivery.freeFrom ? "бесплатно" : "при оформлении"}</span>
            </div>
            <div className="mt-4 border-t border-line pt-4 text-xs text-taupe-dark">
              +{pts.toLocaleString("ru-RU")} баллов после получения заказа{user ? ` · баланс ${user.pointsBalance.toLocaleString("ru-RU")} баллов` : " · 2 000 приветственных баллов при первом заказе"}
            </div>
            <Link href="/checkout" className="btn-primary mt-6 w-full">Оформить заказ</Link>
            <ul className="mt-5 space-y-1.5 text-[0.75rem] text-muted">
              <li>Примерка курьером по Москве и Петербургу</li>
              <li>Возврат 14 дней</li>
              {installments && <li>Можно оплатить частями — Долями</li>}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
