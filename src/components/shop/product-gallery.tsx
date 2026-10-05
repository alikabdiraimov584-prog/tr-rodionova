"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type Img = { id: string; url: string; alt: string | null };

/**
 * Галерея карточки вещи: один кадр на экран, листается свайпом на телефоне и стрелками или точками на компьютере,
 * без сторонних библиотек (прокрутка с привязкой к кадру). Картинки отдаёт next/image: под ширину колонки,
 * в AVIF/WebP, первый кадр — с высоким приоритетом, остальные — лениво.
 */
export function ProductGallery({ images, name }: { images: Img[]; name: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = images.length;

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setIndex(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [count]);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const next = ((i % count) + count) % count;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }, [count]);

  if (count === 0) return <div className="aspect-[4/5] bg-sand" aria-hidden />;

  return (
    <section aria-roledescription="карусель" aria-label={`Фото: ${name}`} className="group relative">
      <div
        ref={track}
        className="scroll-row flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); } }}
        tabIndex={count > 1 ? 0 : -1}
      >
        {images.map((img, i) => (
          <div key={img.id} role="group" aria-roledescription="кадр" aria-label={`${i + 1} из ${count}`} className="relative aspect-[4/5] w-full shrink-0 snap-start bg-sand">
            <Image
              src={img.url}
              alt={img.alt ?? `${name}, фото ${i + 1}`}
              fill
              quality={85}
              priority={i === 0}
              fetchPriority={i === 0 ? "high" : "low"}
              sizes="(min-width: 1024px) 58vw, (min-width: 768px) 55vw, 100vw"
              className="object-cover"
              draggable={false}
            />
          </div>
        ))}
      </div>
      {count > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Предыдущее фото" className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ivory/85 text-ink opacity-0 transition hover:bg-ivory focus-visible:opacity-100 group-hover:opacity-100 md:flex">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Следующее фото" className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ivory/85 text-ink opacity-0 transition hover:bg-ivory focus-visible:opacity-100 group-hover:opacity-100 md:flex">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5" role="tablist" aria-label="Выбор фото">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Фото ${i + 1}`}
                onClick={() => go(i)}
                className="flex h-6 w-6 items-center justify-center"
              >
                <span className={`block h-1.5 w-1.5 rounded-full transition ${i === index ? "scale-125 bg-ink" : "bg-ink/35"}`} />
              </button>
            ))}
          </div>
          <p className="sr-only" aria-live="polite">Фото {index + 1} из {count}</p>
        </>
      )}
    </section>
  );
}
