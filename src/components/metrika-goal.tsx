"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    /** Функция счётчика Яндекс Метрики; появляется после согласия на cookie и загрузки tag.js. */
    ym?: (...args: unknown[]) => void;
    /** Номер счётчика, который подставил сервер в init (см. third-party-tags.tsx). */
    __trMetrika?: number;
    dataLayer?: unknown[];
  }
}

export type MetrikaPurchase = {
  id: string;
  revenue: number;
  products: { id: string; name: string; price: number; quantity: number; variant?: string }[];
};

/**
 * Цель Метрики (reachGoal) и, для заказа, покупка в контейнер электронной коммерции dataLayer.
 * Срабатывает один раз на событие: ключ в sessionStorage плюс защита от повторного рендера, иначе обновление
 * страницы «Спасибо за заказ» считало бы заказ дважды.
 */
export function MetrikaGoal({ goal, dedupe, purchase }: { goal: string; dedupe: string; purchase?: MetrikaPurchase }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const key = `tr-ym-${goal}-${dedupe}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // приватный режим: защищает только ref
    }
    if (purchase) {
      (window.dataLayer = window.dataLayer || []).push({
        ecommerce: { currencyCode: "RUB", purchase: { actionField: { id: purchase.id, revenue: purchase.revenue }, products: purchase.products } },
      });
    }
    if (window.__trMetrika && typeof window.ym === "function") {
      window.ym(window.__trMetrika, "reachGoal", goal, purchase ? { order_price: purchase.revenue, currency: "RUB" } : undefined);
    }
  }, [goal, dedupe, purchase]);
  return null;
}
