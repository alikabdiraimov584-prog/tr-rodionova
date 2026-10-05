import type { ReactNode } from "react";

/** Текстовая страница сайта: узкая колонка, заголовок, разделы с линейками. */
export function TextPage({ eyebrow, title, intro, children, aside }: { eyebrow?: string; title: string; intro?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 md:px-6">
      <div className="border-b border-line pb-6">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="mt-1 text-2xl">{title}</h1>
        {intro && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/80">{intro}</p>}
      </div>
      <div className={`grid gap-10 py-8 ${aside ? "md:grid-cols-[1fr_280px]" : ""}`}>
        <div className="min-w-0 max-w-3xl space-y-8 text-sm leading-relaxed">{children}</div>
        {aside && <aside className="text-sm">{aside}</aside>}
      </div>
    </div>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="grid gap-3 border-t border-line pt-5 scroll-mt-24 md:grid-cols-[200px_1fr]">
      <h2 className="text-base">{title}</h2>
      <div className="space-y-3 text-ink/85">{children}</div>
    </section>
  );
}
