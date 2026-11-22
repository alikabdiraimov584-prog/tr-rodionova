"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { addToCartAction } from "@/app/actions/shop";
import { subscribeStockAction } from "@/app/actions/waitlist";
import { trackGoal } from "@/lib/metrika-client";

type V = { id: string; size: string; color: string | null; colorHex: string | null; available: number };

/**
 * Выбор цвета и размера и кнопка покупки; children — строка под кнопкой (избранное).
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
  // кнопки по образцу therow.com: тонкая рамка на всю ширину, обычный текст; при наведении заливка
  const btn = "flex min-h-12 w-full items-center justify-center border border-ink px-4 transition-colors hover:bg-ink hover:text-white disabled:border-line disabled:text-[#6f6f6f] disabled:hover:bg-transparent";
  if (!variants.length) return <div className="space-y-5"><p>Нет доступных размеров</p>{children}</div>;
  return (
    <div className="space-y-5">
      {colors.length > 0 && colors[0].color && (
        <div className="flex flex-wrap items-center gap-x-1">
          <span className="sr-only">Цвет:</span>
          {/* один цвет — квадрат и название без выбора; несколько — квадраты-кнопки */}
          {colors.length > 1 ? colors.map((c) => (
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
              className="flex h-11 w-9 items-center justify-center focus-visible:outline-2 focus-visible:outline-ink"
            >
              <span className={`block h-4 w-4 border ${color === c.color ? "border-ink outline outline-1 outline-offset-2 outline-ink" : "border-line"}`} style={{ background: c.colorHex ?? undefined }} />
            </button>
          )) : <span className="mr-2 block h-4 w-4 border border-ink outline outline-1 outline-offset-2 outline-ink" style={{ background: colors[0].colorHex ?? undefined }} aria-hidden />}
          <span className="ml-2">{color}</span>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between gap-4">
          <span className="sr-only" id={`size-${slug}`}>Размер</span>
          <div className="-ml-2 flex flex-wrap" role="group" aria-labelledby={`size-${slug}`}>
            {sizes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setVariantId(s.id)}
                aria-pressed={variantId === s.id}
                className={`min-h-11 min-w-10 px-2 underline-offset-[6px] transition-opacity hover:opacity-60 ${variantId === s.id ? "underline" : ""} ${s.available <= 0 && !preorder ? "text-[#a8a8a8] line-through" : ""}`}
              >
                {s.size}
              </button>
            ))}
          </div>
          <Link href="/sizes" className="shrink-0 py-2 underline underline-offset-4 hover:opacity-60">Таблица размеров</Link>
        </div>
        {selected && !preorder && selected.available > 0 && selected.available <= 2 && <div className="mt-1 text-[#6f6f6f]">Осталось {selected.available} шт.</div>}
      </div>
      {selected && selected.available <= 0 && !preorder ? (
        <div className="space-y-2">
          <form id="buy-cta" action={waitAction}>
            <input type="hidden" name="variantId" value={selected.id} />
            <input type="hidden" name="slug" value={slug} />
            <button className={btn} disabled={waitPending}>Сообщить о поступлении</button>
          </form>
          {wait?.message && <p className="text-xs text-success">{wait.message}</p>}
          {wait?.error && <p className="text-xs text-danger">{wait.error}</p>}
          {children}
        </div>
      ) : (
        <div className="space-y-2">
          <form id="buy-cta" action={action}>
            <input type="hidden" name="variantId" value={variantId} />
            <input type="hidden" name="slug" value={slug} />
            <button className={btn} disabled={pending || !variantId || (mine && atMax === "max")}>
              {pending ? "Добавляем…" : !variantId ? "Выберите размер" : mine && atMax === "max" ? "Уже в корзине" : mine && state?.ok ? "Добавить ещё" : preorder ? "Оформить предзаказ" : "Добавить в корзину"}
            </button>
          </form>
          {mine && state?.ok && (
            <p role="status">{state.message} · <Link href="/cart" className="underline underline-offset-4">Перейти в корзину</Link></p>
          )}
          {mine && state?.error && <p className="text-xs text-danger" role="alert">{state.error}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
