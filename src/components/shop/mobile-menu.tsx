"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui";
import { IconClose, IconMenu } from "@/components/shop/icons";

type Item = readonly [string, string];

/** Меню витрины для всех экранов: кнопка «Меню» в шапке и выезжающая слева панель с разделами (как у ACTE). */
export function SiteMenu({ categories, account, cartCount }: { categories: Item[]; account: readonly [string, string]; cartCount: number }) {
  // панель «привязана» к адресу, на котором её открыли: переход по ссылке закрывает её без эффектов
  const path = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === path;
  const setOpen = (v: boolean) => setOpenedAt(v ? path : null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedAt(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const big = "block py-2 text-[1.05rem] uppercase tracking-[0.06em] hover:opacity-60";
  const small = "block py-1.5 text-[0.82rem] text-muted hover:text-ink";
  return (
    <>
      <button type="button" aria-label="Открыть меню" aria-expanded={open} data-shop-menu onClick={() => setOpen(true)} className="flex h-11 items-center gap-2 px-2 hover:opacity-60">
        <IconMenu />
        <span className="nav-link hidden md:inline">Меню</span>
      </button>
      {/* панель выводится в body: у шапки могут быть фильтры и трансформации, которые обрезают fixed-элементы */}
      {open && createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Меню">
          <button type="button" aria-label="Закрыть меню" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/25" />
          <div className="drawer-in absolute inset-y-0 left-0 flex w-[88%] max-w-[420px] flex-col overflow-y-auto bg-ivory">
            <div className="flex h-14 shrink-0 items-center justify-between px-4 md:h-16 md:px-6">
              <Logo />
              <button type="button" aria-label="Закрыть меню" onClick={() => setOpen(false)} className="-mr-2 flex h-11 w-11 items-center justify-center"><IconClose /></button>
            </div>
            <nav aria-label="Разделы" className="flex-1 px-4 pb-8 pt-4 md:px-6">
              <Link href="/catalog?new=1" className={big}>Новая коллекция</Link>
              <Link href="/catalog" className={big}>Каталог</Link>
              <div className="mb-3 ml-0.5 border-l border-line pl-4">
                {categories.map(([href, label]) => <Link key={href} href={href} className={small}>{label}</Link>)}
              </div>
              <Link href="/lookbook" className={big}>Лукбук</Link>
              <Link href="/preloved" className={big}>Pre-loved</Link>
              <Link href="/gift" className={big}>Подарочная карта</Link>
              <div className="mt-8 space-y-0.5 border-t border-line pt-6">
                <Link href="/circle" className={small}>Программа лояльности Circle</Link>
                <Link href="/delivery" className={small}>Доставка и возврат</Link>
                <Link href="/about" className={small}>О бренде</Link>
                <Link href="/journal" className={small}>Журнал</Link>
                <Link href="/showroom" className={small}>Шоурум и контакты</Link>
              </div>
              <div className="mt-6 space-y-0.5 border-t border-line pt-6">
                <Link href={account[0]} className={small}>{account[1]}</Link>
                <Link href="/account/wishlist" className={small}>Избранное</Link>
                <Link href="/cart" className={small}>Корзина · {cartCount}</Link>
              </div>
            </nav>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Старое имя компонента: оставлено, чтобы не ломать импорты. */
export const MobileMenu = SiteMenu;
