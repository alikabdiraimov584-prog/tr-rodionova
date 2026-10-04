"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { addToCartAction } from "@/app/actions/shop";
import { subscribeStockAction } from "@/app/actions/waitlist";

type V = { id: string; size: string; color: string | null; colorHex: string | null; available: number };

export function AddToCart({ slug, variants, loggedIn, preorder = false }: { slug: string; variants: V[]; loggedIn: boolean; preorder?: boolean }) {
  const colors = [...new Map(variants.map((v) => [v.color ?? "", v])).values()];
  const [color, setColor] = useState(colors[0]?.color ?? "");
  const sizes = variants.filter((v) => (v.color ?? "") === color);
  const [variantId, setVariantId] = useState<string>((preorder ? sizes[0] : sizes.find((s) => s.available > 0))?.id ?? "");
  const [state, action, pending] = useActionState(addToCartAction, undefined);
  const [wait, waitAction, waitPending] = useActionState(subscribeStockAction, undefined);
  const selected = variants.find((v) => v.id === variantId);
  return (
    <div className="space-y-6">
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
                className={`h-10 w-10 rounded-full border-2 ${color === c.color ? "border-ink" : "border-line"}`}
                style={{ background: c.colorHex ?? undefined }}
              />
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="label">Размер</div>
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setVariantId(s.id)}
              className={`min-w-12 min-h-11 border px-3 py-2 text-sm ${variantId === s.id ? "border-ink bg-ink text-ivory" : "border-line bg-white"} ${s.available <= 0 && !preorder ? "text-muted line-through" : ""}`}
            >
              {s.size}
            </button>
          ))}
        </div>
        {selected && !preorder && selected.available > 0 && selected.available <= 2 && <div className="mt-2 text-xs text-warning">Осталось {selected.available} шт.</div>}
      </div>
      {selected && selected.available <= 0 && !preorder ? (
        <form action={waitAction} className="space-y-2">
          <input type="hidden" name="variantId" value={selected.id} />
          <input type="hidden" name="slug" value={slug} />
          <button className="btn-outline w-full" disabled={waitPending}>Сообщить о поступлении</button>
          {wait?.message && <p className="text-xs text-success">{wait.message}</p>}
          {wait?.error && <p className="text-xs text-danger">{wait.error}</p>}
        </form>
      ) : (
        <form action={action} className="space-y-2">
          <input type="hidden" name="variantId" value={variantId} />
          <input type="hidden" name="slug" value={slug} />
          <button className="btn-primary w-full" disabled={pending || !variantId}>
            {pending ? "Добавляем…" : !loggedIn ? "Войти и добавить в корзину" : preorder ? "Оформить предзаказ" : "Добавить в корзину"}
          </button>
          {state?.message && (
            <p className="text-xs text-success">
              {state.message} · <Link href="/cart" className="underline">Перейти в корзину</Link>
            </p>
          )}
          {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
