import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/money";
import { isRealPhoto } from "@/lib/photos";
import { MonogramMark } from "@/components/brand-marks";

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
 * Карточка в сетке: фото, название антиквой и цена заглавными с разрядкой — как надпись и дескриптор логотипа.
 * На телефоне фото листаются свайпом прямо в сетке, на компьютере при наведении показывается второй кадр.
 * Вещь без съёмки — плитка айвори с бронзовой монограммой TR, без полосок листания.
 */
export function ProductCard({ p, priority = false }: { p: CardProduct; priority?: boolean }) {
  const soldOut = p.variants.length === 0 || (!p.variants.some((v) => v.stock - v.reserved > 0));
  const label = soldOut ? "Нет в наличии" : null;
  const shots = p.images.filter((i) => isRealPhoto(i.url)).slice(0, 4);
  const sizes = "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw";
  return (
    <Link href={`/product/${p.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden bg-sand">
        {shots.length === 0 ? (
          <div className="flex h-full items-center justify-center" aria-hidden>
            <MonogramMark className="text-[4.5rem] text-bronze/30" />
          </div>
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
        {label && <span className="absolute left-2.5 top-2.5 bg-ivory/90 px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-bronze-ink">{label}</span>}
      </div>
      <div className="px-2 pb-6 pt-3 text-center md:px-1">
        <div className="line-clamp-2 font-serif text-[1rem] font-light leading-snug transition-colors group-hover:opacity-60 md:text-[1.08rem]">{p.name}</div>
        <div className="mt-1.5 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-muted-dark">
          {p.compareAt && <s className="mr-2 text-muted"><span className="sr-only">Было </span>{formatMoney(p.compareAt)}</s>}
          {formatMoney(p.price)}
        </div>
      </div>
    </Link>
  );
}
