"use client";

import { useActionState } from "react";
import { requestExchangeAction } from "@/app/actions/shop";

export function ExchangeForm({ orderItemId, currentSize, sizes }: { orderItemId: string; currentSize: string; sizes: string[] }) {
  const [state, action, pending] = useActionState(requestExchangeAction, undefined);
  const options = sizes.filter((s) => s !== currentSize);
  if (options.length === 0) return null;
  if (state?.ok) return <p className="mt-2 text-xs text-success">{state.message}</p>;
  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <span className="text-muted">Обменять размер на</span>
      <select name="size" className="min-h-10 border border-line bg-white px-2" defaultValue={options[0]}>
        {options.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <button className="btn-outline btn-sm" disabled={pending}>{pending ? "…" : "Запросить обмен"}</button>
      {state?.error && <span className="text-danger">{state.error}</span>}
    </form>
  );
}
