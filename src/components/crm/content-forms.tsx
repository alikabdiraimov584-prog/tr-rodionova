"use client";

import { useActionState } from "react";
import { addLookItemAction, saveArticleAction, saveLookAction } from "@/app/actions/crm-content";

function Msg({ s }: { s: { error?: string; message?: string } | undefined }) {
  if (s?.error) return <span className="text-xs text-danger">{s.error}</span>;
  if (s?.message) return <span className="text-xs text-success">{s.message}</span>;
  return null;
}

type LookData = { id?: string; title?: string; slug?: string; season?: string | null; description?: string | null; coverUrl?: string | null; isPublished?: boolean; order?: number };

export function LookForm({ look, covers }: { look?: LookData; covers: string[] }) {
  const [state, action, pending] = useActionState(saveLookAction, undefined);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {look?.id && <input type="hidden" name="id" value={look.id} />}
      <label><span className="label">Название</span><input name="title" defaultValue={look?.title} required className="input" /></label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_120px_90px]">
        <label className="col-span-2 sm:col-span-1"><span className="label">Адрес страницы</span><input name="slug" defaultValue={look?.slug} placeholder="авто" className="input" /></label>
        <label><span className="label">Сезон</span><input name="season" defaultValue={look?.season ?? ""} placeholder="AW26" className="input" /></label>
        <label><span className="label">Порядок</span><input name="order" type="number" min={0} defaultValue={look?.order ?? 0} className="input" /></label>
      </div>
      <label className="md:col-span-2"><span className="label">Описание</span><textarea name="description" defaultValue={look?.description ?? ""} rows={3} className="input" /></label>
      <label className="md:col-span-2">
        <span className="label">Обложка — URL изображения</span>
        <input name="coverUrl" list="look-covers" defaultValue={look?.coverUrl ?? ""} placeholder="/images/placeholder/coat.svg" className="input font-mono text-xs" />
        <datalist id="look-covers">{covers.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <div className="flex flex-wrap items-center gap-6 md:col-span-2">
        <label className="flex gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked={look?.isPublished ?? true} className="accent-black" /> Опубликован</label>
        <button className="btn-primary" disabled={pending}>{look?.id ? "Сохранить" : "Создать образ"}</button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function LookItemAddForm({ lookId, products }: { lookId: string; products: { id: string; name: string; sku: string }[] }) {
  const [state, action, pending] = useActionState(addLookItemAction, undefined);
  return (
    <form action={action} className="grid gap-2 md:grid-cols-[1.4fr_1fr_auto]">
      <input type="hidden" name="lookId" value={lookId} />
      <select aria-label="Товар" name="productId" defaultValue="" className="input py-2" required>
        <option value="">Выберите товар</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
      </select>
      <input name="note" placeholder="Заметка: «в комплекте с ремнём»" className="input py-2" />
      <button className="btn-outline btn-sm" disabled={pending}>Добавить</button>
      <div className="md:col-span-3"><Msg s={state} /></div>
    </form>
  );
}

type ArticleData = {
  id?: string; title?: string; slug?: string; excerpt?: string | null; category?: string | null; coverUrl?: string | null; body?: string; publishedAt?: string | null; productIds?: string[];
  metaTitle?: string | null; metaDescription?: string | null; keywords?: string[];
};

export const ARTICLE_CATEGORIES = ["Уход", "Ткани", "Ателье", "Интервью", "Стиль"];

export function ArticleForm({ article, products, covers }: { article?: ArticleData; products: { id: string; name: string; sku: string }[]; covers: string[] }) {
  const [state, action, pending] = useActionState(saveArticleAction, undefined);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {article?.id && <input type="hidden" name="id" value={article.id} />}
      <label><span className="label">Заголовок</span><input name="title" defaultValue={article?.title} required className="input" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="label">Адрес страницы</span><input name="slug" defaultValue={article?.slug} placeholder="авто" className="input" /></label>
        <label>
          <span className="label">Рубрика</span>
          <input name="category" list="article-categories" defaultValue={article?.category ?? ""} className="input" />
          <datalist id="article-categories">{ARTICLE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
      </div>
      <label className="md:col-span-2"><span className="label">Лид (короткое описание)</span><textarea name="excerpt" defaultValue={article?.excerpt ?? ""} rows={2} className="input" /></label>
      <label>
        <span className="label">Обложка — URL изображения</span>
        <input name="coverUrl" list="article-covers" defaultValue={article?.coverUrl ?? ""} placeholder="/images/placeholder/hero.svg" className="input font-mono text-xs" />
        <datalist id="article-covers">{covers.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label><span className="label">Дата публикации (пусто — черновик)</span><input name="publishedAt" type="datetime-local" defaultValue={article?.publishedAt ?? ""} className="input" /></label>
      <label className="md:col-span-2"><span className="label">Текст статьи — Markdown (## заголовки, **жирный**, списки через «- »)</span><textarea name="body" defaultValue={article?.body ?? ""} rows={18} required className="input font-mono text-xs leading-relaxed" /></label>
      <label className="md:col-span-2">
        <span className="label">Вещи из статьи (Ctrl/Cmd — несколько)</span>
        <select aria-label="Товары" name="productIds" multiple defaultValue={article?.productIds ?? []} className="input h-40">
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
        </select>
      </label>
      <fieldset className="grid gap-3 border border-line p-4 md:col-span-2 md:grid-cols-2">
        <legend className="label px-1">SEO (необязательно — иначе берутся заголовок и лид)</legend>
        <label><span className="label">Title для поисковиков (до 70 знаков)</span><input name="metaTitle" maxLength={70} defaultValue={article?.metaTitle ?? ""} className="input" /></label>
        <label><span className="label">Ключевые слова через запятую</span><input name="keywords" defaultValue={article?.keywords?.join(", ") ?? ""} className="input" /></label>
        <label className="md:col-span-2"><span className="label">Description (до 200 знаков)</span><textarea name="metaDescription" maxLength={200} rows={2} defaultValue={article?.metaDescription ?? ""} className="input" /></label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-6 md:col-span-2">
        <button className="btn-primary" disabled={pending}>{article?.id ? "Сохранить" : "Создать статью"}</button>
        <Msg s={state} />
      </div>
    </form>
  );
}
