"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { addToCartAction } from "@/app/actions/shop";

export type CartVariant = { id: string; size: string; color: string | null; available: number };
export type CartItem = { slug: string; name: string; recommendedId: string | null; variants: CartVariant[] };

/** Кнопка «Добавить в корзину» для одной вещи подборки с выбором размера (по умолчанию — рекомендованный). */
export function SelectionItemCart({ item }: { item: CartItem }) {
  const [state, action, pending] = useActionState(addToCartAction, undefined);
  const recommended = item.variants.find((v) => v.id === item.recommendedId);
  const [variantId, setVariantId] = useState(recommended && recommended.available > 0 ? recommended.id : item.variants.find((v) => v.available > 0)?.id ?? "");
  const selected = item.variants.find((v) => v.id === variantId);
  const none = item.variants.every((v) => v.available <= 0);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={item.slug} />
      <div className="flex flex-wrap items-center gap-2">
        <select name="variantId" value={variantId} onChange={(e) => setVariantId(e.target.value)} className="input w-auto py-2 text-xs" aria-label="Размер" disabled={none}>
          {item.variants.map((v) => (
            <option key={v.id} value={v.id} disabled={v.available <= 0}>
              {v.size}{v.color ? ` · ${v.color}` : ""}{v.id === item.recommendedId ? " — рекомендуем" : ""}{v.available <= 0 ? " — нет" : ""}
            </option>
          ))}
        </select>
        <button className="btn-primary btn-sm" disabled={pending || none || !selected || selected.available <= 0}>
          {pending ? "Добавляем…" : none ? "Нет в наличии" : "Добавить в корзину"}
        </button>
      </div>
      {state?.message && <p className="text-xs text-success">{state.message} · <Link href="/cart" className="underline">в корзину</Link></p>}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

/** «Добавить всё»: по очереди вызывает тот же addToCartAction с рекомендованным (или первым доступным) размером. */
export function AddAllButton({ items }: { items: CartItem[] }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const picks = items
    .map((i) => {
      const rec = i.variants.find((v) => v.id === i.recommendedId && v.available > 0);
      const v = rec ?? i.variants.find((x) => x.available > 0);
      return v ? { slug: i.slug, variantId: v.id } : null;
    })
    .filter((p): p is { slug: string; variantId: string } => !!p);
  if (picks.length === 0) return null;
  const run = () => {
    setPending(true);
    setResult(null);
    startTransition(async () => {
      let ok = 0;
      const errors: string[] = [];
      for (const p of picks) {
        const fd = new FormData();
        fd.set("slug", p.slug);
        fd.set("variantId", p.variantId);
        const r = await addToCartAction(undefined, fd);
        if (r?.ok) ok++;
        else if (r?.error) errors.push(r.error);
      }
      setResult(`В корзине: ${ok} из ${picks.length}${errors.length ? ` · ${errors[0]}` : ""}`);
      setPending(false);
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={run} className="btn-outline" disabled={pending}>{pending ? "Добавляем…" : `Добавить всё (${picks.length})`}</button>
      {result && <span className="text-xs text-success">{result} · <Link href="/cart" className="underline">в корзину</Link></span>}
    </div>
  );
}
