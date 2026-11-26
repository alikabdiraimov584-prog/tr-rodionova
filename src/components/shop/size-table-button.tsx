"use client";

export function SizeTableButton({ className }: { className?: string }) {
  function openTable() {
    const details = document.getElementById("product-size-chart");
    if (!(details instanceof HTMLDetailsElement)) return;

    details.open = true;
    details.querySelector("summary")?.focus({ preventScroll: true });
    details.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <button type="button" aria-controls="product-size-chart" className={className} onClick={openTable}>
      Таблица размеров
    </button>
  );
}
