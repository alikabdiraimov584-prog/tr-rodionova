"use client";

import { useEffect, useState } from "react";

/**
 * Закреплённая снизу панель на телефоне: название, цена и кнопка, которая возвращает к выбору размера.
 * Видна всегда, когда строка с кнопкой «Добавить в корзину» не на экране — и до неё (пока смотрят фото), и после
 * (пока читают описание). Сама ничего не кладёт в корзину: без выбранного размера это ошибка.
 */
export function MobileBuyBar({ name, price, label }: { name: string; price: string; label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.getElementById("buy-cta") ?? document.getElementById("buy");
    if (!target || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { threshold: 0 });
    io.observe(target);
    return () => io.disconnect();
  }, []);
  if (!show) return null;
  return (
    <div
      data-buy-bar
      style={{ bottom: "var(--consent-h, 0px)" }}
      className="fixed inset-x-0 z-30 flex items-center gap-3 border-t border-line bg-ivory/95 px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur md:hidden"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.78rem] uppercase tracking-[0.06em]">{name}</div>
        <div className="text-[0.85rem]">{price}</div>
      </div>
      <button type="button" onClick={() => document.getElementById("buy")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="btn-primary !min-h-11 shrink-0 !px-5">
        {label}
      </button>
    </div>
  );
}
