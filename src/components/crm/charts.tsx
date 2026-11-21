"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";

type Point = { label: string; value: number; sub?: number; href?: string; title?: string };
type Kind = "bar" | "line" | "area";

const KINDS: { key: Kind; label: string }[] = [
  { key: "bar", label: "Столбцы" },
  { key: "line", label: "Линия" },
  { key: "area", label: "Область" },
];
const STORE = "tr-crm-chart-kind";
const H = 200; // высота области построения в единицах viewBox
const TOP = 22; // запас сверху под подписи значений

/** Короткая подпись над столбцом: «1,2 млн ₽», «450 тыс. ₽», «12 300 ₽» — полное значение во всплывающей подсказке. */
function short(v: number, money: boolean) {
  if (!money) return v.toLocaleString("ru-RU");
  const rub = v / 100;
  if (Math.abs(rub) >= 1_000_000) return `${(rub / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (Math.abs(rub) >= 10_000) return `${Math.round(rub / 1000).toLocaleString("ru-RU")} тыс.`;
  return Math.round(rub).toLocaleString("ru-RU");
}

/**
 * График по периодам без зависимостей: столбцы, линия или область (переключатель над графиком, выбор запоминается
 * в браузере). Над каждой точкой — значение, если точек не больше 45; иначе значения во всплывающей подсказке.
 * Фигуры рисуются в SVG, подписи — HTML поверх него: SVG растягивается по ширине, и текст в нём исказился бы.
 * У точки с href вся колонка — ссылка (например, на страницу дня).
 * Значения денег — в копейках.
 */
export function BarChart({ data, money = true }: { data: Point[]; height?: number; money?: boolean }) {
  const [kind, setKind] = useState<Kind>("bar");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE) as Kind | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- выбор из браузера доступен только после монтирования
      if (saved && KINDS.some((k) => k.key === saved)) setKind(saved);
    } catch {
      /* хранилище недоступно: остаётся вид по умолчанию */
    }
  }, []);
  const choose = (k: Kind) => {
    setKind(k);
    try {
      localStorage.setItem(STORE, k);
    } catch {
      /* без хранилища выбор действует до перезагрузки */
    }
  };

  const n = Math.max(1, data.length);
  const hasSub = data.some((d) => (d.sub ?? 0) > 0);
  // масштаб по обеим сериям: иначе вторая серия выше первой уходит за рамку
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.sub ?? 0]));
  const W = 1000;
  const step = W / n;
  const y = (v: number) => TOP + (H - TOP) * (1 - v / max);
  const cx = (i: number) => i * step + step / 2;
  const fmt = (v: number) => (money ? formatMoney(v) : v.toLocaleString("ru-RU"));
  const showValues = n <= 45;
  const dense = n > 14;
  // на плотной оси вместо «22.10» пишется «22» (полная дата — во всплывающей подсказке столбца)
  const axis = (label: string) => {
    const m = /^(\d{2})\.(\d{2})$/.exec(label);
    return dense && m ? String(Number(m[1])) : label;
  };
  const everyNth = n > 45 ? Math.ceil(n / 15) : 1;
  const line = (key: "value" | "sub") => data.map((d, i) => `${cx(i)},${y((key === "value" ? d.value : d.sub) ?? 0)}`).join(" ");

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div role="group" aria-label="Вид графика" className="inline-flex overflow-hidden rounded-lg border border-line text-xs">
          {KINDS.map((k) => (
            <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => choose(k.key)} className={`px-2.5 py-1 ${kind === k.key ? "bg-ink text-ivory" : "text-muted hover:bg-sand"}`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-52">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label="График">
          <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
          {kind === "bar" &&
            data.map((d, i) => {
              const bw = step * (hasSub ? 0.36 : 0.62);
              const x0 = hasSub ? cx(i) - bw - step * 0.02 : cx(i) - bw / 2;
              return (
                <g key={`${d.label}-${i}`}>
                  <rect x={x0} y={y(d.value)} width={bw} height={H - y(d.value)} fill="var(--taupe)">
                    <title>{`${d.label}: ${fmt(d.value)}`}</title>
                  </rect>
                  {hasSub && (
                    <rect x={cx(i) + step * 0.02} y={y(d.sub ?? 0)} width={bw} height={H - y(d.sub ?? 0)} fill="var(--champagne)">
                      <title>{`${d.label}: ${fmt(d.sub ?? 0)}`}</title>
                    </rect>
                  )}
                </g>
              );
            })}
          {kind !== "bar" && (
            <>
              {kind === "area" && <polygon points={`${cx(0)},${H} ${line("value")} ${cx(n - 1)},${H}`} fill="var(--taupe)" opacity={0.25} />}
              <polyline points={line("value")} fill="none" stroke="var(--taupe)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {hasSub && kind === "area" && <polygon points={`${cx(0)},${H} ${line("sub")} ${cx(n - 1)},${H}`} fill="var(--champagne)" opacity={0.45} />}
              {hasSub && <polyline points={line("sub")} fill="none" stroke="var(--champagne)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
              {data.map((d, i) => (
                <rect key={`${d.label}-${i}`} x={i * step} y={0} width={step} height={H} fill="transparent">
                  <title>{`${d.label}: ${fmt(d.value)}${hasSub ? ` · ${fmt(d.sub ?? 0)}` : ""}`}</title>
                </rect>
              ))}
            </>
          )}
        </svg>
        {/* точки линии и подписи значений — HTML поверх SVG в процентах, чтобы не растягивались */}
        {data.map((d, i) => {
          const left = `${(cx(i) / W) * 100}%`;
          const top = (v: number) => `${(y(v) / H) * 100}%`;
          const subLeft = kind === "bar" && hasSub ? `${((cx(i) + step * 0.2) / W) * 100}%` : left;
          const mainLeft = kind === "bar" && hasSub ? `${((cx(i) - step * 0.2) / W) * 100}%` : left;
          return (
            <div key={`${d.label}-${i}`} aria-hidden>
              {kind !== "bar" && <span className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--taupe)]" style={{ left, top: top(d.value) }} />}
              {kind !== "bar" && hasSub && <span className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--champagne)]" style={{ left, top: top(d.sub ?? 0) }} />}
              {showValues && d.value > 0 && (
                <span className="absolute -translate-x-1/2 -translate-y-full whitespace-nowrap pb-0.5 text-[0.62rem] font-semibold leading-none text-ink" style={{ left: mainLeft, top: top(d.value) }}>
                  {short(d.value, money)}
                </span>
              )}
              {showValues && hasSub && (d.sub ?? 0) > 0 && (
                <span className="absolute -translate-x-1/2 -translate-y-full whitespace-nowrap pb-0.5 text-[0.62rem] font-semibold leading-none text-champagne-ink" style={{ left: subLeft, top: top(d.sub ?? 0) }}>
                  {short(d.sub ?? 0, money)}
                </span>
              )}
            </div>
          );
        })}
        {data.map((d, i) =>
          d.href ? (
            <Link key={`link-${d.label}-${i}`} href={d.href} title={d.title ?? d.label} aria-label={d.title ?? d.label} className="absolute inset-y-0 hover:bg-ink/5" style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }} />
          ) : null,
        )}
      </div>
      <div className="mt-1.5 flex text-[0.62rem] text-muted">
        {data.map((d, i) => (
          // на телефоне при плотной оси подписан каждый второй день, иначе числа слипаются
          <div key={`${d.label}-${i}`} className={`min-w-0 shrink-0 overflow-hidden text-center ${dense && i % 2 ? "invisible sm:visible" : ""}`} style={{ width: `${100 / n}%` }}>
            {i % everyNth === 0 ? axis(d.label) : ""}
          </div>
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
