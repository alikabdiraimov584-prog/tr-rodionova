import { formatMoney } from "@/lib/money";

/** Простой столбчатый график без зависимостей (SVG). Значения в копейках. */
export function BarChart({ data, height = 180, money = true }: { data: { label: string; value: number; sub?: number }[]; height?: number; money?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" className="h-44 w-full" role="img" aria-label="График">
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 3 - 2);
          const hs = d.sub ? (d.sub / max) * (height / 3 - 2) : 0;
          return (
            <g key={d.label}>
              <rect x={i * w + w * 0.18} y={height / 3 - h} width={w * 0.64} height={h} fill="var(--taupe)">
                <title>{`${d.label}: ${money ? formatMoney(d.value) : d.value}`}</title>
              </rect>
              {hs > 0 && <rect x={i * w + w * 0.18} y={height / 3 - hs} width={w * 0.64} height={hs} fill="var(--champagne)" opacity={0.9} />}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex text-[0.6rem] uppercase tracking-[0.1em] text-muted">
        {data.map((d) => (
          <div key={d.label} className="truncate text-center" style={{ width: `${w}%` }}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}

export function HBar({ items }: { items: { label: string; value: number; display?: string; tone?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.label} className="text-sm">
          <div className="flex justify-between gap-2"><span className="truncate">{i.label}</span><span className="text-muted">{i.display ?? i.value}</span></div>
          <div className="mt-1 h-1.5 bg-sand"><div className="h-1.5" style={{ width: `${(i.value / max) * 100}%`, background: i.tone ?? "var(--taupe)" }} /></div>
        </div>
      ))}
    </div>
  );
}
