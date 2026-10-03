"use client";

import { useActionState } from "react";
import { payOrderAction } from "@/app/actions/payments";

export function PayButton({ orderId, live }: { orderId: string; live: boolean }) {
  const [state, action, pending] = useActionState(payOrderAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="orderId" value={orderId} />
      <button className="btn-primary" disabled={pending}>{pending ? "Переходим к оплате…" : live ? "Оплатить" : "Оплатить (демо)"}</button>
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
