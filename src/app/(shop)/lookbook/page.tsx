import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Empty, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Лукбук", description: "Образы коллекции T.Rodionova: как сочетать вещи между собой." };

export default async function LookbookPage() {
  const looks = await db.look.findMany({
    where: { isPublished: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { items: true } } },
  });
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <PageTitle eyebrow="Лукбук" title="Образы">Готовые сочетания из коллекции — каждую вещь можно купить отдельно или добавить в корзину весь образ.</PageTitle>
      {looks.length === 0 ? (
        <Empty title="Образы скоро появятся" action={<Link href="/catalog" className="btn-outline">В каталог</Link>}>Мы готовим лукбук новой коллекции.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3">
          {looks.map((l) => (
            <Link key={l.id} href={`/lookbook/${l.slug}`} className="group block">
              <div className="relative aspect-[3/4] overflow-hidden bg-sand">
                {l.coverUrl && <Image src={l.coverUrl} alt={l.title} fill sizes="(min-width: 768px) 33vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />}
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <span className="text-sm">{l.title}</span>
                <span className="text-[0.62rem] uppercase tracking-[0.16em] text-muted">{l.season ?? ""}</span>
              </div>
              <div className="mt-1 text-xs text-muted">{l._count.items} {l._count.items === 1 ? "вещь" : l._count.items < 5 ? "вещи" : "вещей"}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
