import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { circleCta, isStaffRole } from "@/lib/role-links";
import { ProductCard } from "@/components/shop/product-card";
import { formatMoney } from "@/lib/money";

export default async function Home() {
  const [newest, featured, collection, looks, article, tiers, user, loyalty] = await Promise.all([
    db.product.findMany({ where: { status: "ACTIVE", isNew: true, isPreloved: false }, include: { images: { orderBy: { order: "asc" } }, variants: true }, take: 4, orderBy: { createdAt: "desc" } }),
    db.product.findMany({ where: { status: "ACTIVE", isFeatured: true, isPreloved: false }, include: { images: { orderBy: { order: "asc" } }, variants: true }, take: 8, orderBy: { createdAt: "desc" } }),
    db.collection.findFirst({ where: { isActive: true }, orderBy: { slug: "desc" } }),
    db.look.findMany({ where: { isPublished: true }, orderBy: { order: "asc" }, take: 2 }),
    db.article.findFirst({ where: { publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" } }),
    db.loyaltyTier.findMany({ orderBy: { order: "asc" } }),
    getCurrentCustomer(),
    getSetting("loyalty"),
  ]);
  const hero = featured.slice(0, 2);
  const cta = circleCta(user, loyalty.welcomePoints);
  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-6">
      <section className="mt-1 grid gap-1 md:grid-cols-2">
        {hero.map((p, i) => (
          <Link key={p.id} href={`/product/${p.slug}`} className="relative block aspect-[4/5] overflow-hidden bg-sand md:aspect-[3/4]">
            {p.images[i % p.images.length] && <Image src={p.images[i % p.images.length].url} alt={p.name} fill priority className="object-cover object-top" sizes="(min-width: 768px) 50vw, 100vw" />}
            <span className="absolute bottom-4 left-4 bg-ivory px-2.5 py-1.5 text-[0.68rem] uppercase tracking-[0.1em]">{p.name} · {formatMoney(p.price)}</span>
          </Link>
        ))}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-[0.68rem] uppercase tracking-[0.1em]">
        <span>{collection?.season ?? "AW26"} · {collection?.name ?? "Осень–зима 2026"}</span>
        <div className="flex gap-5"><Link href="/catalog" className="underline underline-offset-4">Смотреть коллекцию</Link><Link href="/lookbook" className="underline underline-offset-4">Лукбук</Link></div>
      </div>

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between"><h2>Новое</h2><Link href="/catalog?new=1" className="text-[0.68rem] uppercase tracking-[0.1em] underline underline-offset-4">Все новинки</Link></div>
        <div className="grid grid-cols-2 gap-1 md:grid-cols-4">{newest.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </section>

      {looks.length > 0 && (
        <section className="mt-14 grid gap-1 md:grid-cols-2">
          {looks.map((l) => (
            <Link key={l.id} href={`/lookbook/${l.slug}`} className="relative block aspect-[16/10] overflow-hidden bg-sand">
              {l.coverUrl && <Image src={l.coverUrl} alt={l.title} fill className="object-cover" sizes="50vw" />}
              <span className="absolute bottom-4 left-4 bg-ivory px-2.5 py-1.5 text-[0.68rem] uppercase tracking-[0.1em]">Образ · {l.title}</span>
            </Link>
          ))}
        </section>
      )}

      <section className="mt-14">
        <div className="mb-3 flex items-baseline justify-between"><h2>Ключевые вещи сезона</h2><Link href="/catalog" className="text-[0.68rem] uppercase tracking-[0.1em] underline underline-offset-4">Весь каталог</Link></div>
        <div className="grid grid-cols-2 gap-1 md:grid-cols-4">{featured.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </section>

      <section className="mt-14 grid border border-line md:grid-cols-2">
        <div className="p-8 md:p-12">
          <div className="eyebrow">Ткани</div>
          <h2 className="mt-2 text-2xl">Шерсть, которая не колется</h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink/80">Ткани с фабрик Бьеллы, кашемир 12 gauge из Монголии, шёлк из Комо. Каждая модель проходит две примерки на живой модели до запуска в пошив и шьётся небольшими партиями в Европе.</p>
          <div className="mt-6 flex gap-4 text-[0.68rem] uppercase tracking-[0.1em]"><Link href="/about" className="underline underline-offset-4">О бренде</Link><Link href="/care" className="underline underline-offset-4">Уход</Link></div>
        </div>
        <div className="relative min-h-[320px] bg-sand">{featured[2]?.images[1] && <Image src={featured[2].images[1].url} alt="" fill className="object-cover" sizes="50vw" />}</div>
      </section>

      <section className="mt-14 grid gap-px border border-line bg-line md:grid-cols-4">
        <div className="bg-ivory p-6">
          <div className="eyebrow">T.Rodionova Circle</div>
          <h2 className="mt-2">Баллы с каждой покупки</h2>
          <p className="mt-2 text-sm text-ink/80">{loyalty.welcomePoints.toLocaleString("ru-RU")} баллов за регистрацию, подарок ко дню рождения, закрытые показы и персональный стилист.</p>
          <Link href={cta.href} className="btn-primary mt-5">{user && !isStaffRole(user.role) ? "Мой кабинет" : "Вступить"}</Link>
        </div>
        {tiers.map((t) => (
          <div key={t.id} className="bg-ivory p-6">
            <div className="eyebrow">{t.threshold ? `от ${formatMoney(t.threshold)} за 12 мес.` : "с первой покупки"}</div>
            <div className="mt-2 text-2xl">{t.name}</div>
            <div className="mt-3 text-3xl">{t.cashbackPct}%</div>
            <div className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">возвращается баллами</div>
          </div>
        ))}
      </section>

      {article && (
        <section className="mt-14 border-t border-line pt-6">
          <div className="eyebrow">Журнал · {article.category}</div>
          <Link href={`/journal/${article.slug}`} className="mt-2 block text-2xl hover:underline underline-offset-4">{article.title}</Link>
          <p className="mt-2 max-w-2xl text-sm text-ink/80">{article.excerpt}</p>
        </section>
      )}
    </div>
  );
}
