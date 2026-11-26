"use client";

export function SizeTableLink({ className }: { className?: string }) {
  return (
    <a href="#product-size-chart" className={className} onClick={() => {
      const details = document.getElementById("product-size-chart");
      if (details instanceof HTMLDetailsElement) {
        details.open = true;
        details.querySelector("summary")?.focus({ preventScroll: true });
      }
    }}>
      Таблица размеров
    </a>
  );
}
