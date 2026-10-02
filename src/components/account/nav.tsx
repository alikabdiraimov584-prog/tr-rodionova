"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/account", "Обзор"],
  ["/account/orders", "Заказы"],
  ["/account/loyalty", "Circle и баллы"],
  ["/account/wishlist", "Избранное"],
  ["/account/waitlist", "Лист ожидания"],
  ["/account/profile", "Профиль и адреса"],
] as const;

export function AccountNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-4 overflow-x-auto text-[0.68rem] uppercase tracking-[0.18em] md:flex-col md:gap-3">
      {items.map(([href, label]) => {
        const active = href === "/account" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`whitespace-nowrap ${active ? "text-ink" : "text-muted hover:text-ink"}`}>
            {active && <span className="mr-2 hidden text-taupe md:inline">✦</span>}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
