import { formatMoney, formatPoints } from "@/lib/money";
import { Monogram } from "@/components/ui";

export function TierCard({
  name,
  code,
  points,
  pending,
  yearSpent,
  next,
  progress,
  remaining,
  firstName,
}: {
  name: string;
  code: string;
  points: number;
  pending: number;
  yearSpent: number;
  next: { name: string; threshold: number } | null;
  progress: number;
  remaining: number;
  firstName: string;
}) {
  const dark = code === "PRIVE";
  return (
    <div className={`relative overflow-hidden border border-line p-6 ${dark ? "bg-ink text-ivory" : code === "MAISON" ? "bg-champagne/40" : "bg-white"}`}>
      <Monogram className={`absolute -right-4 -top-6 text-[9rem] leading-none ${dark ? "text-champagne/15" : "text-ivory/25"}`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-[0.62rem] uppercase tracking-[0.3em] opacity-80">T.Rodionova Circle</span>
          <span className="text-base uppercase tracking-[0.14em]">{name}</span>
        </div>
        <div className="mt-8 text-[0.62rem] uppercase tracking-[0.25em] opacity-70">Баланс</div>
        <div className="text-3xl">{formatPoints(points)}</div>
        {pending > 0 && <div className="mt-1 text-xs opacity-80">+{formatPoints(pending)} ожидают начисления</div>}
        <div className="mt-6">
          <div className="flex justify-between text-xs opacity-80">
            <span>{formatMoney(yearSpent)} за 12 мес.</span>
            {next ? <span>до {next.name}: {formatMoney(remaining)}</span> : <span>высший уровень</span>}
          </div>
          <div className={`mt-2 h-1 w-full ${dark ? "bg-ivory/15" : "bg-ink/15"}`}>
            <div className={`h-1 ${dark ? "bg-champagne" : "bg-ink"}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="mt-6 text-sm opacity-90">{firstName}</div>
      </div>
    </div>
  );
}
