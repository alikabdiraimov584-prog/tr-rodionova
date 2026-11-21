"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { addToCartAction } from "@/app/actions/shop";
import { subscribeStockAction } from "@/app/actions/waitlist";
import { trackGoal } from "@/lib/metrika-client";

type V = { id: string; size: string; color: string | null; colorHex: string | null; available: number };

/**
 * Выбор цвета и размера и кнопка покупки; children — дополнительная кнопка справа от неё (избранное).
 * Размер заранее не выбирается (кроме единственного или подсказанного по меркам): покупательница выбирает его сама,
 * иначе в корзину молча уходит первый размер в наличии и растут возвраты.
 */
export function AddToCart({ slug, variants, preorder = false, defaultSize, defaultColor, children }: { slug: string; variants: V[]; loggedIn?: boolean; preorder?: boolean; defaultSize?: string | null; defaultColor?: string | null; children?: React.ReactNode }) {
  const colors = [...new Map(variants.map((v) => [v.color ?? "", v])).values()];
  const [color, setColor] = useState((colors.find((c) => defaultColor && c.color === defaultColor) ?? colors[0])?.color ?? "");
  const sizes = variants.filter((v) => (v.color ?? "") === color);
  const can = (v: V) => preorder || v.available > 0;
  const initial = sizes.find((s) => defaultSize && s.size === defaultSize && can(s)) ?? (sizes.length === 1 && can(sizes[0]) ? sizes[0] : undefined);
  const [variantId, setVariantId] = useState<string>(initial?.id ?? "");
  const [state, action, pending] = useActionState(addToCartAction, undefined);
  const [wait, waitAction, waitPending] = useActionState(subscribeStockAction, undefined);
  const selected = variants.find((v) => v.id === variantId);
  // цели Метрики: вещь в корзине, подписка на поступление размера
  useEffect(() => { if (state?.ok) trackGoal("cart", { product: slug }); }, [state, slug]);
  useEffect(() => { if (wait?.ok) trackGoal("waitlist", { product: slug }); }, [wait, slug]);
  // ответ сервера относится к конкретному размеру и цвету: при выборе другого он не показывается
  const [answerFor, atMax] = (state?.code ?? "").split("|");
  const mine = !!variantId && answerFor === variantId;
  return (
    <div className="space-y-5">
      {colors.length > 0 && colors[0].color && (
        <div>
          <div className="label">Цвет: <span className="normal-case tracking-normal text-ink">{color}</span></div>
          {/* один цвет — только подпись: кружок выбирать не из чего, а кнопка покупки поднимается выше */}
          {colors.length > 1 && <div className="flex gap-1">
            {colors.map((c) => (
              <button
                key={c.color}
                type="button"
                title={c.color ?? ""}
                onClick={() => {
                  setColor(c.color ?? "");
                  // при смене цвета размер сохраняется, если он есть в новом цвете
                  const same = variants.find((v) => v.color === c.color && v.size === selected?.size && can(v));
                  setVariantId(same?.id ?? "");
                }}
                aria-label={`Цвет: ${c.color ?? ""}`}
                aria-pressed={color === c.color}
                className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
              >
                <span className={`block h-8 w-8 rounded-full border border-line ${color === c.color ? "ring-1 ring-ink ring-offset-2" : ""}`} style={{ background: c.colorHex ?? undefined }} />
              </button>
            ))}
          </div>}
        </div>
      )}
      <div>
        <div className="flex items-baseline justify-between">
          <div className="label" id={`size-${slug}`}>Размер{!selected && <span className="normal-case tracking-normal"> — выберите</span>}</div>
          <Link href="/sizes" className="-my-2 py-2 text-[0.72rem] text-muted underline underline-offset-4 hover:text-ink">Таблица размеров</Link>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`size-${slug}`}>
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
          <div id="buy-cta" className="flex gap-2">
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
          <div id="buy-cta" className="flex gap-2">
            <form action={action} className="flex-1">
              <input type="hidden" name="variantId" value={variantId} />
              <input type="hidden" name="slug" value={slug} />
              <button className="btn-primary w-full" disabled={pending || !variantId || (mine && atMax === "max")}>
                {pending ? "Добавляем…" : !variantId ? "Выберите размер" : mine && atMax === "max" ? "Уже в корзине" : mine && state?.ok ? "Добавить ещё" : preorder ? "Оформить предзаказ" : "Добавить в корзину"}
              </button>
            </form>
            {children}
          </div>
          {mine && state?.ok && (
            <div className="space-y-2" role="status">
              <p className="text-xs text-success">✓ {state.message}</p>
              <Link href="/cart" className="btn-outline w-full">Перейти в корзину</Link>
            </div>
          )}
          {mine && state?.error && <p className="text-xs text-danger" role="alert">{state.error}</p>}
        </div>
      )}
    </div>
  );
}
