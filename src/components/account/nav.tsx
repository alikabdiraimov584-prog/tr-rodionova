"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/account", "Обзор"],
  ["/account/orders", "Заказы"],
  ["/account/loyalty", "Circle и баллы"],
  ["/account/wishlist", "Избранное"],
  ["/account/waitlist", "Лист ожидания"],
  ["/account/stylist", "Мой стилист"],
  ["/account/resale", "Выкуп вещей"],
  ["/account/giftcards", "Сертификаты"],
  ["/account/profile", "Профиль и мерки"],
  ["/account/support", "Служба заботы"],
] as const;

export function AccountNav() {
  const path = usePathname();
  return (
    <nav className="scroll-row -mx-4 flex gap-1 overflow-x-auto px-4 text-[0.68rem] uppercase tracking-[0.14em] md:mx-0 md:flex-col md:gap-1 md:px-0 md:tracking-[0.18em]">
      {items.map(([href, label]) => {
        const active = href === "/account" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`inline-flex min-h-10 shrink-0 items-center whitespace-nowrap border-b-2 px-2 first:pl-0 md:min-h-0 md:border-0 md:px-0 md:py-1.5 ${active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {active && <span className="mr-2 hidden text-taupe md:inline">✦</span>}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
