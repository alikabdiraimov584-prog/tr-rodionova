import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { PageTitle } from "@/components/ui";
import { TemplateForm } from "@/components/crm/support-client";
import { ConfirmButton } from "@/components/form";
import { deleteTemplateAction } from "@/app/actions/support";

export const metadata: Metadata = { title: "Шаблоны ответов" };

export default async function TemplatesPage() {
  await requireSection("ordersEdit");
  const templates = await db.replyTemplate.findMany({ orderBy: [{ order: "asc" }, { title: "asc" }] });
  return (
    <div className="max-w-4xl">
      <PageTitle eyebrow="Поддержка" title="Шаблоны ответов" actions={<Link href="/crm/support" className="btn-ghost btn-sm">← К диалогам</Link>}>
        В окне ответа наберите команду и пробел, например «/доставка », или выберите шаблон из списка. Переменные: {"{имя} {уровень} {баллы} {заказ}"}.
      </PageTitle>
      <div className="card mb-6 p-5"><TemplateForm /></div>
      <div className="space-y-4">
        {templates.map((t) => (
          <div key={t.id} className="card p-5">
            <TemplateForm t={t} />
            <form action={deleteTemplateAction} className="mt-2">
              <input type="hidden" name="id" value={t.id} />
              <ConfirmButton message="Удалить шаблон?" className="text-xs text-muted hover:text-danger">Удалить</ConfirmButton>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
