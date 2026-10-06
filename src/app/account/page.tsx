import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pendingPoints, tierProgress } from "@/lib/loyalty";
import { formatDate, formatMoney } from "@/lib/money";
import { ORDER_STATUS } from "@/lib/labels";
import { TierCard } from "@/components/account/tier-card";
import { Alert, Badge, Empty, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Личный кабинет" };

export default async function AccountHome({ searchParams }: PageProps<"/account">) {
  const sp = await searchParams;
  const user = await requireUser("/account");
  const now = new Date();
  const [tiers, orders, pending, expiring, wishCount] = await Promise.all([
    db.loyaltyTier.findMany({ orderBy: { threshold: "asc" } }),
    db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 3, include: { items: true } }),
    pendingPoints(user.id),
    db.pointsTransaction.findMany({
      where: { userId: user.id, amount: { gt: 0 }, expiresAt: { gt: now, lt: new Date(now.getTime() + 30 * 86_400_000) } },
      orderBy: { expiresAt: "asc" },
      take: 1,
    }),
    db.wishlistItem.count({ where: { userId: user.id } }),
  ]);
  const tp = tierProgress(user.yearSpent, tiers, user.loyaltyTier?.code);
  return (
    <div className="space-y-10">
      {sp.welcome && <Alert tone="gold">Добро пожаловать в T.Rodionova Circle! На ваш счёт начислено 2 000 приветственных баллов.</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <TierCard
          name={user.loyaltyTier?.name ?? "Atelier"}
          code={user.loyaltyTier?.code ?? "ATELIER"}
          points={user.pointsBalance}
          pending={pending}
          yearSpent={user.yearSpent}
          next={tp.next}
          progress={tp.progress}
          remaining={tp.remaining}
          firstName={`${user.firstName} ${user.lastName ?? ""}`}
        />
        <div className="card p-6">
          <Eyebrow>Ваши привилегии</Eyebrow>
          <ul className="mt-4 space-y-2 text-sm">
            {(user.loyaltyTier?.perks ?? []).map((p) => (
              <li key={p} className="flex gap-2"><span className="text-taupe">✦</span>{p}</li>
            ))}
          </ul>
          {expiring[0] && (
            <p className="mt-5 border-t border-line pt-4 text-xs text-warning">
              {expiring[0].amount.toLocaleString("ru-RU")} баллов сгорят {formatDate(expiring[0].expiresAt)} — успейте использовать.
            </p>
          )}
          <Link href="/account/loyalty" className="btn-outline btn-sm mt-5">Условия и история</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><Eyebrow>Покупок на сумму</Eyebrow><div className="serif mt-2 text-2xl">{formatMoney(user.lifetimeSpent)}</div></div>
        <div className="card p-5"><Eyebrow>В избранном</Eyebrow><div className="serif mt-2 text-2xl">{wishCount}</div></div>
        <div className="card p-5"><Eyebrow>Ваш размер</Eyebrow><div className="serif mt-2 text-2xl">{user.preferredSize ?? "—"}</div></div>
      </div>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2>Последние заказы</h2>
          <Link href="/account/orders" className="shrink-0 py-1 text-[0.68rem] uppercase tracking-[0.18em] text-muted hover:text-ink">Все заказы</Link>
        </div>
        {orders.length === 0 ? (
          <Empty title="Заказов пока нет" action={<Link href="/catalog" className="btn-primary">В каталог</Link>} />
        ) : (
          <div className="divide-y divide-line border-y border-line">
            {orders.map((o) => (
              <Link key={o.id} href={`/account/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-white">
                <div>
                  <div className="text-sm">Заказ №{o.number}</div>
                  <div className="text-xs text-muted">{formatDate(o.createdAt)} · {o.items.map((i) => i.productName).join(", ")}</div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                  <span className="text-sm">{formatMoney(o.total)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
