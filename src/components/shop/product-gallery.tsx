"use client";

import { GalleryControls } from "./gallery-controls";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type Img = { id: string; url: string; alt: string | null };

/**
 * Галерея карточки вещи, как у ACTE: один кадр на экран, листается свайпом на телефоне и стрелками или точками
 * на компьютере, без сторонних библиотек (прокрутка с привязкой к кадру). На компьютере кадр не выше окна, чтобы
 * фото и переключатель кадров были видны целиком. Картинки отдаёт next/image: под ширину колонки, в AVIF/WebP,
 * первый кадр — с высоким приоритетом, остальные — лениво.
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
  // подпись из базы часто совпадает с названием — тогда кадры различаются номером
  const alt = (img: Img, i: number) => (img.alt && (i === 0 || img.alt !== name) ? img.alt : i === 0 ? name : `${name}, фото ${i + 1}`);

  return (
    <section aria-label={`Фото: ${name}`} className="group relative mx-auto w-full self-start md:max-w-[calc((100svh-5rem)*0.8)]">
      <div
        ref={track}
        className="scroll-row flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); } }}
        tabIndex={count > 1 ? 0 : undefined}
        aria-label={count > 1 ? "Листайте фото стрелками" : undefined}
        role={count > 1 ? "group" : undefined}
      >
        {images.map((img, i) => (
          <div key={img.id} className="relative aspect-[4/5] w-full shrink-0 snap-start bg-sand">
            <Image
              src={img.url}
              alt={alt(img, i)}
              fill
              quality={85}
              loading={i === 0 ? "eager" : "lazy"}
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
          <GalleryControls index={index} count={count} go={go} />
          <p className="sr-only" aria-live="polite">Фото {index + 1} из {count}</p>
        </>
      )}
    </section>
  );
}
