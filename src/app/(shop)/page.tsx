import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { withLookCovers } from "@/lib/looks";
import { getCurrentCustomer } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { circleCta } from "@/lib/role-links";
import { ProductCard } from "@/components/shop/product-card";
import { isRealPhoto, photoFirst } from "@/lib/photos";

const withImages = { images: { orderBy: { order: "asc" as const } }, variants: true } as const;

/**
 * Главная по образцу ACTE: кадр съёмки на весь экран с одной кнопкой, категории картинками, новинки,
 * образ из лукбука, короткая мысль о бренде и одна строка про Circle. Без дублирующих сеток и таблиц уровней.
 */
export default async function Home() {
  const [newest, featured, collection, looks, tiers, user, loyalty, categories] = await Promise.all([
    db.product.findMany({ where: { status: "ACTIVE", isNew: true, isPreloved: false }, include: withImages, take: 8, orderBy: { createdAt: "desc" } }),
    db.product.findMany({ where: { status: "ACTIVE", isFeatured: true, isPreloved: false }, include: withImages, take: 8, orderBy: { createdAt: "desc" } }),
    db.collection.findFirst({ where: { isActive: true }, orderBy: { slug: "desc" } }),
    db.look.findMany({ where: { isPublished: true }, orderBy: { order: "asc" }, take: 1 }).then(withLookCovers),
    db.loyaltyTier.findMany({ orderBy: { order: "asc" }, select: { cashbackPct: true } }),
    getCurrentCustomer(),
    getSetting("loyalty"),
    db.category.findMany({
      where: { products: { some: { status: "ACTIVE", isPreloved: false, images: { some: {} } } } },
      orderBy: { order: "asc" },
      select: { slug: true, name: true, products: { where: { status: "ACTIVE", isPreloved: false, images: { some: { url: { not: { startsWith: "/images/placeholder/" } } } } }, orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }], take: 1, select: { images: { where: { url: { not: { startsWith: "/images/placeholder/" } } }, orderBy: { order: "asc" }, take: 1, select: { url: true } } } } },
    }),
  ]);
  // первым в hero идёт вещь из первого образа лукбука: свежая съёмка открывает главную без правки кода
  const lead = await db.lookItem.findFirst({ where: { look: { isPublished: true } }, orderBy: [{ look: { order: "asc" } }, { order: "asc" }], select: { productId: true } });
  const hero = [...featured].sort((a, b) => (a.id === lead?.productId ? -1 : b.id === lead?.productId ? 1 : 0))[0] ?? newest[0];
  const heroShots = hero ? [hero.images[0], hero.images[1] ?? featured.find((p) => p.id !== hero.id)?.images[0]].filter(Boolean) : [];
  const look = looks[0];
  const tiles = categories.filter((c) => isRealPhoto(c.products[0]?.images[0]?.url)).slice(0, 4);
  const grid = photoFirst(newest.length >= 4 ? newest : featured);
  const cta = circleCta(user, loyalty.welcomePoints);
  const maxCashback = Math.max(0, ...tiers.map((t) => t.cashbackPct));
  const season = [collection?.season ?? "AW26", collection?.name ?? "Осень–зима 2026"].join(" · ");

  return (
    <div>
      {hero && heroShots.length > 0 && (
        <section className="relative h-[calc(100svh-3.5rem)] min-h-[520px] md:h-[calc(100svh-4rem)]">
          <div className="grid h-full md:grid-cols-2">
            {heroShots.map((img, i) => (
              <div key={img!.url} className={`relative h-full overflow-hidden bg-sand ${i > 0 ? "hidden md:block" : ""}`}>
                <Image src={img!.url} alt={i === 0 ? `${hero.name} — ${season}` : ""} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-top" />
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-4 pb-10 text-center text-white md:pb-14">
            <div className="text-[0.72rem] uppercase tracking-[0.2em] opacity-90">{season}</div>
            <h1 className="mt-3 text-[2rem] font-normal uppercase leading-none tracking-[0.08em] md:text-[3.2rem]">Новая коллекция</h1>
            <Link href="/catalog?new=1" className="pointer-events-auto mt-7 inline-flex min-h-12 items-center bg-white px-10 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-ink transition-opacity hover:opacity-85">
              Смотреть
            </Link>
          </div>
        </section>
      )}

      {tiles.length > 0 && (
        <section className="mx-auto mt-16 max-w-[1600px] px-1 md:mt-24 md:px-5">
          <div className={`grid grid-cols-2 gap-1 ${tiles.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
            {tiles.map((c) => (
              <Link key={c.slug} href={`/catalog?category=${c.slug}`} className="group block">
                <div className="relative aspect-[3/4] overflow-hidden bg-sand">
                  <Image src={c.products[0].images[0].url} alt={c.name} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                </div>
                <div className="px-1 py-3 text-center text-[0.75rem] uppercase tracking-[0.14em]">{c.name}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {grid.length > 0 && (
        <section className="mx-auto mt-16 max-w-[1600px] px-1 md:mt-24 md:px-5">
          <div className="mb-5 flex items-baseline justify-between px-3 md:px-1">
            <h2 className="section-title">{newest.length >= 4 ? "Новинки" : "Ключевые вещи"}</h2>
            <Link href={newest.length >= 4 ? "/catalog?new=1" : "/catalog"} className="nav-link underline underline-offset-4">Смотреть все</Link>
          </div>
          <div className="grid grid-cols-2 gap-x-1 md:grid-cols-4">{grid.slice(0, 8).map((p, i) => <ProductCard key={p.id} p={p} priority={i < 2} />)}</div>
        </section>
      )}

      {look?.coverUrl && (
        <section className="mt-16 md:mt-24">
          <Link href={`/lookbook/${look.slug}`} className="group relative block h-[80svh] min-h-[480px] overflow-hidden bg-sand">
            <Image src={look.coverUrl} alt={look.title} fill sizes="100vw" className="object-cover object-[center_25%] transition-transform duration-[1.2s] group-hover:scale-[1.02]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-4 pb-10 text-center text-white md:pb-14">
              <div className="text-[0.72rem] uppercase tracking-[0.2em] opacity-90">Лукбук</div>
              <h2 className="mt-3 text-[1.6rem] font-normal uppercase tracking-[0.08em] md:text-[2.2rem]">{look.title}</h2>
              <span className="mt-6 inline-flex min-h-12 items-center border border-white px-10 text-[0.72rem] font-medium uppercase tracking-[0.14em]">Купить образ</span>
            </div>
          </Link>
        </section>
      )}

      <section className="mx-auto mt-20 max-w-3xl px-6 text-center md:mt-28">
        <p className="text-[1.15rem] leading-relaxed md:text-[1.45rem]">
          Одежда, которая остаётся с вами дольше одного сезона. Шерсть из&nbsp;Бьеллы, кашемир и&nbsp;шёлк из&nbsp;Комо — сшито небольшими тиражами в&nbsp;Европе.
        </p>
        <Link href="/about" className="nav-link mt-6 inline-block underline underline-offset-4">О бренде</Link>
      </section>

      <section className="mx-auto mt-20 max-w-[1600px] px-4 md:mt-28 md:px-5">
        <div className="flex flex-col items-center justify-between gap-4 border-y border-line py-8 text-center md:flex-row md:text-left">
          <div>
            <div className="section-title">T.Rodionova Circle</div>
            <p className="mt-1.5 text-[0.9rem] text-muted">{loyalty.welcomePoints.toLocaleString("ru-RU")} баллов за регистрацию{maxCashback ? ` и до ${maxCashback}% возврата баллами с каждой покупки` : ""}.</p>
          </div>
          <Link href={cta.href} className="btn-primary shrink-0">{cta.label}</Link>
        </div>
      </section>
    </div>
  );
}
