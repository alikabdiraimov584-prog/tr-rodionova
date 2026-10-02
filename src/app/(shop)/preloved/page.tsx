import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ProductCard } from "@/components/shop/product-card";
import { Empty, Eyebrow, PageTitle, Star } from "@/components/ui";
import { RESALE_CONDITIONS } from "@/lib/resale";

export const metadata: Metadata = { title: "Pre-loved — вещи с историей" };

export default async function PrelovedPage() {
  const [user, products] = await Promise.all([
    getCurrentUser(),
    db.product.findMany({
      where: { isPreloved: true, status: "ACTIVE" },
      include: { images: { orderBy: { order: "asc" } }, variants: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <PageTitle eyebrow="Circle · Re-love" title="Pre-loved">
        Вещи T.Rodionova, которые уже носили — и которым ещё долго жить. Каждая проверена в ателье бренда, почищена и описана честно. Один экземпляр, один размер.
      </PageTitle>

      <section className="mb-12 grid gap-px border border-line bg-line md:grid-cols-[1fr_1fr_auto]">
        <div className="bg-ivory p-6 text-sm">
          <Eyebrow>Состояние</Eyebrow>
          <ul className="mt-3 space-y-1.5">
            {RESALE_CONDITIONS.map((c) => (
              <li key={c.value} className="flex gap-2"><Star /><span><span className="text-ink">{c.label}</span> — <span className="text-muted">{c.hint}</span></span></li>
            ))}
          </ul>
        </div>
        <div className="bg-ivory p-6 text-sm">
          <Eyebrow>Как это работает</Eyebrow>
          <p className="mt-3 text-muted">Клиентки Circle предлагают вещи к выкупу, бренд возвращает до 30% цены баллами, а вещь после проверки попадает сюда. Покупка pre-loved — обычный заказ: доставка, примерка и возврат по общим правилам.</p>
        </div>
        <div className="flex flex-col justify-center gap-2 bg-ivory p-6">
          <Link href={user ? "/account/resale" : "/login?next=/account/resale"} className="btn-primary">Предложить свою вещь</Link>
          <Link href="/circle" className="btn-ghost">О программе Circle</Link>
        </div>
      </section>

      {products.length === 0 ? (
        <Empty title="Витрина пока пуста" action={<Link href="/catalog" className="btn-outline">В каталог</Link>}>
          Первые pre-loved вещи появятся, как только пройдут проверку в ателье. Загляните позже или предложите свою.
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <div key={p.id}>
              <ProductCard p={p} />
              <div className="mt-2 flex flex-wrap gap-x-3 text-[0.62rem] uppercase tracking-[0.18em] text-muted">
                <span className="text-ink">Pre-loved</span>
                {p.condition && <span>{p.condition}</span>}
                {p.variants[0] && <span>размер {p.variants[0].size}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
