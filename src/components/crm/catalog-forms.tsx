"use client";

import { useActionState, useState } from "react";
import { addVariantAction, saveProductAction, stockOperationAction } from "@/app/actions/crm-catalog";

function Msg({ s }: { s: { error?: string; message?: string } | undefined }) {
  if (s?.error) return <span className="text-xs text-danger">{s.error}</span>;
  if (s?.message) return <span className="text-xs text-success">{s.message}</span>;
  return null;
}

type P = {
  id?: string; name?: string; sku?: string; slug?: string; price?: number; compareAt?: number | null; costPrice?: number | null;
  categoryId?: string | null; collectionId?: string | null; status?: string; description?: string | null; composition?: string | null;
  care?: string | null; madeIn?: string | null; isNew?: boolean; isFeatured?: boolean; images?: string[];
};

const rub = (k?: number | null) => (k ? String(k / 100) : "");

export function ProductForm({ p, categories, collections }: { p?: P; categories: { id: string; name: string }[]; collections: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveProductAction, undefined);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {p?.id && <input type="hidden" name="id" value={p.id} />}
      <label><span className="label">Название</span><input name="name" defaultValue={p?.name} required className="input" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="label">Артикул</span><input name="sku" defaultValue={p?.sku} required className="input" /></label>
        <label><span className="label">Адрес страницы</span><input name="slug" defaultValue={p?.slug} placeholder="авто" className="input" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label><span className="label">Цена, ₽</span><input name="price" defaultValue={rub(p?.price)} required className="input" /></label>
        <label><span className="label">Старая цена</span><input name="compareAt" defaultValue={rub(p?.compareAt)} className="input" /></label>
        <label><span className="label">Себестоимость</span><input name="costPrice" defaultValue={rub(p?.costPrice)} className="input" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label><span className="label">Категория</span>
          <select aria-label="Категория" name="categoryId" defaultValue={p?.categoryId ?? ""} className="input"><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label><span className="label">Коллекция</span>
          <select aria-label="Коллекция" name="collectionId" defaultValue={p?.collectionId ?? ""} className="input"><option value="">—</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label><span className="label">Статус</span>
          <select aria-label="Статус" name="status" defaultValue={p?.status ?? "DRAFT"} className="input"><option value="DRAFT">Черновик</option><option value="ACTIVE">В продаже</option><option value="ARCHIVED">Архив</option></select>
        </label>
      </div>
      <label className="md:col-span-2"><span className="label">Описание</span><textarea name="description" defaultValue={p?.description ?? ""} rows={3} className="input" /></label>
      <label><span className="label">Состав</span><input name="composition" defaultValue={p?.composition ?? ""} className="input" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="label">Уход</span><input name="care" defaultValue={p?.care ?? ""} className="input" /></label>
        <label><span className="label">Производство</span><input name="madeIn" defaultValue={p?.madeIn ?? "Europe"} className="input" /></label>
      </div>
      <label className="md:col-span-2"><span className="label">Фото — по одному URL в строке</span><textarea name="images" defaultValue={(p?.images ?? []).join("\n")} rows={3} className="input font-mono text-xs" /></label>
      <div className="flex flex-wrap items-center gap-6 md:col-span-2">
        <label className="flex gap-2 text-sm"><input type="checkbox" name="isNew" defaultChecked={p?.isNew} className="accent-black" /> Новинка</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="isFeatured" defaultChecked={p?.isFeatured} className="accent-black" /> На главной</label>
        <button className="btn-primary" disabled={pending}>{p?.id ? "Сохранить" : "Создать товар"}</button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function VariantForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(addVariantAction, undefined);
  return (
    <form action={action} className="grid gap-2 md:grid-cols-[80px_1fr_90px_1fr_110px_90px_auto]">
      <input type="hidden" name="productId" value={productId} />
      <input name="size" placeholder="Размер" className="input py-2" />
      <input name="color" placeholder="Цвет" className="input py-2" />
      <input name="colorHex" placeholder="#A89B8C" className="input py-2" />
      <input name="sku" placeholder="Артикул (авто)" className="input py-2" />
      <input name="price" placeholder="Цена, ₽" className="input py-2" />
      <input name="stock" type="number" min={0} placeholder="Приход" className="input py-2" />
      <button className="btn-outline btn-sm" disabled={pending}>Добавить</button>
      <div className="md:col-span-7"><Msg s={state} /></div>
    </form>
  );
}

export function StockOperationForm({ variants, preset }: { variants: { id: string; label: string }[]; preset?: string }) {
  const [state, action, pending] = useActionState(stockOperationAction, undefined);
  const [op, setOp] = useState("receipt");
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1.6fr_170px_110px_1fr_auto] md:items-end">
      <label><span className="label">Позиция</span>
        <select aria-label="Вариант" name="variantId" defaultValue={preset ?? ""} className="input py-2">
          <option value="">Выберите товар и размер</option>
          {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </label>
      <label><span className="label">Операция</span>
        <select aria-label="Операция" name="op" value={op} onChange={(e) => setOp(e.target.value)} className="input py-2">
          <option value="receipt">Приход</option>
          <option value="writeoff">Списание</option>
          <option value="adjust">Инвентаризация</option>
        </select>
      </label>
      <label><span className="label">{op === "adjust" ? "Факт, шт." : "Кол-во"}</span><input name="qty" type="number" min={0} required className="input py-2" /></label>
      <label><span className="label">{op === "receipt" ? "Себестоимость ед., ₽ / поставщик" : "Причина"}</span>
        <div className="flex gap-2">
          {op === "receipt" && <input name="unitCost" placeholder="по карточке" className="input w-32 py-2" />}
          <input name="reason" placeholder={op === "writeoff" ? "Брак, утеря, образец" : op === "receipt" ? "Ателье, партия" : "Пересчёт"} className="input py-2" />
        </div>
      </label>
      <button className="btn-primary btn-sm" disabled={pending}>Провести</button>
      {op === "receipt" && <label className="flex gap-2 text-xs text-muted md:col-span-5"><input type="checkbox" name="toLedger" className="accent-black" /> Записать затраты на пошив в финансы</label>}
      <div className="md:col-span-5"><Msg s={state} /></div>
    </form>
  );
}
