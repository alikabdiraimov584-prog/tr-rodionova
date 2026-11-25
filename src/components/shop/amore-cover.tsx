"use client";

import { GalleryControls } from "./gallery-controls";
import { useCallback, useEffect, useRef, useState } from "react";

const path = "/images/brand/amore-cover";
const interval = 5000;


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
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [visible, setVisible] = useState(false);
  const [holding, setHolding] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const count = mobile ? mobilePhotos.length : slides.length;

  useEffect(() => {
    const narrow = matchMedia("(width < 48rem)");
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const syncLayout = () => {
      setMobile(narrow.matches);
      setActive(0);
      track.current?.scrollTo({ left: 0, behavior: "instant" });
    };
    const syncMotion = () => setReducedMotion(motion.matches);
    let inView = false;
    const syncVisibility = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncVisibility();
    });
    const release = () => setHolding(false);
    syncLayout();
    syncMotion();
    observer.observe(track.current!);
    narrow.addEventListener("change", syncLayout);
    motion.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      observer.disconnect();
      narrow.removeEventListener("change", syncLayout);
      motion.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, []);

  const go = useCallback((index: number) => {
    const el = track.current;
    if (!el) return;
    const next = (index + count) % count;
    el.scrollTo({ left: next * el.clientWidth, behavior: reducedMotion || Math.abs(index - next) >= count ? "instant" : "smooth" });
  }, [count, reducedMotion]);

  useEffect(() => {
    if (!visible || holding || reducedMotion || keyboardFocus) return;
    const timer = setTimeout(() => go(active + 1), interval);
    return () => clearTimeout(timer);
  }, [active, visible, holding, reducedMotion, keyboardFocus, go]);

  return (
    <section aria-label="Платье Amore" className="group relative h-[calc(100svh-3.5rem)] overflow-hidden bg-[#17191b] md:h-[calc(100svh-4rem)]"
      onFocus={e => setKeyboardFocus(e.target.matches(":focus-visible"))}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setKeyboardFocus(false); }}>
      <div ref={track} tabIndex={0} role="group" aria-label="Листайте фото стрелками"
        className="scroll-row flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        onPointerDown={() => setHolding(true)}
        onScroll={e => {
          const el = e.currentTarget;
          setActive(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth))));
        }}
        onKeyDown={e => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            go(active + (e.key === "ArrowRight" ? 1 : -1));
          }
        }}>
        {Array.from({ length: count }, (_, index) => {
          const [left, desktopRight] = slides[index % slides.length];
          const right = mobile ? mobilePhotos[index] : desktopRight;
          const near = Math.abs(index - active) <= 1 || (active === count - 1 && index === 0);
          return (
            <div key={index} className="grid h-full w-full shrink-0 snap-start snap-always md:grid-cols-2">
              {near && <>
                <picture className="hidden min-h-0 md:block">
                  <source media="(min-width: 48rem)" srcSet={sources(left)} sizes="50vw" />
                  <img draggable={false} src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt={photos[left][0]} className="h-full w-full object-cover" style={{ objectPosition: `50% ${photos[left][1]}` }} />
                </picture>
                <picture className="min-h-0">
                  <source media="(min-width: 48rem)" srcSet={sources(desktopRight)} sizes="50vw" />
                  <img draggable={false} src={`${path}/${right}-1080.webp`} srcSet={sources(right)} sizes="100vw" fetchPriority={index === 0 ? "high" : "low"} width={1080} height={1620} alt={photos[right][0]} className="h-full w-full object-cover" style={{ objectPosition: `50% ${photos[right][1]}` }} />
                </picture>
              </>}
            </div>
          );
        })}
      </div>
      <GalleryControls index={active} count={count} go={go} />
    </section>
  );
}
