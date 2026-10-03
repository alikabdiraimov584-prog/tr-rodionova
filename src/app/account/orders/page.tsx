import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { ORDER_STATUS } from "@/lib/labels";
import { Badge, Empty, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Мои заказы" };

export default async function OrdersPage() {
  const user = await requireUser("/account/orders");
  const orders = await db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { items: true } });
  return (
    <div>
      <PageTitle title="Заказы" />
      {orders.length === 0 ? (
        <Empty title="Заказов пока нет" action={<Link href="/catalog" className="btn-primary">В каталог</Link>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>№</th><th>Дата</th><th>Состав</th><th>Статус</th><th className="text-right">Сумма</th><th className="text-right">Баллы</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/account/orders/${o.id}`} className="underline underline-offset-4">{o.number}</Link></td>
                  <td className="whitespace-nowrap text-muted">{formatDate(o.createdAt)}</td>
                  <td className="max-w-xs truncate">{o.items.map((i) => `${i.productName} (${i.size})`).join(", ")}</td>
                  <td><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></td>
                  <td className="whitespace-nowrap text-right">{formatMoney(o.total)}</td>
                  <td className="whitespace-nowrap text-right text-taupe-dark">{o.pointsEarned ? `+${o.pointsEarned.toLocaleString("ru-RU")}` : o.pointsUsed ? `−${o.pointsUsed.toLocaleString("ru-RU")}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
