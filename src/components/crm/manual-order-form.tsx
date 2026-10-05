"use client";

import { useActionState, useMemo, useState } from "react";
import { createManualOrderAction } from "@/app/actions/crm-orders";
import { formatMoney } from "@/lib/money";
import { DELIVERY_METHOD, PAYMENT_METHOD } from "@/lib/labels";

type Customer = { id: string; label: string; points: number; maxPayPct: number };
type Variant = { id: string; label: string; price: number; available: number };

export function ManualOrderForm({ customers, variants, presetCustomer }: { customers: Customer[]; variants: Variant[]; presetCustomer?: string }) {
  const [state, action, pending] = useActionState(createManualOrderAction, undefined);
  const [customerId, setCustomerId] = useState(presetCustomer ?? "");
  const [rows, setRows] = useState([{ variantId: "", qty: 1, price: "" }]);
  const [discount, setDiscount] = useState("");
  const [points, setPoints] = useState("");
  const vmap = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const customer = customers.find((c) => c.id === customerId);
  const subtotal = rows.reduce((s, r) => {
    const v = vmap.get(r.variantId);
    if (!v) return s;
    const price = r.price ? Math.round(parseFloat(r.price.replace(",", ".")) * 100) : v.price;
    return s + price * r.qty;
  }, 0);
  const disc = Math.round((parseFloat(discount.replace(",", ".")) || 0) * 100);
  const maxPoints = customer ? Math.min(customer.points, Math.floor(((subtotal - disc) * customer.maxPayPct) / 100 / 100)) : 0;
  const pts = Math.min(maxPoints, Number(points) || 0);
  const total = Math.max(0, subtotal - disc - pts * 100);

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <div className="card space-y-4 p-5">
          <div className="eyebrow">Покупатель</div>
          <select aria-label="Клиентка" name="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input">
            <option value="">Новый / без карты Circle</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {!customerId && (
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="firstName" placeholder="Имя" className="input" />
              <input name="phone" placeholder="Телефон" className="input" />
              <input name="email" placeholder="Email (необязательно)" className="input" />
            </div>
          )}
        </div>
        <div className="card space-y-3 p-5">
          <div className="eyebrow">Позиции</div>
          {rows.map((r, i) => {
            const v = vmap.get(r.variantId);
            return (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_80px_140px_auto]">
                <select name={`variant_${i}`} value={r.variantId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, variantId: e.target.value } : x)))} className="input">
                  <option value="">Выберите товар и размер</option>
                  {variants.map((v) => <option key={v.id} value={v.id} disabled={v.available <= 0}>{v.label} · {formatMoney(v.price)} · своб. {v.available}</option>)}
                </select>
                <input name={`qty_${i}`} type="number" min={1} max={v?.available ?? 10} value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))} className="input" />
                <input name={`price_${i}`} value={r.price} placeholder={v ? `${v.price / 100} ₽` : "Цена, ₽"} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} className="input" />
                <button type="button" className="btn-ghost btn-sm" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : rows)}>✕</button>
              </div>
            );
          })}
          {rows.length < 10 && <button type="button" className="btn-outline btn-sm" onClick={() => setRows([...rows, { variantId: "", qty: 1, price: "" }])}>+ Позиция</button>}
        </div>
        <div className="card grid gap-4 p-5 sm:grid-cols-2">
          <label><span className="label">Оплата</span>
            <select aria-label="Способ оплаты" name="paymentMethod" className="input" defaultValue="CARD">
              {Object.entries(PAYMENT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label><span className="label">Получение</span>
            <select aria-label="Способ доставки" name="deliveryMethod" className="input" defaultValue="PICKUP">
              {Object.entries(DELIVERY_METHOD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2"><span className="label">Адрес (если доставка)</span><input name="addressText" className="input" /></label>
          <label className="sm:col-span-2"><span className="label">Комментарий</span><input name="comment" className="input" /></label>
        </div>
      </div>
      <aside className="card h-fit space-y-4 p-5">
        <label className="block"><span className="label">Скидка, ₽</span><input name="discount" value={discount} onChange={(e) => setDiscount(e.target.value)} className="input" /></label>
        {customer && (
          <label className="block">
            <span className="label">Списать баллы · доступно {maxPoints.toLocaleString("ru-RU")}</span>
            <input name="pointsToUse" type="number" min={0} max={maxPoints} value={points} onChange={(e) => setPoints(e.target.value)} className="input" />
          </label>
        )}
        <dl className="space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt>Товары</dt><dd>{formatMoney(subtotal)}</dd></div>
          {disc > 0 && <div className="flex justify-between"><dt>Скидка</dt><dd>−{formatMoney(disc)}</dd></div>}
          {pts > 0 && <div className="flex justify-between"><dt>Баллами</dt><dd>−{formatMoney(pts * 100)}</dd></div>}
          <div className="flex justify-between text-lg"><dt className="serif">Итого</dt><dd>{formatMoney(total)}</dd></div>
        </dl>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="markPaid" defaultChecked className="accent-black" /> Оплачено сейчас (касса шоурума)</label>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Создаём…" : "Создать заказ"}</button>
      </aside>
    </form>
  );
}
