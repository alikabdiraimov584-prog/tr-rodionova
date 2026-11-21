"use client";

import { useActionState, useState } from "react";
import { leaveReviewAction } from "@/app/actions/shop";

export function ReviewForm({ productId, productName }: { productId: string; productName: string }) {
  const [state, action, pending] = useActionState(leaveReviewAction, undefined);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  if (state?.ok) return <p className="text-xs text-success">{state.message}</p>;
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="text-[0.65rem] uppercase tracking-[0.18em] text-taupe-dark hover:text-ink">Оставить отзыв · +300 баллов</button>;
  }
  return (
    <form action={action} className="mt-2 space-y-2 border border-line bg-ivory p-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="rating" value={rating} />
      <div className="text-xs text-muted">{productName}</div>
      <div className="flex gap-1 text-lg text-champagne-dark">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n}`}>{n <= rating ? "★" : "☆"}</button>
        ))}
      </div>
      <textarea name="text" rows={3} className="input" placeholder="Посадка, ткань, впечатления" />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <button className="btn-primary btn-sm" disabled={pending}>Отправить</button>
    </form>
  );
}
