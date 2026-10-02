"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number };

export function CrmNav({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((i) => {
          const active = i.href === "/crm" ? path === "/crm" : path.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center justify-between px-3 py-2 text-[0.72rem] uppercase tracking-[0.16em] transition-colors ${active ? "bg-ivory/10 text-champagne" : "text-ivory/60 hover:text-ivory"}`}
            >
              {i.label}
              {!!i.badge && <span className="rounded-full bg-champagne px-1.5 text-[0.6rem] text-ink">{i.badge}</span>}
            </Link>
          );
        })}
    </nav>
  );
}
