import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/money";
import { isRealPhoto } from "@/lib/photos";

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
 * Вещь без съёмки показывается спокойной плиткой с монограммой, без полосок листания.
 */
export function ProductCard({ p, priority = false }: { p: CardProduct; priority?: boolean }) {
  const soldOut = !p.isPreorder && !p.variants.some((v) => v.stock - v.reserved > 0);
  const label = soldOut ? "Нет в наличии" : p.isPreorder ? "Предзаказ" : null;
  const shots = p.images.filter((i) => isRealPhoto(i.url)).slice(0, 4);
  const sizes = "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw";
  return (
    <Link href={`/product/${p.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden bg-sand">
        {shots.length === 0 ? (
          // монограмма — украшение, поэтому псевдоэлементом: не читается диктором и не считается текстом для проверки контраста
          <div className="flex h-full items-center justify-center text-[1.4rem] tracking-[0.3em] text-ink/15 before:content-['TR']" aria-hidden />
        ) : (
          <>
            {/* телефон: кадры листаются свайпом. Лента скрыта от Tab и экранного диктора — имя ссылки берётся из подписи,
                иначе Chrome делает прокручиваемую ленту отдельной безымянной остановкой внутри ссылки */}
            {shots.length > 1 && (
              <div className="scroll-row flex h-full snap-x snap-mandatory overflow-x-auto md:hidden" tabIndex={-1} aria-hidden>
                {shots.map((img) => (
                  <div key={img.url} className="relative h-full w-full shrink-0 snap-start">
                    <Image src={img.url} alt="" fill sizes={sizes} className="object-cover" />
                  </div>
                ))}
              </div>
            )}
            {/* компьютер (и телефон, если кадр один): второй кадр при наведении. Предзагрузка только здесь; у ленты
                тот же sizes, поэтому на телефоне первый кадр ленты берёт тот же файл из предзагрузки, без второй загрузки */}
            <div className={`absolute inset-0 ${shots.length > 1 ? "hidden md:block" : ""}`}>
              <Image src={shots[0].url} alt="" fill preload={priority} sizes={sizes} className={`object-cover ${shots[1] ? "transition-opacity duration-500 group-hover:opacity-0" : ""}`} />
              {shots[1] && <Image src={shots[1].url} alt="" fill sizes={sizes} className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}
            </div>
            {shots.length > 1 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1 md:hidden" aria-hidden>
                {shots.map((s) => <span key={s.url} className="h-[2px] w-3.5 bg-white/85 shadow-[0_0_2px_rgba(0,0,0,0.35)]" />)}
              </div>
            )}
          </>
        )}
        {label && <span className="absolute left-2 top-2 bg-ivory/90 px-1.5 py-0.5 text-[0.62rem] uppercase tracking-[0.1em]">{label}</span>}
      </div>
      <div className="px-2 pb-5 pt-2.5 text-[0.8rem] leading-snug md:px-1">
        <div className="line-clamp-2">{p.name}</div>
        <div className="mt-0.5">
          {p.compareAt && <s className="mr-1.5 text-muted"><span className="sr-only">Было </span>{formatMoney(p.compareAt)}</s>}
          {formatMoney(p.price)}
        </div>
      </div>
    </Link>
  );
}
