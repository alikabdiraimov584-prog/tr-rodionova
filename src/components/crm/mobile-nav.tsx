"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CrmNav } from "@/components/crm/nav";

type Item = { href: string; label: string; badge?: number };
type Group = { title: string; items: Item[] };

/** Навигация CRM на планшетах и телефонах: кнопка в шапке и выезжающая панель с поиском и разделами. */
export function CrmMobileNav({ groups }: { groups: Group[] }) {
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
  return (
    <>
      <button type="button" aria-label="Открыть меню" aria-expanded={open} data-crm-menu onClick={() => setOpen(true)} className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/10 lg:hidden">
        <span className="flex w-5 flex-col gap-[5px]"><span className="h-0.5 rounded bg-white" /><span className="h-0.5 rounded bg-white" /><span className="h-0.5 rounded bg-white" /></span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Меню CRM">
          <button type="button" aria-label="Закрыть меню" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-xs flex-col bg-ivory shadow-2xl">
            <div className="flex h-13 shrink-0 items-center justify-between bg-[#1a1c1f] px-4 text-white">
              <span className="text-[0.95rem] font-bold tracking-tight">T.Rodionova <span className="font-normal text-white/60">CRM</span></span>
              <button type="button" aria-label="Закрыть меню" onClick={() => setOpen(false)} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-2xl leading-none hover:bg-white/10">×</button>
            </div>
            <form action="/crm/customers" className="border-b border-line p-3">
              <input name="q" placeholder="Поиск по клиентам, заказам…" className="input py-2.5" />
            </form>
            <div className="flex-1 overflow-y-auto p-3">
              <CrmNav groups={groups} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
