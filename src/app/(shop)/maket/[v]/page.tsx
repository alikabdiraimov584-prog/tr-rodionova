import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { isRealPhoto, photoFirst } from "@/lib/photos";
import type { Prisma } from "@/generated/prisma/client";

/**
 * МАКЕТЫ НА СОГЛАСОВАНИИ (только в рабочей ветке, на сайт не выкладываются): варианты главной и каталога
 * для коллекции из 3–4 вещей на настоящих фото. /maket/b — вещь на весь экран, /maket/c — кадр, сетка и история,
 * /maket/d — выпуск коллекции, /maket/looks — каталог-лукбук, /maket/row — каталог по образцу therow.com, /maket/row-home — главная по образцу therow.com. Вариант A — текущая главная макета.
 */
export const metadata: Metadata = { title: "Макет", robots: { index: false, follow: false } };

const VARIANTS = ["b", "c", "d", "looks", "row", "row-home"] as const;
type V = (typeof VARIANTS)[number];

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];
const bySize = (a: string, b: string) => SIZE_ORDER.indexOf(a.toUpperCase()) - SIZE_ORDER.indexOf(b.toUpperCase());
const lead = (t: string | null) => (t ? (t.split(/(?<=[.!?])\s+/)[0] ?? t) : "");
const nn = (i: number, n: number) => `${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;

export default async function Maket({ params, searchParams }: PageProps<"/maket/[v]">) {
  const { v } = await params;
  const bw = (await searchParams).bw === "1";
  if (!VARIANTS.includes(v as V)) notFound();
  const found = await db.product.findMany({
    where: { status: "ACTIVE", isPreloved: false },
    include: { images: { orderBy: { order: "asc" } }, variants: true },
    take: 6,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
  });
  const items = photoFirst(found).map((p) => ({ ...p, shots: p.images.filter((i) => isRealPhoto(i.url)) }));
  if (items.length === 0) notFound();
  if (v === "b") return <FullScreen items={items} />;
  if (v === "c") return <GridStory items={items} />;
  if (v === "d") return <Drop items={items} />;
  if (v === "row") return <RowCatalog items={items} />;
  if (v === "row-home") return <RowHome items={items} bw={bw} />;
  return <Looks items={items} />;
}

type Item = Prisma.ProductGetPayload<{ include: { images: true; variants: true } }> & { shots: { url: string }[] };

function Sizes({ p }: { p: Item }) {
  const sizes = [...new Set(p.variants.map((x) => x.size))].sort(bySize);
  const inStock = new Set(p.variants.filter((x) => x.stock - x.reserved > 0).map((x) => x.size));
  return (
    <div className="flex flex-wrap gap-x-4 text-[0.72rem] font-semibold uppercase tracking-[0.2em]">
      {sizes.map((s) => <span key={s} className={inStock.has(s) || p.isPreorder ? "" : "line-through opacity-50"}>{s}</span>)}
    </div>
  );
}

/** B. Каждая вещь — экран во всю высоту: кадр (на компьютере два) и подпись поверх. */
function FullScreen({ items }: { items: Item[] }) {
  return (
    <div className="snap-y">
      <h1 className="sr-only">Коллекция T.Rodionova</h1>
      {items.map((p, i) => (
        <section key={p.id} className="relative h-[calc(100svh-3.5rem)] min-h-[560px] snap-start md:h-[calc(100svh-4rem)]">
          <div className="grid h-full md:grid-cols-2">
            {p.shots.slice(0, 2).map((s, k) => (
              <div key={s.url} className={`relative h-full overflow-hidden bg-sand ${k ? "hidden md:block" : ""}`}>
                <Image src={s.url} alt={k ? "" : p.name} fill preload={i === 0 && k === 0} sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-top" />
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-4 pb-10 text-center text-white md:pb-14">
            <div className="caps opacity-80">{nn(i, items.length)}</div>
            <h2 className="mt-3 text-[2.4rem] font-light leading-none md:text-[3.6rem]">{p.name}</h2>
            <div className="mt-4 text-[1.05rem]">{formatMoney(p.price)}</div>
            <Link href={`/product/${p.slug}`} className="caps mt-7 inline-flex min-h-12 items-center bg-white px-10 text-ink transition-colors hover:bg-ink hover:text-white">{p.isPreorder ? "Предзаказ" : "Выбрать размер"}</Link>
          </div>
        </section>
      ))}
    </div>
  );
}

/** C. Большой кадр, все вещи одной строкой крупных карточек, блок о материале. */
function GridStory({ items }: { items: Item[] }) {
  const hero = items[0].shots[1] ?? items[0].shots[0];
  const story = items[items.length - 1].shots[2] ?? items[items.length - 1].shots[0];
  return (
    <div>
      <h1 className="sr-only">Коллекция T.Rodionova</h1>
      <section className="relative h-[78svh] min-h-[480px] overflow-hidden bg-sand">
        <Image src={hero.url} alt="" fill preload sizes="100vw" className="object-cover object-[50%_30%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-10 text-center text-white md:pb-14">
          <div className="caps opacity-80">Осень–зима 2026</div>
          <h2 className="mt-3 text-[2.6rem] font-light leading-none md:text-[4.2rem]">Коллекция</h2>
        </div>
      </section>
      <section className="mx-auto mt-16 max-w-[1600px] px-4 md:mt-24 md:px-8">
        <div className="mb-8 flex items-baseline justify-between">
          <h2 className="text-[1.6rem] font-light md:text-[2rem]">{items.length} вещи</h2>
          <span className="caps text-muted">Шерсть · шёлк · кашемир</span>
        </div>
        <div className={`grid grid-cols-2 gap-x-3 gap-y-10 md:gap-x-5 ${items.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
          {items.map((p) => (
            <Link key={p.id} href={`/product/${p.slug}`} className="group block">
              <div className="relative aspect-[3/4] overflow-hidden bg-sand">
                <Image src={p.shots[0].url} alt={p.name} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition-opacity duration-500 group-hover:opacity-0" />
                {p.shots[1] && <Image src={p.shots[1].url} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}
              </div>
              <div className="pt-4 text-center">
                <div className="text-[1.05rem] font-light">{p.name}</div>
                <div className="caps mt-1.5 text-muted-dark">{formatMoney(p.price)}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="mx-auto mt-24 grid max-w-[1400px] items-center gap-10 px-4 md:mt-40 md:grid-cols-2 md:gap-20 md:px-10">
        <div className="relative aspect-[4/5] overflow-hidden bg-sand">
          <Image src={story.url} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="md:max-w-md">
          <div className="caps text-muted">О материале</div>
          <h2 className="mt-5 text-[2rem] font-light leading-tight md:text-[2.6rem]">Шерсть и шёлк, которые носятся годами</h2>
          <p className="mt-5 leading-relaxed text-muted-dark">Ткани итальянских фабрик, лекала под женскую фигуру, небольшой тираж каждой модели. Здесь — пара строк о том, из чего и как сшита коллекция.</p>
          <Link href="/about" className="btn-outline mt-8">О бренде</Link>
        </div>
      </section>
    </div>
  );
}

/** D. Выпуск коллекции: номер выпуска, главная вещь крупно, остальные рядом, лист ожидания следующего выпуска. */
function Drop({ items }: { items: Item[] }) {
  const [main, ...rest] = items;
  return (
    <div>
      <h1 className="sr-only">Коллекция I T.Rodionova</h1>
      <section className="mx-auto max-w-[1400px] px-4 pt-14 text-center md:px-10 md:pt-24">
        <div className="caps text-muted">Выпуск I · Осень–зима 2026</div>
        <h2 className="mt-5 text-[2.8rem] font-light leading-none md:text-[5rem]">Коллекция I</h2>
        <p className="mx-auto mt-6 max-w-md leading-relaxed text-muted-dark">{items.length} вещи, ограниченный тираж каждой модели. Повторного пошива не будет.</p>
      </section>
      <section className="mx-auto mt-14 grid max-w-[1400px] items-end gap-8 px-4 md:mt-20 md:grid-cols-[1.5fr_1fr] md:gap-16 md:px-10">
        <Link href={`/product/${main.slug}`} className="grid grid-cols-2 gap-2">
          {main.shots.slice(0, 2).map((s, k) => (
            <div key={s.url} className="relative aspect-[3/4] overflow-hidden bg-sand">
              <Image src={s.url} alt={k ? "" : main.name} fill preload={k === 0} sizes="(min-width: 768px) 30vw, 50vw" className="object-cover" />
            </div>
          ))}
        </Link>
        <div className="md:max-w-sm md:pb-6">
          <div className="caps text-muted">Главная вещь выпуска</div>
          <h3 className="mt-4 text-[2.2rem] font-light leading-tight">{main.name}</h3>
          <p className="mt-4 leading-relaxed text-muted-dark">{lead(main.description)}</p>
          <div className="mt-5">{formatMoney(main.price)}</div>
          <div className="mt-3"><Sizes p={main} /></div>
          <div className="caps mt-5 text-muted">В наличии: {main.variants.reduce((n, x) => n + Math.max(0, x.stock - x.reserved), 0)} шт.</div>
          <Link href={`/product/${main.slug}`} className="btn-primary mt-6">{main.isPreorder ? "Предзаказ" : "Выбрать размер"}</Link>
        </div>
      </section>
      <section className="mx-auto mt-20 grid max-w-[1400px] grid-cols-2 gap-x-3 gap-y-10 px-4 md:mt-28 md:grid-cols-3 md:gap-x-6 md:px-10">
        {rest.map((p, i) => (
          <Link key={p.id} href={`/product/${p.slug}`} className="group block">
            <div className="relative aspect-[3/4] overflow-hidden bg-sand">
              <Image src={p.shots[0].url} alt={p.name} fill sizes="(min-width: 768px) 33vw, 50vw" className="object-cover" />
            </div>
            <div className="pt-4">
              <div className="caps text-muted">{nn(i + 1, items.length)}</div>
              <div className="mt-2 text-[1.1rem] font-light">{p.name}</div>
              <div className="caps mt-1 text-muted-dark">{formatMoney(p.price)}</div>
            </div>
          </Link>
        ))}
      </section>
      <section className="mx-auto mt-28 max-w-xl px-4 text-center md:mt-40">
        <div className="caps text-muted">Выпуск II · весна 2027</div>
        <h2 className="mt-5 text-[2rem] font-light">Узнать первой о следующем выпуске</h2>
        <div className="mt-8 flex gap-2">
          <div className="flex min-h-12 flex-1 items-center border border-line px-4 text-left text-muted">Электронная почта</div>
          <span className="btn-primary">Подписаться</span>
        </div>
      </section>
    </div>
  );
}

/** Сетка вещей в манере therow.com: 4 колонки, кадры 2:3, название слева, цена справа, второй кадр при наведении. */
function RowGrid({ items }: { items: Item[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-14 md:grid-cols-4 md:gap-x-10 md:gap-y-32 md:px-5">
      {items.map((p) => (
        <Link key={p.id} href={`/product/${p.slug}`} className="group block">
          <div className="relative aspect-[2/3] overflow-hidden bg-[#f6f5f3]">
            <Image src={p.shots[0].url} alt={p.name} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition-opacity duration-300 group-hover:opacity-0" />
            {p.shots[1] && <Image src={p.shots[1].url} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" />}
            {p.isPreorder && <span className="absolute left-2.5 top-2 text-[#9a9a9a]">Предзаказ</span>}
          </div>
          <div className="flex flex-col gap-1 px-4 pt-4 md:flex-row md:justify-between md:px-0 md:pt-6">
            <span>{p.name}</span>
            <span>{formatMoney(p.price)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/**
 * Главная по образцу therow.com: один большой кадр без надписей и кнопок (только строка сезона в углу),
 * под ним сразу вся коллекция сеткой. ?bw=1 — тот же кадр в чёрно-белом, как у них.
 */
function RowHome({ items, bw }: { items: Item[]; bw: boolean }) {
  const sans = { fontFamily: "var(--font-manrope), system-ui, sans-serif" };
  const all = items.flatMap((p) => p.shots);
  const hero = all.find((s) => s.url.includes("halter-04")) ?? items[0].shots[0];
  return (
    <div style={sans} className="text-[0.82rem] md:text-[0.84rem]">
      <h1 className="sr-only">T.Rodionova — премиальная женская одежда из шерсти, кашемира и шёлка</h1>
      <section className="relative h-[calc(100svh-3.5rem)] min-h-[520px] overflow-hidden bg-[#f6f5f3] md:h-[calc(100svh-4rem)]">
        <Image src={hero.url} alt="Коллекция осень–зима 2026" fill preload sizes="100vw" className={`object-cover object-[50%_22%] ${bw ? "grayscale" : ""}`} />
        <a href="#collection" className="absolute bottom-5 left-5 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]">Осень–зима 2026</a>
      </section>
      <div id="collection" className="scroll-mt-16">
        <div className="flex items-baseline justify-between px-5 pb-6 pt-10 md:pt-14">
          <div className="flex gap-2"><span>Коллекция</span><span>·</span><span>{items.length} вещи</span></div>
          <Link href="/about">О бренде</Link>
        </div>
        <RowGrid items={items} />
      </div>
    </div>
  );
}

/**
 * Каталог по образцу therow.com: строка «Коллекция · сезон» и справа «Фильтр +», сетка 4 колонки с полями 20px,
 * кадры 2:3, под кадром название слева и цена справа обычным гротеском, «Предзаказ» серым в углу кадра.
 * Ниже — образы коллекции той же сеткой с подписью «Образ 1…», как их страница сезона.
 */
function RowCatalog({ items }: { items: Item[] }) {
  const sans = { fontFamily: "var(--font-manrope), system-ui, sans-serif" };
  const looks = items.map((p) => p.shots[2] ?? p.shots[1] ?? p.shots[0]);
  return (
    <div style={sans} className="text-[0.82rem] md:text-[0.84rem]">
      <h1 className="sr-only">Коллекция T.Rodionova</h1>
      <div className="flex items-baseline justify-between px-5 pb-6 pt-8 md:pt-10">
        <div className="flex gap-2"><span>Коллекция</span><span>·</span><span>Осень–зима 2026</span></div>
        <span>Фильтр +</span>
      </div>
      <RowGrid items={items} />
      <div className="px-5 pb-6 pt-24 md:pt-40"><span>Образы</span></div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-14 md:grid-cols-4 md:gap-x-10 md:px-5">
        {looks.map((s, i) => (
          <div key={s.url}>
            <div className="relative aspect-[2/3] overflow-hidden bg-[#f6f5f3]">
              <Image src={s.url} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" />
            </div>
            <div className="px-4 pt-4 md:px-0 md:pt-6">Образ {i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Каталог-лукбук: образ во всю ширину и рядом вещи из него с ценой. */
function Looks({ items }: { items: Item[] }) {
  const by = (slug: string) => items.find((p) => p.slug.includes(slug));
  const looks = [
    { title: "Образ 01", photo: by("noir")?.shots[0], parts: [by("noir"), by("palazzo")] },
    { title: "Образ 02", photo: by("halter")?.shots[1] ?? by("halter")?.shots[0], parts: [by("halter")] },
    { title: "Образ 03", photo: by("blanc")?.shots[0], parts: [by("blanc")] },
    { title: "Образ 04", photo: by("palazzo")?.shots[1], parts: [by("palazzo"), by("noir")] },
  ].filter((l) => l.photo);
  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-10">
      <h1 className="pt-14 text-center text-[2.6rem] font-light md:pt-20 md:text-[3.6rem]">Образы</h1>
      <p className="caps mt-4 text-center text-muted">Осень–зима 2026</p>
      {looks.map((l, i) => (
        <section key={l.title} className={`mt-16 grid items-end gap-6 md:mt-28 md:gap-16 ${i % 2 ? "md:grid-cols-[1fr_1.3fr]" : "md:grid-cols-[1.3fr_1fr]"}`}>
          <div className={`relative aspect-[4/5] overflow-hidden bg-sand ${i % 2 ? "md:order-2" : ""}`}>
            <Image src={l.photo!.url} alt="" fill sizes="(min-width: 768px) 55vw, 100vw" className="object-cover object-top" />
          </div>
          <div className={i % 2 ? "md:order-1" : ""}>
            <div className="caps text-muted">{l.title}</div>
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {l.parts.filter((p): p is Item => !!p).map((p) => (
                <li key={p.id}>
                  <Link href={`/product/${p.slug}`} className="flex items-center gap-4 py-4 transition-opacity hover:opacity-60">
                    <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-sand"><Image src={p.shots[0].url} alt="" fill sizes="64px" className="object-cover" /></div>
                    <span className="flex-1 text-[1.05rem] font-light">{p.name}</span>
                    <span className="caps text-muted-dark">{formatMoney(p.price)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
