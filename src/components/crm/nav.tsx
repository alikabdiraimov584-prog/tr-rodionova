"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number };

/** Отклик сразу после клика, не дожидаясь сервера: раздел CRM проверяет вход и собирает данные на сервере. */
function Pending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-ink/15 border-t-ink" />
      <span className="sr-only">загружается</span>
    </>
  );
}
type Group = { title: string; items: Item[] };

export function CrmNav({ groups }: { groups: Group[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-4">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-muted">{g.title}</div>
          {g.items.map((i) => {
            const active = i.href === "/crm" ? path === "/crm" : path.startsWith(i.href);
            return (
              <Link key={i.href} href={i.href} className={`flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-[0.85rem] font-medium transition-colors lg:min-h-0 lg:py-1.5 lg:text-[0.82rem] ${active ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-ink/75 hover:bg-white/60 hover:text-ink"}`}>
                {i.label}
                <span className="flex items-center gap-1.5">
                  <Pending />
                  {!!i.badge && <span className="rounded-full bg-[#e3e4e8] px-1.5 text-[0.65rem] font-semibold text-ink">{i.badge}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
