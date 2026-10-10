"use client";

import { useEffect, useRef } from "react";
import { trackGoal, type MetrikaGoalId } from "@/lib/metrika-client";

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
export function MetrikaGoal({ goal, dedupe, purchase }: { goal: MetrikaGoalId; dedupe: string; purchase?: MetrikaPurchase }) {
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
    trackGoal(goal, purchase ? { order_price: purchase.revenue, currency: "RUB" } : undefined);
  }, [goal, dedupe, purchase]);
  return null;
}
