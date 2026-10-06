"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { checkoutAction, quoteAction, suggestAddressAction, type QuoteView } from "@/app/actions/shop";
import { formatMoney } from "@/lib/money";
import { DELIVERY_METHOD, PAYMENT_METHOD } from "@/lib/labels";
import type { DeliveryMethod, PaymentMethod } from "@/generated/prisma/enums";

type Address = { id: string; label: string | null; text: string; isDefault: boolean };
type Profile = { firstName: string; lastName: string | null; email: string; phone: string | null; pointsBalance: number; tierName: string | null; maxPayPct: number };

const SLOTS = ["10:00–14:00", "14:00–18:00", "18:00–22:00"];
const PRIMARY_DELIVERY: DeliveryMethod[] = ["COURIER", "CDEK"];
const STEPS = ["Доставка", "Оплата", "Проверка"] as const;

/**
 * Оформление в три шага: доставка → оплата → проверка. Все поля остаются в одной форме,
 * неактивные шаги скрыты; итог и кнопка закреплены внизу экрана на телефоне.
 * Гость заполняет контакты и даёт согласия: аккаунт Circle создаётся вместе с заказом.
 */
export function CheckoutForm({ profile, addresses, initialQuote, guest, showroom, suggestions }: { profile: Profile | null; addresses: Address[]; initialQuote: QuoteView; guest: boolean; showroom: string | null; suggestions: boolean }) {
  const [state, action, pending] = useActionState(checkoutAction, undefined);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<DeliveryMethod>("COURIER");
  const [moreDelivery, setMoreDelivery] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>("CARD");
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [addressText, setAddressText] = useState("");
  const [hints, setHints] = useState<{ value: string }[]>([]);
  const [promo, setPromo] = useState("");
  const [appliedPromo, setAppliedPromo] = useState("");
  const [gift, setGift] = useState("");
  const [appliedGift, setAppliedGift] = useState("");
  const [points, setPoints] = useState(0);
  const [quote, setQuote] = useState(initialQuote);
  const [quoting, startQuote] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);

  const deliveryMethods = (Object.keys(DELIVERY_METHOD) as DeliveryMethod[]).filter((m) => m !== "PICKUP" || showroom);
  const visibleDelivery = moreDelivery || !PRIMARY_DELIVERY.includes(delivery) ? deliveryMethods : deliveryMethods.filter((m) => PRIMARY_DELIVERY.includes(m));
  const needsAddress = delivery !== "PICKUP";
  const hasSlot = delivery === "COURIER" || delivery === "YANDEX";
  const canFit = delivery === "COURIER";

  useEffect(() => {
    startQuote(async () => {
      const q = await quoteAction({ deliveryMethod: delivery, promoCode: appliedPromo || undefined, pointsToUse: points, giftCode: appliedGift || undefined });
      setQuote(q);
    });
  }, [delivery, appliedPromo, points, appliedGift]);

  // подсказки адреса: запрос через 300 мс после последнего ввода
  function onAddressInput(value: string) {
    setAddressText(value);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    if (!suggestions || value.trim().length < 3) {
      setHints([]);
      return;
    }
    hintTimer.current = setTimeout(async () => setHints(await suggestAddressAction(value)), 300);
  }

  // проверка шага 1 перед переходом: браузерная валидация только видимых полей
  function next(e?: ReactMouseEvent) {
    e?.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const section = form.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const fields = section ? Array.from(section.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea, select")) : [];
    for (const f of fields) {
      if (!f.checkValidity()) {
        f.reportValidity();
        return;
      }
    }
    // адрес берём из поля, а не из состояния: текст, набранный до загрузки скриптов, не должен теряться
    const typedAddress = section?.querySelector<HTMLTextAreaElement>('textarea[name="addressText"]')?.value ?? addressText;
    if (typedAddress !== addressText) setAddressText(typedAddress);
    if (step === 0 && needsAddress && !addressId && typedAddress.trim().length < 5) {
      setStepError("Укажите адрес доставки");
      return;
    }
    setStepError(null);
    setStep(step + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const summaryRows = (
    <div className={quoting ? "opacity-60" : ""}>
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between"><dt>Товары</dt><dd>{formatMoney(quote.subtotal)}</dd></div>
      {quote.discount > 0 && <div className="flex justify-between text-success"><dt>Скидка по промокоду</dt><dd>−{formatMoney(quote.discount)}</dd></div>}
      {quote.pointsValue > 0 && <div className="flex justify-between text-success"><dt>Баллами</dt><dd>−{formatMoney(quote.pointsValue)}</dd></div>}
      <div className="flex justify-between"><dt>Доставка</dt><dd>{quote.delivery ? formatMoney(quote.delivery) : "бесплатно"}</dd></div>
      {quote.giftApplied > 0 && <div className="flex justify-between text-success"><dt>Сертификатом</dt><dd>−{formatMoney(quote.giftApplied)}</dd></div>}
      <div className="flex justify-between border-t border-line pt-3 text-lg"><dt className="serif">Итого</dt><dd>{formatMoney(quote.total)}</dd></div>
    </dl>
    {/* строка о баллах — вне списка: внутри dl допустимы только пары dt/dd */}
    <p className="mt-2 text-xs text-taupe-dark">+{quote.earn.toLocaleString("ru-RU")} баллов Circle через 14 дней после получения</p>
    </div>
  );

  return (
    <form ref={formRef} action={action} className="grid gap-8 md:grid-cols-[1fr_340px] md:gap-10 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        <ol className="grid grid-cols-3 gap-1 text-center text-[0.62rem] uppercase tracking-[0.12em]">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => i < step && setStep(i)} className={`block w-full ${i <= step ? "text-ink" : "text-muted"}`}>
                <span className={`block h-1 ${i <= step ? "bg-ink" : "bg-line"}`} />
                <span className="mt-2 block">{i + 1}. {s}</span>
              </button>
            </li>
          ))}
        </ol>

        {/* Шаг 1: контакты и доставка */}
        <section data-step="0" hidden={step !== 0} className="space-y-6">
          <div>
            <h2 className="mb-4">{guest ? "Кому доставить" : "Контакты"}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label">Имя</span><input name="firstName" defaultValue={profile?.firstName ?? ""} required autoComplete="given-name" className="input" /></label>
              <label><span className="label">Фамилия</span><input name="lastName" defaultValue={profile?.lastName ?? ""} autoComplete="family-name" className="input" /></label>
              <label><span className="label">Email</span><input name="email" type="email" defaultValue={profile?.email ?? ""} required autoComplete="email" className="input" /></label>
              <label><span className="label">Телефон</span><input name="phone" type="tel" defaultValue={profile?.phone ?? ""} required autoComplete="tel" placeholder="+7" className="input" /></label>
            </div>
            {guest && <p className="mt-2 text-xs text-muted">Пароль не нужен: аккаунт T.Rodionova Circle с 2 000 приветственных баллов создастся вместе с заказом. Уже покупали у нас? <Link href="/login?next=/checkout" className="text-ink underline">Войти</Link>, корзина сохранится.</p>}
          </div>

          <div>
            <h2 className="mb-4">Доставка</h2>
            <div className="grid gap-2">
              {visibleDelivery.map((m) => (
                <label key={m} className={`flex cursor-pointer items-start gap-3 border p-4 ${delivery === m ? "border-ink bg-white" : "border-line"}`}>
                  <input type="radio" name="deliveryMethod" value={m} checked={delivery === m} onChange={() => setDelivery(m)} className="mt-1 h-4 w-4 shrink-0 accent-black" />
                  <span>
                    <span className="block text-sm">{DELIVERY_METHOD[m].label}</span>
                    <span className="block text-xs text-muted">{m === "PICKUP" && showroom ? showroom : DELIVERY_METHOD[m].hint}</span>
                  </span>
                </label>
              ))}
              {!moreDelivery && visibleDelivery.length < deliveryMethods.length && (
                <button type="button" onClick={() => setMoreDelivery(true)} className="min-h-10 self-start text-[0.68rem] uppercase tracking-[0.15em] text-muted underline underline-offset-4">Другие способы</button>
              )}
            </div>
            {canFit && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 border border-line p-4 text-sm">
                <input type="checkbox" name="fittingRequested" value="on" defaultChecked className="mt-1 h-4 w-4 shrink-0 accent-black" />
                <span>
                  <span className="block">Примерка перед покупкой</span>
                  <span className="block text-xs text-muted">Курьер подождёт до 20 минут. Оплатите только то, что подошло: за остальное вернём деньги после возврата курьером.</span>
                </span>
              </label>
            )}
            {hasSlot && (
              <div className="mt-4">
                <span className="label">Удобный интервал</span>
                <div className="flex flex-wrap gap-2">
                  {SLOTS.map((slot, i) => (
                    <label key={slot} className="cursor-pointer">
                      <input type="radio" name="deliverySlot" value={slot} defaultChecked={i === 1} className="peer sr-only" />
                      <span className="inline-flex min-h-11 items-center border border-line bg-white px-4 text-sm peer-checked:border-ink peer-checked:bg-ink peer-checked:text-ivory">{slot}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {needsAddress && (
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
                  <div className="relative">
                    <label className="block">
                      <span className="label">{delivery === "CDEK" || delivery === "BOXBERRY" ? "Адрес или пункт выдачи" : "Адрес доставки"}</span>
                      <textarea name="addressText" rows={2} ref={addressRef} defaultValue={addressText} onChange={(e) => onAddressInput(e.target.value)} autoComplete="street-address" className="input" placeholder="Город, улица, дом, квартира, индекс" />
                    </label>
                    {hints.length > 0 && (
                      <ul className="absolute inset-x-0 z-10 mt-1 border border-line bg-white text-sm shadow-lg">
                        {hints.map((h) => (
                          <li key={h.value}><button type="button" onClick={() => { setAddressText(h.value); if (addressRef.current) addressRef.current.value = h.value; setHints([]); }} className="block w-full px-3 py-2 text-left hover:bg-sand">{h.value}</button></li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Шаг 2: оплата, промокод, сертификат, баллы */}
        <section data-step="1" hidden={step !== 1} className="space-y-6">
          <div>
            <h2 className="mb-4">Оплата</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(PAYMENT_METHOD) as PaymentMethod[]).map((m) => (
                <label key={m} className={`flex cursor-pointer items-center gap-3 border p-4 text-sm ${payment === m ? "border-ink bg-white" : "border-line"}`}>
                  <input type="radio" name="paymentMethod" value={m} checked={payment === m} onChange={() => setPayment(m)} className="h-4 w-4 shrink-0 accent-black" />
                  {PAYMENT_METHOD[m]}
                </label>
              ))}
            </div>
          </div>
          <details className="border border-line bg-white p-4">
            <summary className="cursor-pointer text-sm">Промокод или подарочный сертификат</summary>
            <div className="mt-4 space-y-4">
              <div>
                <span className="label">Промокод</span>
                <div className="flex gap-2">
                  <input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} className="input" placeholder="WELCOME10" />
                  <button type="button" className="btn-outline btn-sm shrink-0" onClick={() => setAppliedPromo(promo)}>Применить</button>
                </div>
                {quote.promoError && appliedPromo && <p className="mt-1 text-xs text-danger">{quote.promoError}</p>}
                {quote.promoApplied && <p className="mt-1 text-xs text-success">Промокод {quote.promoApplied} применён</p>}
              </div>
              <div>
                <span className="label">Подарочный сертификат</span>
                <div className="flex gap-2">
                  <input value={gift} onChange={(e) => setGift(e.target.value.toUpperCase())} className="input min-w-0 font-mono" placeholder="TR-XXXX-XXXX-XXXX-XXXX" />
                  <button type="button" className="btn-outline btn-sm shrink-0" onClick={() => setAppliedGift(gift.trim())}>Применить</button>
                </div>
                {quote.giftError && appliedGift && <p className="mt-1 text-xs text-danger">{quote.giftError}</p>}
                {quote.giftCode && quote.giftApplied > 0 && <p className="mt-1 text-xs text-success">Сертификат {quote.giftCode} применён: −{formatMoney(quote.giftApplied)}</p>}
              </div>
            </div>
          </details>
          {profile && (
            <div>
              <span className="label">Оплатить баллами · баланс {profile.pointsBalance.toLocaleString("ru-RU")}</span>
              <div className="flex items-center gap-3">
                <input type="range" aria-label="Оплатить баллами" aria-valuetext={`${quote.pointsUsed.toLocaleString("ru-RU")} баллов`} min={0} max={quote.pointsMax} step={100} value={Math.min(points, quote.pointsMax)} onChange={(e) => setPoints(Number(e.target.value))} className="flex-1 accent-black" disabled={quote.pointsMax === 0} />
                <button type="button" className="min-h-10 px-2 text-[0.65rem] uppercase tracking-[0.15em] text-taupe-dark" onClick={() => setPoints(quote.pointsMax)}>Макс.</button>
              </div>
              <p className="mt-1 text-xs text-muted">До {profile.maxPayPct}% заказа на уровне {profile.tierName}. Списать: {quote.pointsUsed.toLocaleString("ru-RU")} из {quote.pointsMax.toLocaleString("ru-RU")}</p>
            </div>
          )}
          <label className="block">
            <span className="label">Комментарий к заказу</span>
            <textarea name="comment" rows={2} className="input" placeholder="Пожелания по примерке, код домофона" />
          </label>
        </section>

        {/* Шаг 3: проверка и подтверждение */}
        <section data-step="2" hidden={step !== 2} className="space-y-5">
          <h2>Проверьте заказ</h2>
          <ul className="space-y-2 text-sm">
            {quote.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-3"><span className="min-w-0">{l.productName}, {l.size}{l.color ? `, ${l.color}` : ""} × {l.quantity}{l.isPreorder ? " · предзаказ" : ""}</span><span className="shrink-0">{formatMoney(l.price * l.quantity)}</span></li>
            ))}
          </ul>
          <div className="border border-line bg-white p-4 text-sm">
            <div><span className="text-muted">Доставка: </span>{DELIVERY_METHOD[delivery].label}{needsAddress ? `, ${addressId ? addresses.find((a) => a.id === addressId)?.text ?? "" : addressText}` : ""}</div>
            <div><span className="text-muted">Оплата: </span>{PAYMENT_METHOD[payment]}</div>
            <button type="button" onClick={() => setStep(0)} className="mt-2 text-[0.68rem] uppercase tracking-[0.15em] underline underline-offset-4">Изменить</button>
          </div>
          <div className="md:hidden">{summaryRows}</div>
          {guest && (
            <div className="space-y-2">
              <label className="flex gap-2 py-1 text-xs text-muted">
                <input type="checkbox" name="consent" value="on" required className="mt-0.5 h-4 w-4 shrink-0 accent-black" />
                <span>Даю <Link href="/privacy#consent" target="_blank" className="underline">согласие на обработку персональных данных</Link></span>
              </label>
              <label className="flex gap-2 py-1 text-xs text-muted">
                <input type="checkbox" name="offer" value="on" required className="mt-0.5 h-4 w-4 shrink-0 accent-black" />
                <span>Принимаю условия <Link href="/offer" target="_blank" className="underline">публичной оферты</Link> и правила программы Circle</span>
              </label>
              <label className="flex gap-2 py-1 text-xs text-muted">
                <input type="checkbox" name="marketingConsent" value="on" className="mt-0.5 h-4 w-4 shrink-0 accent-black" />
                <span>Хочу получать новости о коллекциях и закрытых показах</span>
              </label>
            </div>
          )}
          {!guest && (
            <p className="text-[0.7rem] leading-relaxed text-muted">
              Нажимая кнопку, вы принимаете условия <a href="/offer" target="_blank" className="underline">публичной оферты</a>.
            </p>
          )}
        </section>

        {(stepError || state?.error) && (
          <p className="text-sm text-danger">
            {stepError ?? state?.error}
            {state?.code === "EXISTS" && <> <Link href="/login?next=/checkout" className="underline">Войти</Link></>}
          </p>
        )}
      </div>

      {/* Итог: справа на десктопе, закреплённая панель внизу на телефоне */}
      <aside className="hidden h-fit min-w-0 space-y-5 md:sticky md:top-32 md:block md:p-6 card">
        <h2>Ваш заказ</h2>
        {summaryRows}
        {step < 2 ? (
          <button key="next" type="button" onClick={next} className="btn-primary w-full">Далее</button>
        ) : (
          <button key="submit" type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Оформляем…" : "Подтвердить заказ"}</button>
        )}
      </aside>
      <input type="hidden" name="promoCode" value={quote.promoApplied ?? ""} />
      <input type="hidden" name="giftCode" value={quote.giftApplied > 0 && quote.giftCode ? quote.giftCode : ""} />
      <input type="hidden" name="pointsToUse" value={quote.pointsUsed} />
      <div style={{ bottom: "var(--consent-h, 0px)" }} className="fixed inset-x-0 z-30 border-t border-line bg-ivory/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.12em] text-muted">Итого</div>
            <div className={`text-lg ${quoting ? "opacity-60" : ""}`}>{formatMoney(quote.total)}</div>
          </div>
          {step < 2 ? (
            <button key="next-m" type="button" onClick={next} className="btn-primary min-w-40">Далее</button>
          ) : (
            <button key="submit-m" type="submit" className="btn-primary min-w-40" disabled={pending}>{pending ? "Оформляем…" : "Подтвердить"}</button>
          )}
        </div>
      </div>
      <div aria-hidden className="h-20 md:hidden" />
    </form>
  );
}
