"use client";

import { useEffect, useRef, useState } from "react";

const path = "/images/brand/amore-cover";
const interval = 5000;
const transition = 600;

const photos = {
  front: ["Модель в платье Amore у чёрной двери", "54%"],
  back: ["Платье Amore со спины у чёрной двери", "30%"],
  stool: ["Модель в платье Amore на деревянном табурете", "32%"],
  studio: ["Платье Amore в студии на тёмном фоне", "46%"],
  portrait: ["Портрет модели в платье Amore", "35%"],
  monochrome: ["Чёрно-белый портрет модели на табурете", "32%"],
  doorway: ["Платье Amore в полный рост у двери", "40%"],
  shadow: ["Чёрно-белый кадр платья Amore в студии", "46%"],
} as const;

type Photo = keyof typeof photos;
// The second photograph of each pair fills the mobile cover.
const slides: [Photo, Photo][] = [
  ["back", "front"],
  ["studio", "stool"],
  ["monochrome", "portrait"],
  ["shadow", "doorway"],
];

const mobilePhotos: Photo[] = ["front", "stool", "portrait", "shadow", "doorway", "studio", "monochrome", "back"];

function sources(photo: Photo) {
  return [640, 1080, 1600, 2160].map(w => `${path}/${photo}-${w}.webp ${w}w`).join(", ");
}

export function AmoreCover() {
  const root = useRef<HTMLElement>(null);
  const nextPanel = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [queued, setQueued] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mobile, setMobile] = useState(false);
  const count = mobile ? mobilePhotos.length : slides.length;
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const narrow = matchMedia("(max-width: 47.999rem)");
    const syncLayout = () => {
      setMobile(narrow.matches);
      setActive(0);
      setQueued(null);
    };
    syncLayout();
    narrow.addEventListener("change", syncLayout);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setPaused(motion.matches);
    syncMotion();
    let inView = false;
    const syncVisibility = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncVisibility();
    });
    observer.observe(root.current!);
    motion.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      observer.disconnect();
      narrow.removeEventListener("change", syncLayout);
      motion.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    let cancelled = false;
    let finish: ReturnType<typeof setTimeout>;
    const next = (active + 1) % count;
    const prepare = setTimeout(() => setQueued(next), interval / 2);
    async function advance() {
      const images = Array.from(nextPanel.current?.querySelectorAll("img") ?? []);
      try {
        await Promise.all(images.filter(img => img.offsetWidth > 0).map(img => img.decode()));
        if (!cancelled && images.length) {
          setFading(true);
          finish = setTimeout(() => {
            setActive(next);
            setQueued(null);
            setFading(false);
          }, transition);
        }
      } catch {
        // Keep the current photograph on screen and retry after a transient load failure.
        if (!cancelled) retry = setTimeout(advance, interval);
      }
    }
    let retry = setTimeout(advance, interval);
    return () => {
      cancelled = true;
      clearTimeout(prepare);
      clearTimeout(retry);
      clearTimeout(finish);
      setFading(false);
    };
  }, [active, visible, paused, count]);

  return (
    <section ref={root} aria-label="Платье Amore" className="relative h-[calc(100svh-3.5rem)] overflow-hidden bg-[#17191b] md:h-[calc(100svh-4rem)]">
      {(queued === null ? [active] : [active, queued]).map(index => {
        const [left, desktopRight] = slides[index % slides.length];
        const right = mobile ? mobilePhotos[index] : desktopRight;
        const incoming = index !== active;
        return (
          <div key={index} ref={incoming ? nextPanel : undefined} aria-hidden={incoming} className="absolute inset-0 grid md:grid-cols-2 motion-reduce:transition-none" style={{ opacity: incoming && !fading ? 0 : 1, transition: incoming ? `opacity ${transition}ms ease-in-out` : undefined }}>
            <picture className="hidden min-h-0 md:block">
              <source media="(min-width: 48rem)" srcSet={sources(left)} sizes="50vw" />
              <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt={photos[left][0]} className="h-full w-full object-cover" style={{ objectPosition: `50% ${photos[left][1]}` }} />
            </picture>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${path}/${right}-1080.webp`} srcSet={sources(right)} sizes="(min-width: 48rem) 50vw, 100vw" fetchPriority={index === 0 && !incoming ? "high" : "auto"} width={1080} height={1620} alt={photos[right][0]} className="min-h-0 h-full w-full object-cover" style={{ objectPosition: `50% ${photos[right][1]}` }} />
          </div>
        );
      })}
      <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "Продолжить показ фотографий" : "Приостановить показ фотографий"} className="absolute bottom-3 right-3 grid size-11 place-items-center text-white">
        <span className="grid size-7 place-items-center rounded-full bg-black/50">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
            <path d={paused ? "M3 1.5 10 6 3 10.5Z" : "M2 1h2.5v10H2zm5.5 0H10v10H7.5z"} />
          </svg>
        </span>
      </button>
    </section>
  );
}
