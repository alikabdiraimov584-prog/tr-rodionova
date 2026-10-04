"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui";

type Item = readonly [string, string];

/** Мобильное меню витрины: кнопка-«бургер» в шапке и выезжающая панель со всеми разделами. */
export function MobileMenu({ nav, categories, loggedIn, cartCount }: { nav: readonly Item[]; categories: Item[]; loggedIn: boolean; cartCount: number }) {
  // Панель «привязана» к адресу, на котором её открыли: переход по ссылке закрывает её без эффектов
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
  const item = "flex min-h-11 items-center justify-between border-b border-line-soft py-2.5 text-[0.72rem] uppercase tracking-[0.12em]";
  return (
    <>
      <button type="button" aria-label="Открыть меню" aria-expanded={open} data-shop-menu onClick={() => setOpen(true)} className="-ml-2 flex h-11 w-11 items-center justify-center md:hidden">
        <span className="flex w-5 flex-col gap-[5px]"><span className="h-px bg-ink" /><span className="h-px bg-ink" /><span className="h-px bg-ink" /></span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Меню">
          <button type="button" aria-label="Закрыть меню" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/30" />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-ivory shadow-xl">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <Logo />
              <button type="button" aria-label="Закрыть меню" onClick={() => setOpen(false)} className="-mr-2 flex h-11 w-11 items-center justify-center text-xl leading-none">×</button>
            </div>
            <nav className="px-4 pb-6 pt-2">
              {nav.map(([href, label]) => (
                <Link key={href} href={href} className={item}>{label}</Link>
              ))}
              <div className="eyebrow mt-6 mb-1">Категории</div>
              <Link href="/catalog?new=1" className={item}>Новое</Link>
              {categories.map(([href, label]) => (
                <Link key={href} href={href} className={item}>{label}</Link>
              ))}
              <Link href="/preloved" className={item}>Pre-loved</Link>
              <Link href="/gift" className={item}>Сертификаты</Link>
              <div className="eyebrow mt-6 mb-1">Вы</div>
              <Link href="/catalog?q=" className={item}>Поиск</Link>
              <Link href={loggedIn ? "/account" : "/login"} className={item}>{loggedIn ? "Кабинет" : "Войти"}</Link>
              <Link href="/cart" className={item}><span>Корзина</span><span className="text-muted">{cartCount}</span></Link>
              <Link href="/circle" className={item}>Circle</Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
