import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/money";
import { PROMO_TYPE } from "@/lib/labels";
import { Badge, PageTitle } from "@/components/ui";
import { PromoForm } from "@/components/crm/marketing-forms";
import { SubmitButton } from "@/components/form";
import { togglePromoAction } from "@/app/actions/crm-marketing";

export const metadata: Metadata = { title: "Промокоды" };

export default async function Promos() {
  await requireSection("promos");
  const promos = await db.promoCode.findMany({ include: { _count: { select: { uses: true } }, orders: { where: { status: { notIn: ["NEW", "CANCELLED"] } }, select: { total: true, discount: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-6">
      <PageTitle title="Промокоды">Промокоды не суммируются между собой. Баллы можно списать дополнительно к промокоду.</PageTitle>
      <div className="card p-5"><PromoForm /></div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Код</th><th>Условия</th><th>Период</th><th className="text-right">Использований</th><th className="text-right">Выручка</th><th>Статус</th><th /></tr></thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.code}</td>
                <td>{PROMO_TYPE[p.type]}{p.type === "PERCENT" ? ` ${p.value}%` : p.type === "FIXED" ? ` ${formatMoney(p.value)}` : ""}<div className="text-xs text-muted">от {formatMoney(p.minSubtotal)} · {p.perUser} на клиента</div></td>
                <td className="text-xs text-muted">{p.startsAt ? formatDate(p.startsAt) : "сразу"} — {p.endsAt ? formatDate(p.endsAt) : "бессрочно"}</td>
                <td className="text-right">{p._count.uses}{p.maxUses ? ` / ${p.maxUses}` : ""}</td>
                <td className="whitespace-nowrap text-right">{formatMoney(p.orders.reduce((s, o) => s + o.total, 0))}</td>
                <td><Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Активен" : "Выключен"}</Badge></td>
                <td><form action={togglePromoAction}><input type="hidden" name="id" value={p.id} /><SubmitButton className="text-xs underline">{p.isActive ? "выключить" : "включить"}</SubmitButton></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
