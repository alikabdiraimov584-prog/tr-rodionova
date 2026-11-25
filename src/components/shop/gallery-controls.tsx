export function GalleryControls({ index, count, go }: { index: number; count: number; go: (index: number) => void }) {
  return (
    <>
      <button type="button" onClick={() => go(index - 1)} aria-label="Предыдущее фото" className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ivory/80 text-ink opacity-70 transition hover:bg-ivory hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 md:flex">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <button type="button" onClick={() => go(index + 1)} aria-label="Следующее фото" className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ivory/80 text-ink opacity-70 transition hover:bg-ivory hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 md:flex">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
      </button>
      {/* переключатель кадров: белые черты на тёмной подложке видны и на светлом фото; текущий кадр — длинная черта;
          с клавиатуры кадры листают стрелки */}
      <div className="absolute inset-x-0 bottom-2 flex justify-center">
        <div className="flex rounded-full bg-black/35 px-1.5">
          {Array.from({ length: count }, (_, i) => (
            <button key={i} type="button" tabIndex={-1} aria-label={`Показать фото ${i + 1}`} aria-current={i === index ? "true" : undefined} onClick={() => go(i)} className="flex h-6 min-w-6 items-center justify-center px-0.5">
              <span className={`block h-[2px] rounded-full transition-all ${i === index ? "w-5 bg-panel" : "w-3 bg-white/55"}`} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
