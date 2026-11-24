import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/money";
import { isRealPhoto } from "@/lib/photos";
import { MonogramMark } from "@/components/brand-marks";
import type { CardProduct } from "@/components/shop/product-card";

export const SANS = { fontFamily: "var(--font-manrope), system-ui, sans-serif" } as const;
/** Заголовок строкой текста (h1/h2 над сеткой): общие стили заголовков витрины перебиваются только так, они вне слоёв Tailwind. */
export const PLAIN_HEADING = { ...SANS, fontSize: "inherit", fontWeight: 400, letterSpacing: "normal", lineHeight: "inherit", fontSizeAdjust: "none" } as const;

/**
 * Сетка вещей для маленькой коллекции: 2 колонки на телефоне, 3 на планшете, 4 на компьютере, кадры 2:3.
 * Под кадром название слева и цена справа (на телефоне — цена строкой ниже), при наведении второй кадр.
 * «Предзаказ» / «Нет в наличии» — серым в углу кадра. Вещь без съёмки — серая плитка с монограммой.
 */
export function RowGrid({ items, priority = 0 }: { items: CardProduct[]; priority?: number }) {
  const sizes = "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw";
  return (
    <div style={SANS} className="collection-grid gap-x-[4px] gap-y-10 px-[6px] text-[0.82rem] md:text-[0.84rem] md:gap-y-14">
      {/* Keep the photo layout with the HTML, including when the external stylesheet is unavailable. */}
      <style>{`
        .collection-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (min-width: 768px) { .collection-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (min-width: 1024px) { .collection-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .collection-hover { display: none; }
        @media (hover: hover) and (pointer: fine) {
          .collection-hover { display: block; opacity: 0; transition: opacity 300ms; }
          .collection-grid a:hover .collection-hover { opacity: 1; }
        }
      `}</style>
      {items.map((p, i) => {
        const shots = p.images.filter((s) => isRealPhoto(s.url));
        const soldOut = p.variants.length === 0 || (!p.isPreorder && !p.variants.some((v) => v.stock - v.reserved > 0));
        const label = soldOut ? "Нет в наличии" : p.isPreorder ? "Предзаказ" : null;
        return (
          <Link key={p.slug} href={`/product/${p.slug}`} className="group block">
            <div style={{ position: "relative", aspectRatio: "2 / 3", overflow: "hidden" }} className="bg-[#f6f5f3]">
              {shots.length === 0 ? (
                <div className="flex h-full items-center justify-center" aria-hidden><MonogramMark className="text-[4rem] text-ink/20" /></div>
              ) : (
                <>
                  <Image src={shots[0].url} alt="" fill preload={i < priority} sizes={sizes} style={{ objectFit: "cover" }} />
                  {shots[1] && <Image src={shots[1].url} alt="" fill sizes={sizes} style={{ objectFit: "cover" }} className="collection-hover" />}
                </>
              )}
              {label && <span className="absolute left-2.5 top-2 bg-white/70 px-1.5 py-0.5 text-[#6f6f6f]">{label}</span>}
            </div>
            <div className="flex flex-col gap-1 pt-2 lg:flex-row lg:flex-wrap lg:justify-between lg:gap-x-3 lg:pt-3">
              <span className="transition-opacity group-hover:opacity-60">{p.name}</span>
              <span className="shrink-0">
                {p.compareAt && <s className="mr-2 text-[#9a9a9a]"><span className="sr-only">Было </span>{formatMoney(p.compareAt)}</s>}
                {formatMoney(p.price)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
