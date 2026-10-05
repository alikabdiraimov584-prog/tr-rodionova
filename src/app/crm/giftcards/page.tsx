import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/money";
import { GIFT_STATUS } from "@/lib/labels";
import { Badge, PageTitle, Stat } from "@/components/ui";
import { ConfirmButton } from "@/components/form";
import { qs, str } from "@/components/crm/pager";
import { activateGiftCardAction, cancelGiftCardAction } from "@/app/actions/crm-gift";
import type { GiftCardStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Подарочные сертификаты" };

export default async function CrmGiftCards({ searchParams }: PageProps<"/crm/giftcards">) {
  await requireSection("giftcards");
  const sp = await searchParams;
  const status = str(sp.status) as GiftCardStatus | undefined;
  const q = str(sp.q);
  const now = new Date();
  const where = {
    ...(status && status in GIFT_STATUS ? { status } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q.toUpperCase() } },
            { recipientName: { contains: q, mode: "insensitive" as const } },
            { recipientEmail: { contains: q, mode: "insensitive" as const } },
            { purchaser: { is: { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }] } } },
          ],
        }
      : {}),
  };
  const [cards, counts, liability, soldMonth] = await Promise.all([
    db.giftCard.findMany({ where, orderBy: { createdAt: "desc" }, include: { purchaser: { select: { id: true, firstName: true, lastName: true, email: true } }, _count: { select: { redemptions: true } } } }),
    db.giftCard.groupBy({ by: ["status"], _count: true }),
    db.giftCard.aggregate({ where: { status: "ACTIVE", expiresAt: { gt: now } }, _sum: { balance: true }, _count: true }),
    db.giftCard.aggregate({ where: { status: { in: ["ACTIVE", "USED"] }, createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } }, _sum: { amount: true }, _count: true }),
  ]);
  const countBy = new Map(counts.map((c) => [c.status, c._count]));
  return (
    <div>
      <PageTitle title="Подарочные сертификаты">Обязательства — сумма остатков по активным сертификатам: эти деньги уже получены, но товар ещё не отгружен.</PageTitle>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Обязательства" value={formatMoney(liability._sum.balance ?? 0)} hint={`${liability._count} активных`} tone="warning" />
        <Stat label="Продано в этом месяце" value={formatMoney(soldMonth._sum.amount ?? 0)} hint={`${soldMonth._count} шт.`} />
        <Stat label="Ожидают оплаты" value={countBy.get("PENDING") ?? 0} hint="можно активировать вручную после перевода" />
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={qs("/crm/giftcards", { q })} className={`badge ${!status ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>Все</Link>
        {(Object.keys(GIFT_STATUS) as GiftCardStatus[]).map((s) => (
          <Link key={s} href={qs("/crm/giftcards", { status: s, q })} className={`badge ${status === s ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>
            {GIFT_STATUS[s].label} · {countBy.get(s) ?? 0}
          </Link>
        ))}
        <form className="w-full sm:ml-auto sm:w-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="Код, покупатель, получатель" className="input w-full py-2 sm:w-72" />
        </form>
      </div>
      <div className="card overflow-x-auto" tabIndex={0}>
        <table className="table">
          <thead><tr><th>Код</th><th className="text-right">Номинал</th><th className="text-right">Остаток</th><th>Статус</th><th>Покупатель</th><th>Получатель</th><th>Срок</th><th /></tr></thead>
          <tbody>
            {cards.map((c) => {
              const expired = c.expiresAt < now && (c.status === "ACTIVE" || c.status === "PENDING");
              return (
                <tr key={c.id}>
                  <td className="font-mono text-xs">{c.code}<div className="text-[0.65rem] text-muted">{formatDate(c.createdAt)}{c._count.redemptions ? ` · ${c._count.redemptions} спис.` : ""}</div></td>
                  <td className="whitespace-nowrap text-right">{formatMoney(c.amount)}</td>
                  <td className={`whitespace-nowrap text-right ${c.balance > 0 && c.status === "ACTIVE" ? "" : "text-muted"}`}>{formatMoney(c.balance)}</td>
                  <td><Badge tone={GIFT_STATUS[c.status].tone}>{GIFT_STATUS[c.status].label}</Badge></td>
                  <td>
                    {c.purchaser ? (
                      <Link href={`/crm/customers/${c.purchaser.id}`} className="underline underline-offset-4">{c.purchaser.firstName} {c.purchaser.lastName ?? ""}</Link>
                    ) : "—"}
                    {c.purchaser && <div className="text-xs text-muted">{c.purchaser.email}</div>}
                  </td>
                  <td>{c.recipientName ?? "—"}{c.recipientEmail && <div className="text-xs text-muted">{c.recipientEmail}</div>}</td>
                  <td className={`whitespace-nowrap text-xs ${expired ? "text-danger" : "text-muted"}`}>{formatDate(c.expiresAt)}</td>
                  <td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-3">
                      {c.status === "PENDING" && (
                        <form action={activateGiftCardAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <ConfirmButton className="text-xs underline" message={`Активировать сертификат ${c.code}? Подтвердите, что оплата ${formatMoney(c.amount)} получена переводом.`}>Активировать вручную</ConfirmButton>
                        </form>
                      )}
                      {(c.status === "PENDING" || c.status === "ACTIVE") && (
                        <form action={cancelGiftCardAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <ConfirmButton className="text-xs text-danger underline" message={c.status === "ACTIVE" ? `Отменить активный сертификат? Остаток ${formatMoney(c.balance)} будет записан к возврату покупателю.` : "Отменить неоплаченный сертификат?"}>Отменить</ConfirmButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {cards.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-sm text-muted">Сертификатов нет</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
