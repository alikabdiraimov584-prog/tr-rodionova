import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/money";
import { isRealPhoto } from "@/lib/photos";
import { MonogramMark } from "@/components/brand-marks";
import type { CardProduct } from "@/components/shop/product-card";

/** Гротеск сетки и подписей: как у therow.com — обычные строчные, без заглавных и разрядки. */
export const SANS = { fontFamily: "var(--font-manrope), system-ui, sans-serif" } as const;
/** Заголовок строкой текста (h1/h2 над сеткой): общие стили заголовков витрины перебиваются только так, они вне слоёв Tailwind. */
export const PLAIN_HEADING = { ...SANS, fontSize: "inherit", fontWeight: 400, letterSpacing: "normal", lineHeight: "inherit", fontSizeAdjust: "none" } as const;

/**
 * Сетка вещей для маленькой коллекции: 2 колонки на телефоне, 4 на компьютере, поля 20 px, кадры 2:3.
 * Под кадром название слева и цена справа (на телефоне — цена строкой ниже), при наведении второй кадр.
 * «Предзаказ» / «Нет в наличии» — серым в углу кадра. Вещь без съёмки — серая плитка с монограммой.
 */
export function RowGrid({ items, priority = 0 }: { items: CardProduct[]; priority?: number }) {
  const sizes = "(min-width: 768px) 25vw, 50vw";
  return (
    <div style={SANS} className="grid grid-cols-2 gap-x-2 gap-y-14 text-[0.82rem] md:grid-cols-4 md:gap-x-10 md:gap-y-32 md:px-5 md:text-[0.84rem]">
      {items.map((p, i) => {
        const shots = p.images.filter((s) => isRealPhoto(s.url));
        const soldOut = !p.isPreorder && !p.variants.some((v) => v.stock - v.reserved > 0);
        const label = soldOut ? "Нет в наличии" : p.isPreorder ? "Предзаказ" : null;
        return (
          <Link key={p.slug} href={`/product/${p.slug}`} className="group block">
            <div className="relative aspect-[2/3] overflow-hidden bg-[#f6f5f3]">
              {shots.length === 0 ? (
                <div className="flex h-full items-center justify-center" aria-hidden><MonogramMark className="text-[4rem] text-ink/20" /></div>
              ) : (
                <>
                  <Image src={shots[0].url} alt="" fill preload={i < priority} sizes={sizes} className={`object-cover ${shots[1] ? "transition-opacity duration-300 group-hover:opacity-0" : ""}`} />
                  {shots[1] && <Image src={shots[1].url} alt="" fill sizes={sizes} className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" />}
                </>
              )}
              {label && <span className="absolute left-2.5 top-2 bg-white/70 px-1.5 py-0.5 text-[#6f6f6f]">{label}</span>}
            </div>
            <div className="flex flex-col gap-1 px-4 pt-4 md:flex-row md:justify-between md:gap-4 md:px-0 md:pt-6">
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
