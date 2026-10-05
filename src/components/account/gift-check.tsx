"use client";

import { useActionState } from "react";
import { checkGiftBalanceAction } from "@/app/actions/gift";

export function GiftCheck() {
  const [state, action, pending] = useActionState(checkGiftBalanceAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="gift-check-code" className="label">Проверить баланс по коду</label>
      <div className="flex gap-2">
        <input id="gift-check-code" name="code" className="input font-mono uppercase" placeholder="TR-XXXX-XXXX-XXXX-XXXX" required />
        <button className="btn-outline btn-sm whitespace-nowrap" disabled={pending}>{pending ? "…" : "Проверить"}</button>
      </div>
      {state?.message && <p className="text-xs text-success">{state.message}</p>}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
