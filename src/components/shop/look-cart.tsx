"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { addLookToCartAction } from "@/app/actions/lookbook";
import { formatMoney } from "@/lib/money";

export type LookCartItem = {
  productId: string;
  slug: string;
  name: string;
  price: number;
  image: string | null;
  note: string | null;
  variants: { id: string; size: string; color: string | null; available: number }[];
};

export function LookCart({ slug, items, loggedIn }: { slug: string; items: LookCartItem[]; loggedIn: boolean }) {
  const [state, action, pending] = useActionState(addLookToCartAction, undefined);
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.productId, i.variants.find((v) => v.available > 0)?.id ?? ""])),
  );
  const total = items.reduce((s, i) => s + (chosen[i.productId] ? i.price : 0), 0);
  const count = items.filter((i) => chosen[i.productId]).length;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="slug" value={slug} />
      <ul className="divide-y divide-line border-y border-line">
        {items.map((it) => {
          const inStock = it.variants.some((v) => v.available > 0);
          return (
            <li key={it.productId} className="flex gap-4 py-4">
              <Link href={`/product/${it.slug}`} className="relative block h-24 w-20 shrink-0 overflow-hidden bg-sand">
                {it.image && <Image src={it.image} alt={it.name} fill sizes="80px" className="object-cover" />}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/product/${it.slug}`} className="text-sm hover:underline underline-offset-4">{it.name}</Link>
                  <span className="whitespace-nowrap text-sm">{formatMoney(it.price)}</span>
                </div>
                {it.note && <p className="mt-1 text-xs text-muted">{it.note}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="label mb-0">Размер</span>
                  <select
                    name={`variant_${it.productId}`}
                    aria-label={`Размер: ${it.name}`}
                    value={chosen[it.productId] ?? ""}
                    onChange={(e) => setChosen((c) => ({ ...c, [it.productId]: e.target.value }))}
                    className="input w-auto py-1.5 text-xs"
                    disabled={!inStock}
                  >
                    <option value="">{inStock ? "Не добавлять" : "Нет в наличии"}</option>
                    {it.variants.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.available <= 0}>
                        {v.size}
                        {v.color ? ` · ${v.color}` : ""}
                        {v.available <= 0 ? " — нет" : v.available <= 2 ? ` — осталось ${v.available}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{count ? `${count} из ${items.length} вещей` : "Выберите размеры"}</span>
        <span>{formatMoney(total)}</span>
      </div>
      <button className="btn-primary w-full" disabled={pending || count === 0}>
        {pending ? "Добавляем…" : loggedIn ? "Добавить весь образ в корзину" : "Войти и добавить образ в корзину"}
      </button>
      {state?.message && (
        <p className="text-xs text-success">
          {state.message} · <Link href="/cart" className="underline">Перейти в корзину</Link>
        </p>
      )}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
