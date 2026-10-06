"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { addToCartAction } from "@/app/actions/shop";
import { subscribeStockAction } from "@/app/actions/waitlist";

type V = { id: string; size: string; color: string | null; colorHex: string | null; available: number };

/** Выбор цвета и размера и кнопка покупки; children — дополнительная кнопка справа от неё (избранное). */
export function AddToCart({ slug, variants, preorder = false, children }: { slug: string; variants: V[]; loggedIn?: boolean; preorder?: boolean; children?: React.ReactNode }) {
  const colors = [...new Map(variants.map((v) => [v.color ?? "", v])).values()];
  const [color, setColor] = useState(colors[0]?.color ?? "");
  const sizes = variants.filter((v) => (v.color ?? "") === color);
  const [variantId, setVariantId] = useState<string>((preorder ? sizes[0] : sizes.find((s) => s.available > 0))?.id ?? "");
  const [state, action, pending] = useActionState(addToCartAction, undefined);
  const [wait, waitAction, waitPending] = useActionState(subscribeStockAction, undefined);
  const selected = variants.find((v) => v.id === variantId);
  return (
    <div className="space-y-5">
      {colors.length > 0 && colors[0].color && (
        <div>
          <div className="label">Цвет: <span className="normal-case tracking-normal text-ink">{color}</span></div>
          <div className="flex gap-2">
            {colors.map((c) => (
              <button
                key={c.color}
                type="button"
                title={c.color ?? ""}
                onClick={() => {
                  setColor(c.color ?? "");
                  setVariantId(variants.find((v) => v.color === c.color && (preorder || v.available > 0))?.id ?? "");
                }}
                aria-label={`Цвет: ${c.color ?? ""}`}
                aria-pressed={color === c.color}
                className={`h-9 w-9 rounded-full border ${color === c.color ? "outline outline-1 outline-offset-2 outline-ink border-line" : "border-line"}`}
                style={{ background: c.colorHex ?? undefined }}
              />
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="flex items-baseline justify-between"><div className="label">Размер</div><Link href="/sizes" className="text-[0.72rem] text-muted underline underline-offset-4 hover:text-ink">Таблица размеров</Link></div>
        <div className="flex flex-wrap gap-1.5">
          {sizes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setVariantId(s.id)}
              aria-pressed={variantId === s.id}
              className={`min-w-12 min-h-11 border px-3 py-2 text-[0.85rem] transition-colors ${variantId === s.id ? "border-ink bg-ink text-ivory" : "border-line bg-white hover:border-ink"} ${s.available <= 0 && !preorder ? "text-muted line-through" : ""}`}
            >
              {s.size}
            </button>
          ))}
        </div>
        {selected && !preorder && selected.available > 0 && selected.available <= 2 && <div className="mt-2 text-xs text-warning">Осталось {selected.available} шт.</div>}
      </div>
      {selected && selected.available <= 0 && !preorder ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <form action={waitAction} className="flex-1">
              <input type="hidden" name="variantId" value={selected.id} />
              <input type="hidden" name="slug" value={slug} />
              <button className="btn-outline w-full" disabled={waitPending}>Сообщить о поступлении</button>
            </form>
            {children}
          </div>
          {wait?.message && <p className="text-xs text-success">{wait.message}</p>}
          {wait?.error && <p className="text-xs text-danger">{wait.error}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <form action={action} className="flex-1">
              <input type="hidden" name="variantId" value={variantId} />
              <input type="hidden" name="slug" value={slug} />
              <button className="btn-primary w-full" disabled={pending || !variantId}>
                {pending ? "Добавляем…" : preorder ? "Оформить предзаказ" : "Добавить в корзину"}
              </button>
            </form>
            {children}
          </div>
          {state?.message && (
            <p className="text-xs text-success">
              {state.message} · <Link href="/cart" className="underline">Перейти в корзину</Link>
            </p>
          )}
          {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        </div>
      )}
    </div>
  );
}
