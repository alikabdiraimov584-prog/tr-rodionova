"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui";
import { IconClose, IconMenu } from "@/components/shop/icons";

type Item = readonly [string, string];

/** Меню витрины для всех экранов: кнопка «Меню» в шапке и выезжающая слева панель с разделами (как у ACTE). */
export function SiteMenu({ categories, account, cartCount }: { categories: Item[]; account: readonly [string, string]; cartCount: number }) {
  // панель «привязана» к адресу, на котором её открыли: переход на другую страницу закрывает её сам
  const path = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === path;
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // пока панель открыта, фон недоступен для Tab и экранного диктора: фокус остаётся внутри диалога
    const background = [...document.body.children].filter((el) => el !== root.current && !el.hasAttribute("inert"));
    background.forEach((el) => el.setAttribute("inert", ""));
    root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedAt(null);
    window.addEventListener("keydown", onKey);
    const button = trigger.current;
    return () => {
      document.body.style.overflow = prev;
      background.forEach((el) => el.removeAttribute("inert"));
      window.removeEventListener("keydown", onKey);
      // фокус возвращается на кнопку «Меню», а не теряется на body
      button?.focus({ preventScroll: true });
    };
  }, [open]);
  const close = () => setOpenedAt(null);
  const big = "block py-2.5 text-[1.05rem] uppercase tracking-[0.06em] hover:opacity-60";
  const small = "block py-2.5 text-[0.82rem] text-muted hover:text-ink";
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Открыть меню"
        aria-expanded={open}
        aria-controls={open ? "site-menu" : undefined}
        data-shop-menu
        onClick={() => setOpenedAt(path)}
        className="flex h-11 min-w-11 items-center justify-center gap-2 px-2 transition-opacity hover:opacity-60"
      >
        <IconMenu />
        <span className="hidden text-[0.72rem] uppercase tracking-[0.12em] md:inline">Меню</span>
      </button>
      {/* панель выводится в body: у шапки могут быть фильтры и трансформации, которые обрезают fixed-элементы */}
      {open && createPortal(
        <div ref={root} id="site-menu" className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Меню">
          <div aria-hidden onClick={close} className="absolute inset-0 bg-ink/25" />
          {/* любая ссылка в панели закрывает её — в том числе переход по категориям в пределах /catalog, где адрес меняется только в параметрах */}
          <div onClick={(e) => (e.target as HTMLElement).closest("a") && close()} className="drawer-in absolute inset-y-0 left-0 flex w-[88%] max-w-[420px] flex-col overflow-y-auto bg-ivory">
            <div className="flex h-14 shrink-0 items-center justify-between px-4 md:h-16 md:px-6">
              <Logo className="py-3" />
              <button type="button" data-autofocus aria-label="Закрыть меню" onClick={close} className="-mr-2 flex h-11 w-11 items-center justify-center"><IconClose /></button>
            </div>
            <nav aria-label="Разделы" className="flex-1 px-4 pb-8 pt-2 md:px-6">
              <Link href="/catalog?new=1" className={big}>Новинки</Link>
              <Link href="/catalog" className={big}>Каталог</Link>
              <div className="mb-3 ml-0.5 border-l border-line pl-4">
                {categories.map(([href, label]) => <Link key={href} href={href} className={small}>{label}</Link>)}
              </div>
              <Link href="/lookbook" className={big}>Лукбук</Link>
              <Link href="/gift" className={big}>Подарочная карта</Link>
              <div className="mt-6 border-t border-line pt-4">
                <Link href="/circle" className={small}>Программа лояльности Circle</Link>
                <Link href="/delivery" className={small}>Доставка и возврат</Link>
                <Link href="/about" className={small}>О бренде</Link>
                <Link href="/collections" className={small}>Коллекции</Link>
                <Link href="/journal" className={small}>Журнал</Link>
                <Link href="/showroom" className={small}>Шоурум и контакты</Link>
              </div>
              <div className="mt-4 border-t border-line pt-4">
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
