"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { checkoutAction, quoteAction, type QuoteView } from "@/app/actions/shop";
import { formatMoney } from "@/lib/money";
import { DELIVERY_METHOD, PAYMENT_METHOD } from "@/lib/labels";
import type { DeliveryMethod, PaymentMethod } from "@/generated/prisma/enums";

type Address = { id: string; label: string | null; text: string; isDefault: boolean };
type Profile = { firstName: string; lastName: string | null; email: string; phone: string | null; pointsBalance: number; tierName: string | null; maxPayPct: number };

export function CheckoutForm({ profile, addresses, initialQuote }: { profile: Profile; addresses: Address[]; initialQuote: QuoteView }) {
  const [state, action, pending] = useActionState(checkoutAction, undefined);
  const [delivery, setDelivery] = useState<DeliveryMethod>("COURIER");
  const [payment, setPayment] = useState<PaymentMethod>("CARD");
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [promo, setPromo] = useState("");
  const [appliedPromo, setAppliedPromo] = useState("");
  const [points, setPoints] = useState(0);
  const [quote, setQuote] = useState(initialQuote);
  const [quoting, startQuote] = useTransition();

  useEffect(() => {
    startQuote(async () => {
      const q = await quoteAction({ deliveryMethod: delivery, promoCode: appliedPromo || undefined, pointsToUse: points });
      setQuote(q);
    });
  }, [delivery, appliedPromo, points]);

  return (
    <form action={action} className="grid gap-10 md:grid-cols-[1fr_380px]">
      <div className="space-y-10">
        <section>
          <h2 className="mb-4 text-2xl">Контакты</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="label">Имя</span><input name="firstName" defaultValue={profile.firstName} required className="input" /></label>
            <label><span className="label">Фамилия</span><input name="lastName" defaultValue={profile.lastName ?? ""} className="input" /></label>
            <label><span className="label">Email</span><input name="email" type="email" defaultValue={profile.email} required className="input" /></label>
            <label><span className="label">Телефон</span><input name="phone" defaultValue={profile.phone ?? ""} required className="input" /></label>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-2xl">Доставка</h2>
          <div className="grid gap-2">
            {(Object.keys(DELIVERY_METHOD) as DeliveryMethod[]).map((m) => (
              <label key={m} className={`flex cursor-pointer items-start gap-3 border p-4 ${delivery === m ? "border-ink bg-white" : "border-line"}`}>
                <input type="radio" name="deliveryMethod" value={m} checked={delivery === m} onChange={() => setDelivery(m)} className="mt-1 accent-black" />
                <span>
                  <span className="block text-sm">{DELIVERY_METHOD[m].label}</span>
                  <span className="block text-xs text-muted">{DELIVERY_METHOD[m].hint}</span>
                </span>
              </label>
            ))}
          </div>
          {delivery !== "PICKUP" && (
            <div className="mt-4 space-y-3">
              {addresses.length > 0 && (
                <label className="block">
                  <span className="label">Адрес из профиля</span>
                  <select name="addressId" value={addressId} onChange={(e) => setAddressId(e.target.value)} className="input">
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>{a.label ? `${a.label}: ` : ""}{a.text}</option>
                    ))}
                    <option value="">Другой адрес…</option>
                  </select>
                </label>
              )}
              {(!addressId || addresses.length === 0) && (
                <label className="block">
                  <span className="label">Адрес доставки</span>
                  <textarea name="addressText" rows={2} className="input" placeholder="Город, улица, дом, квартира, индекс" />
                </label>
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-2xl">Оплата</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(PAYMENT_METHOD) as PaymentMethod[]).map((m) => (
              <label key={m} className={`flex cursor-pointer items-center gap-3 border p-4 text-sm ${payment === m ? "border-ink bg-white" : "border-line"}`}>
                <input type="radio" name="paymentMethod" value={m} checked={payment === m} onChange={() => setPayment(m)} className="accent-black" />
                {PAYMENT_METHOD[m]}
              </label>
            ))}
          </div>
        </section>

        <section>
          <label className="block">
            <span className="label">Комментарий к заказу</span>
            <textarea name="comment" rows={2} className="input" placeholder="Удобное время доставки, пожелания по примерке" />
          </label>
        </section>
      </div>

      <aside className="card h-fit space-y-5 p-6 md:sticky md:top-32">
        <h2 className="text-2xl">Ваш заказ</h2>
        <div>
          <span className="label">Промокод</span>
          <div className="flex gap-2">
            <input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} className="input" placeholder="WELCOME10" />
            <button type="button" className="btn-outline btn-sm" onClick={() => setAppliedPromo(promo)}>Применить</button>
          </div>
          <input type="hidden" name="promoCode" value={quote.promoApplied ?? ""} />
          {quote.promoError && appliedPromo && <p className="mt-1 text-xs text-danger">{quote.promoError}</p>}
          {quote.promoApplied && <p className="mt-1 text-xs text-success">Промокод {quote.promoApplied} применён</p>}
        </div>
        <div>
          <span className="label">Оплатить баллами · баланс {profile.pointsBalance.toLocaleString("ru-RU")}</span>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={quote.pointsMax} step={100} value={Math.min(points, quote.pointsMax)} onChange={(e) => setPoints(Number(e.target.value))} className="flex-1 accent-black" disabled={quote.pointsMax === 0} />
            <button type="button" className="text-[0.65rem] uppercase tracking-[0.15em] text-taupe-dark" onClick={() => setPoints(quote.pointsMax)}>Макс.</button>
          </div>
          <input type="hidden" name="pointsToUse" value={quote.pointsUsed} />
          <p className="mt-1 text-xs text-muted">До {profile.maxPayPct}% заказа на уровне {profile.tierName}. Списать: {quote.pointsUsed.toLocaleString("ru-RU")} из {quote.pointsMax.toLocaleString("ru-RU")}</p>
        </div>
        <dl className={`space-y-2 border-t border-line pt-4 text-sm ${quoting ? "opacity-60" : ""}`}>
          <div className="flex justify-between"><dt>Товары</dt><dd>{formatMoney(quote.subtotal)}</dd></div>
          {quote.discount > 0 && <div className="flex justify-between text-success"><dt>Скидка по промокоду</dt><dd>−{formatMoney(quote.discount)}</dd></div>}
          {quote.pointsValue > 0 && <div className="flex justify-between text-success"><dt>Баллами</dt><dd>−{formatMoney(quote.pointsValue)}</dd></div>}
          <div className="flex justify-between"><dt>Доставка</dt><dd>{quote.delivery ? formatMoney(quote.delivery) : "бесплатно"}</dd></div>
          <div className="flex justify-between border-t border-line pt-3 text-lg"><dt className="serif">Итого</dt><dd>{formatMoney(quote.total)}</dd></div>
          <div className="text-xs text-taupe-dark">+{quote.earn.toLocaleString("ru-RU")} баллов через 14 дней после получения</div>
        </dl>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending || quoting}>{pending ? "Оформляем…" : "Подтвердить заказ"}</button>
        <p className="text-[0.7rem] leading-relaxed text-muted">
          Нажимая кнопку, вы принимаете условия <a href="/offer" target="_blank" className="underline">публичной оферты</a> и{" "}
          <a href="/privacy" target="_blank" className="underline">политики обработки персональных данных</a>.
        </p>
      </aside>
    </form>
  );
}
