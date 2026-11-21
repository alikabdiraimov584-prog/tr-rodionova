"use client";

import { useActionState, useState } from "react";
import { buyGiftCardAction } from "@/app/actions/gift";

export function GiftForm({ presets, minRub, validityMonths }: { presets: readonly number[]; minRub: number; validityMonths: number }) {
  const [state, action, pending] = useActionState(buyGiftCardAction, undefined);
  const [amount, setAmount] = useState<string>(String(presets[1] ?? presets[0]));
  const [custom, setCustom] = useState("");
  return (
    <form action={action} className="space-y-8">
      <section>
        <div className="label">Номинал</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {presets.map((p) => (
            <label key={p} className={`flex cursor-pointer items-center justify-center border px-3 py-4 text-sm ${amount === String(p) ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>
              <input type="radio" name="amount" value={String(p)} checked={amount === String(p)} onChange={() => setAmount(String(p))} className="sr-only" />
              {p.toLocaleString("ru-RU")} ₽
            </label>
          ))}
          <label className={`flex cursor-pointer items-center justify-center border px-3 py-4 text-sm ${amount === "custom" ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>
            <input type="radio" name="amount" value="custom" checked={amount === "custom"} onChange={() => setAmount("custom")} className="sr-only" />
            Своя сумма
          </label>
        </div>
        {amount === "custom" && (
          <label className="mt-3 block sm:w-60">
            <span className="label">Сумма, ₽ (от {minRub.toLocaleString("ru-RU")})</span>
            <input name="customAmount" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d\s]/g, ""))} placeholder={String(minRub)} required className="input" />
          </label>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <label><span className="label">Имя получателя</span><input name="recipientName" className="input" placeholder="Мария" /></label>
        <label><span className="label">Email получателя</span><input name="recipientEmail" type="email" className="input" placeholder="maria@example.com" /></label>
        <label className="sm:col-span-2">
          <span className="label">Сообщение</span>
          <textarea name="message" rows={3} maxLength={500} className="input" placeholder="Несколько тёплых слов — мы добавим их в письмо получателю" />
        </label>
      </section>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={pending}>{pending ? "Создаём…" : "Перейти к оплате"}</button>
      <p className="text-[0.7rem] leading-relaxed text-muted">
        Сертификат действует {validityMonths} месяцев с момента оплаты, применяется к любому заказу на сайте и в шоуруме, остаток сохраняется на следующую покупку. Не обменивается на деньги.
      </p>
    </form>
  );
}
