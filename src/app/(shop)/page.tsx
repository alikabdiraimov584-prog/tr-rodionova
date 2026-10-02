import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { ProductCard } from "@/components/shop/product-card";
import { Eyebrow, Monogram, Star } from "@/components/ui";
import { formatMoney } from "@/lib/money";

export default async function Home() {
  const [featured, collection, tiers] = await Promise.all([
    db.product.findMany({
      where: { status: "ACTIVE", isFeatured: true },
      include: { images: { orderBy: { order: "asc" } }, variants: true },
      take: 8,
      orderBy: { createdAt: "desc" },
    }),
    db.collection.findFirst({ where: { isActive: true }, orderBy: { slug: "desc" } }),
    db.loyaltyTier.findMany({ orderBy: { order: "asc" } }),
  ]);
  return (
    <>
      <section className="relative">
        <div className="relative h-[78vh] min-h-[520px] w-full overflow-hidden bg-taupe">
          <Image src="/images/placeholder/hero.svg" alt="" fill priority unoptimized className="object-cover opacity-90" />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <Eyebrow className="text-ink/70">{collection?.season ?? "AW26"} · Quiet luxury</Eyebrow>
            <h1 className="mt-4 max-w-3xl text-5xl leading-[1.05] md:text-7xl">A woman who chooses more</h1>
            <p className="mt-6 max-w-xl text-sm text-ink/70">{collection?.description}</p>
            <div className="mt-10 flex gap-3">
              <Link href="/catalog" className="btn-primary">Смотреть коллекцию</Link>
              <Link href="/circle" className="btn-outline">Circle</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <Eyebrow>Избранное сезона</Eyebrow>
            <h2 className="mt-2 text-3xl md:text-4xl">Ключевые вещи</h2>
          </div>
          <Link href="/catalog" className="text-[0.68rem] uppercase tracking-[0.2em] underline-offset-4 hover:underline">Весь каталог</Link>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:px-8">
          <div>
            <Monogram className="text-7xl" />
            <h2 className="mt-6 text-4xl">T.Rodionova Circle</h2>
            <p className="mt-4 max-w-md text-sm text-muted">
              Программа для тех, кто возвращается. Баллы с каждой покупки, подарок ко дню рождения, ранний доступ к коллекциям и персональный стилист.
            </p>
            <div className="mt-8 flex gap-3">
              <Link href="/register" className="btn-primary">Вступить — 2 000 баллов</Link>
              <Link href="/circle" className="btn-ghost">Условия</Link>
            </div>
          </div>
          <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
            {tiers.map((t) => (
              <div key={t.id} className="bg-ivory p-6">
                <div className="eyebrow">{t.threshold ? `от ${formatMoney(t.threshold)}` : "с первой покупки"}</div>
                <div className="serif mt-3 text-2xl">{t.name}</div>
                <div className="serif mt-4 text-4xl text-taupe-dark">{t.cashbackPct}%</div>
                <div className="text-xs text-muted">баллами</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 text-center md:grid-cols-3 md:px-8">
        {[
          ["Натуральные ткани", "Шерсть, кашемир, шёлк от итальянских и шотландских фабрик"],
          ["Примерка курьером", "Привезём несколько размеров по Москве и Петербургу"],
          ["14 дней на возврат", "Если вещь не стала вашей — заберём бесплатно"],
        ].map(([t, d]) => (
          <div key={t}>
            <Star />
            <h3 className="mt-3 text-xl">{t}</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
    </>
  );
}
