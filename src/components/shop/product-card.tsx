import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/money";

export type CardProduct = {
  slug: string;
  name: string;
  price: number;
  compareAt: number | null;
  isNew: boolean;
  images: { url: string; alt: string | null }[];
  variants: { colorHex: string | null; color: string | null; stock: number; reserved: number }[];
};

export function ProductCard({ p }: { p: CardProduct }) {
  const colors = [...new Map(p.variants.filter((v) => v.colorHex).map((v) => [v.colorHex, v])).values()];
  const soldOut = p.variants.every((v) => v.stock - v.reserved <= 0);
  const [first, second] = p.images;
  return (
    <Link href={`/product/${p.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-sand">
        {first && <Image src={first.url} alt={first.alt ?? p.name} fill unoptimized sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition-opacity duration-500 group-hover:opacity-0" />}
        {second && <Image src={second.url} alt={second.alt ?? p.name} fill unoptimized sizes="(min-width: 768px) 25vw, 50vw" className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}
        <div className="absolute left-3 top-3 flex gap-1.5">
          {p.isNew && <span className="bg-ivory px-2 py-1 text-[0.58rem] uppercase tracking-[0.2em]">New</span>}
          {soldOut && <span className="bg-ink px-2 py-1 text-[0.58rem] uppercase tracking-[0.2em] text-ivory">Sold out</span>}
        </div>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm">{p.name}</div>
          <div className="mt-1 flex gap-1">
            {colors.map((c) => (
              <span key={c.colorHex} title={c.color ?? ""} className="h-2.5 w-2.5 rounded-full border border-line" style={{ background: c.colorHex ?? undefined }} />
            ))}
          </div>
        </div>
        <div className="text-right text-sm">
          {formatMoney(p.price)}
          {p.compareAt && <div className="text-xs text-muted line-through">{formatMoney(p.compareAt)}</div>}
        </div>
      </div>
    </Link>
  );
}
