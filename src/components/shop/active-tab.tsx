"use client";

import { useEffect } from "react";

/**
 * Прокручивает ряд категорий каталога так, чтобы текущая категория была видна (на телефоне ряд шире экрана).
 * Двигает только сам ряд, страницу по вертикали не трогает.
 */
export function ActiveTabIntoView({ active }: { active: string }) {
  useEffect(() => {
    const row = document.querySelector<HTMLElement>("[data-category-row]");
    const tab = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    const box = row.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    // уже видна целиком — ряд не трогаем, чтобы «Все» и «Новинки» оставались на месте
    if (r.left >= box.left && r.right <= box.right - 40) return;
    const left = r.left - box.left + row.scrollLeft;
    row.scrollLeft = Math.max(0, left - (row.clientWidth - tab.offsetWidth) / 2);
  }, [active]);
  return null;
}
