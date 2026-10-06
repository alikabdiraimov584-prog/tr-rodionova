"use client";

import type { ReactNode } from "react";

/** Выпадающий список на details: после выбора пункта закрывается, в том числе когда выбран уже текущий вариант. */
export function PickList({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={className} onClick={(e) => { if ((e.target as Element).closest("a")) e.currentTarget.closest("details")?.removeAttribute("open"); }}>
      {children}
    </div>
  );
}
