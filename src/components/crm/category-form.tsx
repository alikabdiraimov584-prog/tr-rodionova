"use client";

import { useActionState } from "react";
import { createCategoryAction, saveCategoryAction } from "@/app/actions/crm-catalog";

type Cat = { id: string; slug: string; name: string; order: number; seoTitle: string | null; seoDescription: string | null; seoText: string | null; faq: { q: string; a: string }[] };

export function CategoryForm({ c }: { c: Cat }) {
  const [state, action, pending] = useActionState(saveCategoryAction, undefined);
  const faqText = c.faq.map((f) => `${f.q}\n${f.a}`).join("\n\n");
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={c.id} />
      <label><span className="label">Название</span><input name="name" defaultValue={c.name} required className="input py-2" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="label">Адрес (slug)</span><input name="slug" defaultValue={c.slug} className="input py-2 font-mono text-xs" /></label>
        <label><span className="label">Порядок в меню</span><input name="order" type="number" defaultValue={c.order} className="input py-2" /></label>
      </div>
      <label><span className="label">SEO title (до 70)</span><input name="seoTitle" maxLength={70} defaultValue={c.seoTitle ?? ""} placeholder={`${c.name} — купить в T.Rodionova`} className="input py-2" /></label>
      <label><span className="label">SEO description (до 200)</span><input name="seoDescription" maxLength={200} defaultValue={c.seoDescription ?? ""} className="input py-2" /></label>
      <label className="md:col-span-2"><span className="label">Текст под каталогом — Markdown (про крой, ткани, с чем носить; 300–600 слов под поисковые запросы)</span><textarea name="seoText" rows={8} defaultValue={c.seoText ?? ""} className="input font-mono text-xs leading-relaxed" /></label>
      <label className="md:col-span-2"><span className="label">Вопросы и ответы: вопрос на одной строке, ответ на следующей, пары через пустую строку</span><textarea name="faq" rows={6} defaultValue={faqText} placeholder={"Как подобрать размер жакета?\nИзмерьте обхват груди…\n\nМожно ли примерить перед покупкой?\nДа, курьером в Москве и Петербурге."} className="input font-mono text-xs leading-relaxed" /></label>
      <div className="flex items-center gap-4 md:col-span-2">
        <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
        {state?.ok && <span className="text-sm text-success">{state.message}</span>}
      </div>
    </form>
  );
}

/** Новая категория — одно поле: адрес латиницей и место в меню подставляются сами. */
export function NewCategoryForm() {
  const [state, action, pending] = useActionState(createCategoryAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="w-full sm:w-72"><span className="label">Название</span><input name="name" required maxLength={60} placeholder="Например, Пальто" className="input py-2" /></label>
      <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Добавляем…" : "Добавить категорию"}</button>
      {state?.error && <span className="w-full text-sm text-danger" role="alert">{state.error}</span>}
      {state?.ok && <span className="w-full text-sm text-success" role="status">{state.message}</span>}
    </form>
  );
}
