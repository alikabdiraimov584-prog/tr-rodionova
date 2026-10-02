import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { GIFT_STATUS } from "@/lib/labels";
import { Badge, Empty, PageTitle } from "@/components/ui";
import { GiftCheck } from "@/components/account/gift-check";

export const metadata: Metadata = { title: "Подарочные сертификаты" };

export default async function GiftCardsPage() {
  const user = await requireUser("/account/giftcards");
  const cards = await db.giftCard.findMany({ where: { purchaserId: user.id }, orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-8">
      <PageTitle title="Подарочные сертификаты" actions={<Link href="/gift" className="btn-primary btn-sm">Купить сертификат</Link>}>
        Здесь — сертификаты, которые вы купили в подарок. Код показывается после оплаты.
      </PageTitle>
      <div className="card p-5"><GiftCheck /></div>
      {cards.length === 0 ? (
        <Empty title="Вы ещё не покупали сертификаты" action={<Link href="/gift" className="btn-outline">Выбрать номинал</Link>}>
          Подарочный сертификат — это выбор без риска промахнуться с размером.
        </Empty>
      ) : (
        <div className="divide-y divide-line border-y border-line">
          {cards.map((c) => (
            <Link key={c.id} href={`/account/giftcards/${c.id}`} className="flex flex-wrap items-center justify-between gap-4 py-4 hover:bg-sand/40">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-sm">{formatMoney(c.amount)}</span>
                  <Badge tone={GIFT_STATUS[c.status].tone}>{GIFT_STATUS[c.status].label}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {c.recipientName ? `Для: ${c.recipientName}` : "Без получателя"}
                  {c.recipientEmail ? ` · ${c.recipientEmail}` : ""} · до {formatDate(c.expiresAt)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm">Остаток {formatMoney(c.balance)}</div>
                <div className="mt-1 font-mono text-xs text-muted">{c.status === "ACTIVE" ? c.code : "TR-••••-••••-••••-••••"}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
