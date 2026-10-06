import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { Alert, Badge, Eyebrow, PageTitle } from "@/components/ui";
import { CategoryForm, NewCategoryForm } from "@/components/crm/category-form";
import { deleteCategoryAction, moveCategoryAction, toggleCategoryAction } from "@/app/actions/crm-catalog";
import { str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Категории каталога" };

const things = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "вещь" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "вещи" : "вещей"}`;

export default async function CategoriesPage({ searchParams }: PageProps<"/crm/products/categories">) {
  await requireSection("products");
  const sp = await searchParams;
  const deleted = str(sp.deleted);
  const [categories, counts] = await Promise.all([
    db.category.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } }),
    db.product.groupBy({ by: ["categoryId", "status", "hiddenWithCategory"], _count: { _all: true } }),
  ]);
  const count = (id: string, f: (r: (typeof counts)[number]) => boolean) => counts.filter((r) => r.categoryId === id && f(r)).reduce((s, r) => s + r._count._all, 0);
  return (
    <div className="space-y-6">
      <PageTitle title="Категории каталога" actions={<Link href="/crm/products" className="btn-outline btn-sm">К товарам</Link>}>
        Добавляйте, скрывайте и удаляйте категории, меняйте порядок в меню стрелками. Скрытая категория пропадает с сайта вместе со своими вещами и возвращается одной кнопкой.
      </PageTitle>
      {deleted && (
        <div role="status">
          <Alert tone="success">
            Категория «{deleted}» удалена.{" "}
            {Number(str(sp.n)) > 0 && (str(sp.to) ? `Её вещи (${str(sp.n)}) перенесены в «${str(sp.to)}».` : `Её вещи (${str(sp.n)}) остались без категории и видны в разделе «Все».`)}
          </Alert>
        </div>
      )}
      <div className="card p-5">
        <Eyebrow>Новая категория</Eyebrow>
        <div className="mt-3"><NewCategoryForm /></div>
      </div>
      <div className="card divide-y divide-line">
        {categories.map((c, i) => {
          const onSale = count(c.id, (r) => r.status === "ACTIVE");
          const hidden = count(c.id, (r) => r.hiddenWithCategory);
          const total = c._count.products;
          const others = categories.filter((o) => o.id !== c.id);
          return (
            <div key={c.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="flex gap-1">
                  <form action={moveCategoryAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="dir" value="up" /><button aria-label={`Выше: ${c.name}`} disabled={i === 0} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line hover:bg-sand disabled:opacity-30">↑</button></form>
                  <form action={moveCategoryAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="dir" value="down" /><button aria-label={`Ниже: ${c.name}`} disabled={i === categories.length - 1} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line hover:bg-sand disabled:opacity-30">↓</button></form>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    {c.name}
                    {c.isActive ? (onSale > 0 ? <Badge tone="success">на сайте</Badge> : <Badge>нет вещей в продаже</Badge>) : <Badge tone="warning">скрыта</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    /catalog?category={c.slug} · {total === 0 ? "пустая" : `${things(total)}, в продаже ${onSale}`}
                    {hidden > 0 && ` · скрыто вместе с категорией: ${hidden}`}
                    {c.isActive && onSale === 0 && " · в меню сайта появится с первой вещью в продаже"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={toggleCategoryAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="show" value={c.isActive ? "0" : "1"} />
                    <button className={c.isActive ? "btn-outline btn-sm" : "btn-primary btn-sm"} title={c.isActive ? (onSale > 0 ? `Вместе с ${things(onSale)} в продаже` : undefined) : hidden > 0 ? `Вернутся в продажу: ${things(hidden)}` : undefined}>
                      {c.isActive ? "Скрыть с сайта" : "Показать на сайте"}
                    </button>
                  </form>
                  <details className="relative">
                    <summary className="btn-ghost btn-sm cursor-pointer list-none text-danger [&::-webkit-details-marker]:hidden">Удалить</summary>
                    <form action={deleteCategoryAction} className="card absolute right-0 z-20 mt-2 w-[min(18rem,calc(100vw-3rem))] space-y-3 p-4 text-sm shadow-lg">
                      <input type="hidden" name="id" value={c.id} />
                      {total > 0 ? (
                        <label className="block">
                          <span className="label">Куда перенести {things(total)}</span>
                          <select name="moveTo" defaultValue="" className="input py-2">
                            <option value="">Оставить без категории</option>
                            {others.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isActive ? "" : " (скрыта)"}</option>)}
                          </select>
                        </label>
                      ) : (
                        <p className="text-muted">В категории нет вещей.</p>
                      )}
                      {hidden > 0 && <p className="text-xs text-muted">Скрытые вместе с категорией вещи ({hidden}) останутся черновиками.</p>}
                      <button className="btn-outline btn-sm w-full text-danger">Удалить «{c.name}»</button>
                    </form>
                  </details>
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted hover:text-ink">Название, адрес, SEO-текст и вопросы-ответы{c.seoText ? "" : " · текста нет"}</summary>
                <div className="mt-4">
                  <CategoryForm c={{ id: c.id, slug: c.slug, name: c.name, order: c.order, seoTitle: c.seoTitle, seoDescription: c.seoDescription, seoText: c.seoText, faq: Array.isArray(c.faq) ? (c.faq as { q: string; a: string }[]) : [] }} />
                </div>
              </details>
            </div>
          );
        })}
        {categories.length === 0 && <p className="p-5 text-sm text-muted">Категорий пока нет — добавьте первую выше.</p>}
      </div>
    </div>
  );
}
