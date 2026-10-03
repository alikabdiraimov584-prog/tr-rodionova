import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { PageTitle } from "@/components/ui";
import { CategoryForm } from "@/components/crm/category-form";

export const metadata: Metadata = { title: "Категории и SEO-тексты" };

export default async function CategoriesPage() {
  await requireSection("products");
  const categories = await db.category.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { products: true } } } });
  return (
    <div className="space-y-6">
      <PageTitle title="Категории каталога" actions={<Link href="/crm/products" className="btn-outline btn-sm">К товарам</Link>}>
        Название и порядок в меню, SEO-заголовок и описание, текст под каталогом и вопросы-ответы. Текст и FAQ показываются на странице категории и попадают в поисковую выдачу (FAQ — как структурированные данные).
      </PageTitle>
      {categories.map((c) => (
        <details key={c.id} className="card p-5" open={!c.seoText}>
          <summary className="cursor-pointer text-sm font-semibold">
            {c.name} <span className="font-normal text-muted">· /catalog?category={c.slug} · {c._count.products} товаров{c.seoText ? " · текст есть" : " · текста нет"}</span>
          </summary>
          <div className="mt-4">
            <CategoryForm c={{ id: c.id, slug: c.slug, name: c.name, order: c.order, seoTitle: c.seoTitle, seoDescription: c.seoDescription, seoText: c.seoText, faq: Array.isArray(c.faq) ? (c.faq as { q: string; a: string }[]) : [] }} />
          </div>
        </details>
      ))}
    </div>
  );
}
