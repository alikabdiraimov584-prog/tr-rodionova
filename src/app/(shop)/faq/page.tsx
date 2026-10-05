import type { Metadata } from "next";
import Link from "next/link";
import { siteFaq } from "@/lib/faq";
import { JsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/seo";
import { TextPage } from "@/components/shop/page-shell";

export const metadata: Metadata = {
  title: "Вопросы и ответы",
  description: "Доставка и примерка курьером, возврат 14 дней, выбор размера, уход за шерстью и шёлком, программа Circle: короткие ответы на вопросы покупательниц T.Rodionova.",
};

export default async function FaqPage() {
  const groups = await siteFaq();
  const all = groups.flatMap((g) => g.items);
  return (
    <TextPage eyebrow="Покупателям" title="Вопросы и ответы" intro="Коротко о доставке, примерке, возврате, размерах, уходе и программе Circle. Если ответа нет, напишите в службу заботы: отвечаем в течение 15 минут в рабочее время.">
      <JsonLd data={[faqJsonLd(all.map(({ q, a }) => ({ q, a }))), breadcrumbJsonLd([{ name: "Главная", path: "/" }, { name: "Вопросы и ответы", path: "/faq" }])]} />
      {groups.map((g) => (
        <section key={g.group} className="border-t border-line pt-5">
          <h2 className="text-base">{g.group}</h2>
          <dl className="mt-4 space-y-5">
            {g.items.map((f) => (
              <div key={f.q}>
                <dt className="font-medium">{f.q}</dt>
                <dd className="mt-1 text-ink/85">
                  {f.a}
                  {f.href && <> <Link href={f.href} className="underline underline-offset-4">Подробнее</Link></>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </TextPage>
  );
}
