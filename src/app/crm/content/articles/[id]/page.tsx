import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { PageTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/form";
import { ArticleForm } from "@/components/crm/content-forms";
import { deleteArticleAction } from "@/app/actions/crm-content";

export const metadata: Metadata = { title: "Статья" };

/** Значение для input[type=datetime-local] в локальном времени сервера. */
function toLocalInput(d: Date | null) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function ArticleEdit({ params }: PageProps<"/crm/content/articles/[id]">) {
  await requireSection("content");
  const { id } = await params;
  const [products, images] = await Promise.all([
    db.product.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true } }),
    db.productImage.findMany({ select: { url: true }, distinct: ["url"], orderBy: { url: "asc" } }),
  ]);
  const covers = images.map((i) => i.url);
  if (id === "new") {
    return (
      <div className="max-w-5xl">
        <PageTitle title="Новая статья">Статья появится в журнале, когда наступит дата публикации. Без даты она остаётся черновиком.</PageTitle>
        <div className="card p-6"><ArticleForm products={products} covers={covers} /></div>
      </div>
    );
  }
  const a = await db.article.findUnique({ where: { id }, include: { products: { select: { id: true } } } });
  if (!a) notFound();
  const live = !!a.publishedAt && a.publishedAt <= new Date();
  return (
    <div className="max-w-5xl space-y-6">
      <PageTitle
        eyebrow={a.category ?? "Статья"}
        title={a.title}
        actions={
          <>
            <Link href="/crm/content?tab=journal" className="btn-ghost btn-sm">← Все статьи</Link>
            {live && <Link href={`/journal/${a.slug}`} target="_blank" className="btn-ghost btn-sm">На сайте ↗</Link>}
          </>
        }
      />
      <div className="card p-6">
        <ArticleForm
          article={{ ...a, publishedAt: toLocalInput(a.publishedAt), productIds: a.products.map((p) => p.id) }}
          products={products}
          covers={covers}
        />
      </div>
      <form action={deleteArticleAction} className="flex justify-end">
        <input type="hidden" name="id" value={a.id} />
        <ConfirmButton className="text-xs text-danger underline" message="Удалить статью? Это действие нельзя отменить.">Удалить статью</ConfirmButton>
      </form>
    </div>
  );
}
