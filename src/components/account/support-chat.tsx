"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendWebsiteMessageAction } from "@/app/actions/support";

export function SupportChatForm({ preset }: { preset?: string }) {
  const [state, action, pending] = useActionState(sendWebsiteMessageAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <textarea name="text" rows={3} defaultValue={preset} className="input" placeholder="Вопрос о заказе, размере, примерке…" />
      <div className="flex items-center gap-3">
        <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Отправляем…" : "Отправить"}</button>
        {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
