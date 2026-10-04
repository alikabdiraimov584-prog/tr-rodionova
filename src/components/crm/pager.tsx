import Link from "next/link";

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-between text-[0.68rem] uppercase tracking-[0.16em]">
      {page > 1 ? <Link href={href(page - 1)} className="inline-flex min-h-11 items-center text-ink">← Назад</Link> : <span />}
      <span className="text-muted">Стр. {page} из {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className="inline-flex min-h-11 items-center text-ink">Вперёд →</Link> : <span />}
    </div>
  );
}

export function qs(base: string, params: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}
