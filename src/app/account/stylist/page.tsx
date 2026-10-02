import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/money";
import { SELECTION_STATUS } from "@/lib/labels";
import { Badge, Empty, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Мой стилист" };

export default async function StylistPage() {
  const user = await requireUser("/account/stylist");
  const selections = await db.selection.findMany({
    where: { userId: user.id, status: { in: ["SENT", "VIEWED"] } },
    include: { stylist: { select: { firstName: true } }, _count: { select: { items: true } } },
    orderBy: { sentAt: "desc" },
  });
  return (
    <div className="space-y-10">
      <PageTitle title="Мой стилист" actions={<Link href="/account/support?topic=stylist" className="btn-outline btn-sm">Записаться к стилисту</Link>}>
        Персональные подборки от стилиста T.Rodionova: вещи под ваш гардероб, повод и размер. Консультация и примерка дома — бесплатно для Circle.
      </PageTitle>
      {selections.length === 0 ? (
        <Empty title="Подборок пока нет" action={<Link href="/account/support?topic=stylist" className="btn-primary">Записаться к стилисту</Link>}>
          Расскажите стилисту о поводе и предпочтениях — и мы соберём для вас подборку. Укажите мерки в <Link href="/account/profile" className="underline">профиле</Link>, чтобы размер был точным.
        </Empty>
      ) : (
        <div className="divide-y divide-line border-y border-line">
          {selections.map((s) => (
            <Link key={s.id} href={`/account/stylist/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-sand/40">
              <div>
                <div className="text-sm">{s.title}</div>
                <div className="text-xs text-muted">{s.stylist?.firstName ? `стилист ${s.stylist.firstName} · ` : ""}{s._count.items} {s._count.items === 1 ? "вещь" : s._count.items < 5 ? "вещи" : "вещей"} · {formatDate(s.sentAt ?? s.createdAt)}</div>
              </div>
              <Badge tone={s.status === "SENT" ? "gold" : "neutral"}>{s.status === "SENT" ? "Новая" : SELECTION_STATUS[s.status].label}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
