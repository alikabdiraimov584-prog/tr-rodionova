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

export function ProductCard({ p }: { p: CardProduct }) {
  const colors = [...new Map(p.variants.filter((v) => v.colorHex).map((v) => [v.colorHex, v])).values()];
  const ORDER = ["XS", "S", "M", "L", "XL", "ONE"];
  const sizes = [...new Set(p.variants.map((v) => v.size))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const inStock = new Set(p.variants.filter((v) => v.stock - v.reserved > 0).map((v) => v.size));
  const soldOut = inStock.size === 0 && !p.isPreorder;
  const [first, second] = p.images;
  return (
    <Link href={`/product/${p.slug}`} className="group block border border-line bg-ivory">
      <div className="relative aspect-[3/4] overflow-hidden bg-sand">
        {first && <Image src={first.url} alt={first.alt ?? p.name} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover transition-opacity duration-300 group-hover:opacity-0" />}
        {second && <Image src={second.url} alt={second.alt ?? p.name} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" />}
        <div className="absolute left-2 top-2 flex gap-1 text-[0.58rem] uppercase tracking-[0.1em]">
          {p.isNew && <span className="bg-ivory px-1.5 py-0.5">Новое</span>}
          {p.isPreorder && <span className="bg-ivory px-1.5 py-0.5">Предзаказ</span>}
          {p.isPreloved && <span className="bg-ink px-1.5 py-0.5 text-ivory">Pre-loved</span>}
          {soldOut && <span className="bg-ink px-1.5 py-0.5 text-ivory">Нет в наличии</span>}
        </div>
      </div>
      <div className="px-3 pb-3 pt-2.5 text-[0.75rem]">
        <div className="flex items-start justify-between gap-2">
          <span>{p.name}</span>
          <span className="whitespace-nowrap text-right">
            {formatMoney(p.price)}
            {p.compareAt && <span className="ml-1 text-muted line-through">{formatMoney(p.compareAt)}</span>}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[0.62rem] tracking-[0.08em] text-muted">
          <span>{p.condition ?? sizes.map((s) => <span key={s} className={inStock.has(s) || p.isPreorder ? "" : "line-through opacity-50"}>{s} </span>)}</span>
          <span className="flex gap-1">{colors.map((c) => <span key={c.colorHex} title={c.color ?? ""} className="h-2.5 w-2.5 border border-line" style={{ background: c.colorHex ?? undefined }} />)}</span>
        </div>
      </div>
    </Link>
  );
}
