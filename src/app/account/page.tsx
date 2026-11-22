import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { ORDER_STATUS } from "@/lib/labels";
import { Alert, Badge, Empty, Eyebrow } from "@/components/ui";
import { MetrikaGoal } from "@/components/metrika-goal";

export const metadata: Metadata = { title: "Личный кабинет" };

export default async function AccountHome({ searchParams }: PageProps<"/account">) {
  const sp = await searchParams;
  const user = await requireUser("/account");
  const [orders, wishCount] = await Promise.all([
    db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 3, include: { items: true } }),
    db.wishlistItem.count({ where: { userId: user.id } }),
  ]);
  return (
    <div className="space-y-10">
      <h1 className="sr-only">Личный кабинет</h1>
      {sp.welcome && <Alert tone="gold">Добро пожаловать в личный кабинет T.Rodionova.</Alert>}
      {sp.welcome && <MetrikaGoal goal="register" dedupe="welcome" />}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><Eyebrow>Покупок на сумму</Eyebrow><div className="serif mt-2 text-2xl">{formatMoney(user.lifetimeSpent)}</div></div>
        <div className="card p-5"><Eyebrow>В избранном</Eyebrow><div className="serif mt-2 text-2xl">{wishCount}</div></div>
        <div className="card p-5"><Eyebrow>Ваш размер</Eyebrow><div className="serif mt-2 text-2xl">{user.preferredSize ?? "—"}</div></div>
      </div>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2>Последние заказы</h2>
          <Link href="/account/orders" className="shrink-0 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted hover:text-ink">Все заказы</Link>
        </div>
        {orders.length === 0 ? (
          <Empty title="Заказов пока нет" action={<Link href="/catalog" className="btn-primary">В каталог</Link>} />
        ) : (
          <div className="divide-y divide-line border-y border-line">
            {orders.map((o) => (
              <Link key={o.id} href={`/account/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-panel">
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
