"use client";

import { useEffect, useState } from "react";

/** Высота баннера cookie снизу экрана (его компонент пишет её в --consent-h, пока баннер виден). */
const consentHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--consent-h")) || 0;

/**
 * Закреплённая снизу панель на телефоне: название, цена и кнопка, которая возвращает к выбору размера.
 * Видна всегда, когда строки с кнопкой «Добавить в корзину» не видно — и до неё (пока смотрят фото), и после
 * (пока читают описание). Кнопка считается видимой, только если она над баннером cookie: под ним её не нажать.
 * Сама панель ничего не кладёт в корзину: без выбранного размера это ошибка.
 */
export function MobileBuyBar({ name, price, label }: { name: string; price: string; label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.getElementById("buy-cta") ?? document.getElementById("buy");
    if (!target) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = target.getBoundingClientRect();
        const bottom = window.innerHeight - consentHeight();
        // видно хотя бы полкнопки между шапкой и баннером
        setShow(!(r.bottom > 56 + r.height / 2 && r.top < bottom - r.height / 2));
      });
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // баннер cookie закрыли или он поменял высоту — пересчитать без прокрутки
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      mo.disconnect();
    };
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
      <button
        type="button"
        onClick={() => {
          document.getElementById("buy")?.scrollIntoView({ behavior: "smooth", block: "start" });
          // панель после прокрутки исчезает: фокус переходит к выбору размера (или к кнопке покупки, если размер уже выбран),
          // а не на body — клавиатура и экранный диктор продолжают с того же места
          const group = document.querySelector<HTMLElement>('#buy [role="group"]');
          const pressed = group?.querySelector<HTMLElement>('button[aria-pressed="true"]');
          const next = pressed ? document.querySelector<HTMLElement>("#buy-cta button:not([disabled])") : group?.querySelector<HTMLElement>("button");
          next?.focus({ preventScroll: true });
        }}
        className="btn-primary !min-h-11 shrink-0 !px-5"
      >
        {label}
      </button>
    </div>
  );
}
