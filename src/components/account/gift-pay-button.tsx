"use client";

import { useActionState } from "react";
import { payGiftCardAction } from "@/app/actions/gift";

export function GiftPayButton({ cardId, live }: { cardId: string; live: boolean }) {
  const [state, action, pending] = useActionState(payGiftCardAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={cardId} />
      <button className="btn-primary" disabled={pending}>{pending ? "Переходим к оплате…" : live ? "Оплатить" : "Оплатить (демо)"}</button>
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
