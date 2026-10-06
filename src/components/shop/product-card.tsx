import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/money";

export type CardProduct = {
  slug: string;
  name: string;
  price: number;
  compareAt: number | null;
  isNew: boolean;
  isPreorder?: boolean;
  isPreloved?: boolean;
  condition?: string | null;
  images: { url: string; alt: string | null }[];
  variants: { size: string; colorHex: string | null; color: string | null; stock: number; reserved: number }[];
};

/**
 * Карточка в сетке, как у ACTE: только фото, название и цена. На телефоне фото листаются свайпом прямо в сетке,
 * на компьютере при наведении показывается второй кадр. Размеры, цвета и рамки убраны — они в карточке вещи.
 */
export function ProductCard({ p, priority = false }: { p: CardProduct; priority?: boolean }) {
  const soldOut = !p.isPreorder && !p.variants.some((v) => v.stock - v.reserved > 0);
  const label = p.isPreloved ? (p.condition ? `Pre-loved · ${p.condition}` : "Pre-loved") : soldOut ? "Нет в наличии" : p.isPreorder ? "Предзаказ" : p.isNew ? "Новое" : null;
  const shots = p.images.slice(0, 4);
  const sizes = "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw";
  return (
    <Link href={`/product/${p.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden bg-sand">
        {/* телефон: кадры листаются свайпом */}
        <div className="scroll-row flex h-full snap-x snap-mandatory overflow-x-auto md:hidden">
          {shots.map((img, i) => (
            <div key={img.url} className="relative h-full w-full shrink-0 snap-start">
              <Image src={img.url} alt={i === 0 ? img.alt ?? p.name : ""} fill priority={priority && i === 0} sizes="50vw" className="object-cover" />
            </div>
          ))}
        </div>
        {/* компьютер: второй кадр при наведении */}
        <div className="absolute inset-0 hidden md:block">
          {shots[0] && <Image src={shots[0].url} alt={shots[0].alt ?? p.name} fill priority={priority} sizes={sizes} className="object-cover transition-opacity duration-500 group-hover:opacity-0" />}
          {shots[1] && <Image src={shots[1].url} alt="" fill sizes={sizes} className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}
        </div>
        {shots.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1 md:hidden" aria-hidden>
            {shots.map((s) => <span key={s.url} className="h-[3px] w-3 bg-ivory/80" />)}
          </div>
        )}
      </div>
      <div className="px-1 pb-4 pt-2.5">
        {label && <div className="mb-0.5 text-[0.66rem] uppercase tracking-[0.1em] text-muted">{label}</div>}
        <div className="flex items-baseline justify-between gap-3 text-[0.8rem]">
          <span className="min-w-0 truncate">{p.name}</span>
          <span className="shrink-0 whitespace-nowrap">
            {p.compareAt && <span className="mr-1.5 text-muted line-through">{formatMoney(p.compareAt)}</span>}
            {formatMoney(p.price)}
          </span>
        </div>
      </div>
    </Link>
  );
}
