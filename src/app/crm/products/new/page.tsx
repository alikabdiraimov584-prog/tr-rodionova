import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { PageTitle } from "@/components/ui";
import { ProductForm } from "@/components/crm/catalog-forms";

export const metadata: Metadata = { title: "Новый товар" };

export default async function NewProduct() {
  await requireSection("products");
  const [categories, collections] = await Promise.all([db.category.findMany({ orderBy: { order: "asc" } }), db.collection.findMany()]);
  return (
    <div className="max-w-5xl">
      <PageTitle title="Новый товар">После создания добавьте размеры и цвета — каждый вариант учитывается на складе отдельно.</PageTitle>
      <div className="card p-6"><ProductForm categories={categories} collections={collections} /></div>
    </div>
  );
}
