"use client";

import { useActionState, useState } from "react";
import { addSelectionItemAction, createSelectionAction, updateSelectionAction } from "@/app/actions/crm-stylist";

function Msg({ s }: { s: { error?: string; message?: string } | undefined }) {
  if (s?.error) return <p className="text-xs text-danger">{s.error}</p>;
  if (s?.message) return <p className="text-xs text-success">{s.message}</p>;
  return null;
}

export function SelectionForm({ customerId, selection }: { customerId?: string; selection?: { id: string; title: string; note: string | null } }) {
  const [state, action, pending] = useActionState(selection ? updateSelectionAction : createSelectionAction, undefined);
  return (
    <form action={action} className="space-y-2">
      {selection ? <input type="hidden" name="id" value={selection.id} /> : <input type="hidden" name="customerId" value={customerId} />}
      <label className="block">
        <span className="label">Название</span>
        <input name="title" defaultValue={selection?.title ?? ""} className="input py-2" placeholder="Капсула на осень: офис и выходные" required />
      </label>
      <label className="block">
        <span className="label">Записка клиентке</span>
        <textarea name="note" rows={3} defaultValue={selection?.note ?? ""} className="input py-2" placeholder="Что объединяет вещи, с чем носить, почему именно эти" />
      </label>
      <button className={selection ? "btn-outline btn-sm" : "btn-primary btn-sm"} disabled={pending}>{selection ? "Сохранить" : "Создать подборку"}</button>
      <Msg s={state} />
    </form>
  );
}

export type PickProduct = { id: string; name: string; price: string; variants: { id: string; size: string; color: string | null; available: number }[] };

export function AddItemForm({ selectionId, products, preferredSize }: { selectionId: string; products: PickProduct[]; preferredSize: string | null }) {
  const [state, action, pending] = useActionState(addSelectionItemAction, undefined);
  const [productId, setProductId] = useState("");
  const product = products.find((p) => p.id === productId);
  const defaultVariant = product?.variants.find((v) => v.size === preferredSize && v.available > 0)?.id ?? "";
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="selectionId" value={selectionId} />
      <label className="block">
        <span className="label">Товар</span>
        <select name="productId" value={productId} onChange={(e) => setProductId(e.target.value)} className="input py-2" required>
          <option value="">Выберите из каталога</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.price}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Рекомендуемый размер{preferredSize ? ` (в профиле: ${preferredSize})` : ""}</span>
        <select key={productId} name="variantId" defaultValue={defaultVariant} className="input py-2" disabled={!product}>
          <option value="">Без рекомендации</option>
          {product?.variants.map((v) => (
            <option key={v.id} value={v.id}>{v.size}{v.color ? ` · ${v.color}` : ""}{v.available <= 0 ? " — нет в наличии" : ""}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Комментарий стилиста</span>
        <input name="comment" className="input py-2" placeholder="Почему эта вещь и с чем сочетать" />
      </label>
      <button className="btn-outline btn-sm" disabled={pending || !productId}>Добавить в подборку</button>
      <Msg s={state} />
    </form>
  );
}
