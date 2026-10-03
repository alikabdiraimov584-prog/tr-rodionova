import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { pnlByMonth, sumRows, unitEconomics, paymentMix, balanceSheetLite, type PnlRow } from "@/lib/finance";
import { formatDate, formatMoney } from "@/lib/money";
import { LEDGER_TYPE, PAYMENT_METHOD } from "@/lib/labels";
import { Eyebrow, PageTitle, Stat } from "@/components/ui";
import { BarChart, HBar } from "@/components/crm/charts";
import { LedgerForm } from "@/components/crm/admin-forms";
import { ConfirmButton } from "@/components/form";
import { deleteLedgerAction } from "@/app/actions/crm-admin";
import { Pager, qs, str } from "@/components/crm/pager";
import type { LedgerType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Финансы" };
const PER = 40;

const LINES: { key: keyof PnlRow; label: string; strong?: boolean; neg?: boolean; pct?: keyof PnlRow }[] = [
  { key: "sales", label: "Выручка от продаж" },
  { key: "otherIncome", label: "Прочие доходы" },
  { key: "refunds", label: "Возвраты покупателям", neg: true },
  { key: "netRevenue", label: "Чистая выручка", strong: true },
  { key: "cogs", label: "Себестоимость", neg: true },
  { key: "gross", label: "Валовая прибыль", strong: true, pct: "grossPct" },
  { key: "acquiring", label: "Эквайринг", neg: true },
  { key: "shipping", label: "Доставка", neg: true },
  { key: "marketing", label: "Маркетинг", neg: true },
  { key: "production", label: "Производство", neg: true },
  { key: "salary", label: "Зарплаты", neg: true },
  { key: "rent", label: "Аренда", neg: true },
  { key: "other", label: "Прочие расходы", neg: true },
  { key: "operating", label: "Операционная прибыль", strong: true, pct: "operatingPct" },
];

const short = (k: number) => {
  const r = Math.round(k / 100);
  if (Math.abs(r) >= 1_000_000) return `${(r / 1_000_000).toFixed(1)} млн`;
  if (Math.abs(r) >= 1000) return `${Math.round(r / 1000)} тыс`;
  return String(r);
};

export default async function Finance({ searchParams }: PageProps<"/crm/finance">) {
  await requireSection("finance");
  const sp = await searchParams;
  const months = Number(str(sp.months) ?? 6) === 12 ? 12 : 6;
  const type = str(sp.type) as LedgerType | undefined;
  const page = Math.max(1, Number(str(sp.page) ?? 1));
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  from.setMonth(from.getMonth() - (months - 1));
  const [rows, ue, mix, bs, ledger, ledgerTotal] = await Promise.all([
    pnlByMonth(months),
    unitEconomics(from),
    paymentMix(from),
    balanceSheetLite(),
    db.ledgerEntry.findMany({ where: type ? { type } : {}, include: { order: { select: { id: true, number: true } } }, orderBy: { date: "desc" }, skip: (page - 1) * PER, take: PER }),
    db.ledgerEntry.count({ where: type ? { type } : {} }),
  ]);
  const total = sumRows(rows);
  return (
    <div className="space-y-6">
      <PageTitle
        title="Финансы"
        actions={
          <>
            {[6, 12].map((m) => <Link key={m} href={qs("/crm/finance", { months: m })} className={`btn-sm btn ${months === m ? "bg-ink text-ivory" : "border border-line"}`}>{m} мес.</Link>)}
            <a href={qs("/crm/finance/export", { months })} className="btn-outline btn-sm">Экспорт CSV</a>
          </>
        }
      >
        Управленческий учёт по проводкам: продажи и себестоимость создаются автоматически при оплате заказов, возвраты — при возврате, остальные расходы вносятся вручную.
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Чистая выручка, ${months} мес.`} value={formatMoney(total.netRevenue)} />
        <Stat label="Валовая маржа" value={`${total.grossPct}%`} hint={formatMoney(total.gross)} />
        <Stat label="Операционная прибыль" value={formatMoney(total.operating)} hint={`рентабельность ${total.operatingPct}%`} tone={total.operating >= 0 ? "success" : "danger"} />
        <Stat label="Расходы на маркетинг" value={formatMoney(total.marketing)} hint={total.netRevenue ? `${Math.round((total.marketing / total.netRevenue) * 100)}% выручки` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="card p-5">
          <Eyebrow>Чистая выручка и операционная прибыль</Eyebrow>
          <div className="mt-4"><BarChart data={rows.map((r) => ({ label: r.label, value: Math.max(0, r.netRevenue), sub: Math.max(0, r.operating) }))} /></div>
          <div className="mt-2 flex gap-4 text-xs text-muted"><span><span className="mr-1 inline-block h-2 w-2 bg-taupe" />выручка</span><span><span className="mr-1 inline-block h-2 w-2 bg-champagne" />операционная прибыль</span></div>
        </div>
        <div className="card p-5">
          <Eyebrow>Юнит-экономика, {months} мес.</Eyebrow>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ["Заказов", ue.orders],
              ["Средний чек", formatMoney(ue.aov)],
              ["Вещей в чеке", ue.upt],
              ["Валовая прибыль на заказ", formatMoney(ue.grossPerOrder)],
              ["Доля возвратов, шт.", `${ue.returnRate}%`],
              ["Новых покупательниц", ue.newBuyers],
              ["CAC (маркетинг / новые)", formatMoney(ue.cac)],
              ["Средний LTV", formatMoney(ue.ltv)],
              ["LTV / CAC", ue.cac ? (ue.ltv / ue.cac).toFixed(1) : "—"],
            ].map(([k, v]) => <div key={String(k)} className="flex justify-between border-b border-line/60 pb-1.5"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="p-5 pb-2"><Eyebrow>Отчёт о прибылях и убытках</Eyebrow></div>
        <table className="table text-xs">
          <thead><tr><th>Статья</th>{rows.map((r) => <th key={r.key} className="text-right">{r.label}</th>)}<th className="text-right">Итого</th></tr></thead>
          <tbody>
            {LINES.map((l) => (
              <tr key={l.key} className={l.strong ? "bg-ivory" : ""}>
                <td className={l.strong ? "font-medium" : "text-muted"}>{l.label}</td>
                {[...rows, total].map((r) => {
                  const v = r[l.key] as number;
                  return (
                    <td key={r.key} className={`whitespace-nowrap text-right ${l.strong ? "font-medium" : ""} ${l.strong && v < 0 ? "text-danger" : ""}`}>
                      {v ? `${l.neg ? "−" : ""}${short(v)}` : "—"}
                      {l.pct && r.netRevenue ? <div className="text-[0.6rem] text-muted">{r[l.pct] as number}%</div> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <Eyebrow>Активы и обязательства сейчас</Eyebrow>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Товарный запас по себестоимости</dt><dd>{formatMoney(bs.inventoryCost)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Товарный запас в розничных ценах</dt><dd>{formatMoney(bs.inventoryRetail)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Обязательства по баллам Circle</dt><dd className="text-danger">{formatMoney(bs.pointsLiability)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Неоплаченные заказы ({bs.unpaidCount})</dt><dd>{formatMoney(bs.unpaidOrders)}</dd></div>
          </dl>
        </div>
        <div className="card p-5">
          <Eyebrow>Способы оплаты, {months} мес.</Eyebrow>
          <div className="mt-4"><HBar items={mix.map((m) => ({ label: `${PAYMENT_METHOD[m.method]} · ${m.count}`, value: m.amount, display: formatMoney(m.amount) }))} /></div>
        </div>
      </div>

      <div className="card p-5">
        <Eyebrow>Добавить расход или доход</Eyebrow>
        <div className="mt-3"><LedgerForm /></div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex flex-wrap items-center gap-2 p-5 pb-2">
          <Eyebrow>Проводки</Eyebrow>
          <Link href={qs("/crm/finance", { months })} className={`badge ${!type ? "border-ink bg-ink text-ivory" : "border-line"}`}>Все</Link>
          {(Object.keys(LEDGER_TYPE) as LedgerType[]).map((t) => <Link key={t} href={qs("/crm/finance", { months, type: t })} className={`badge ${type === t ? "border-ink bg-ink text-ivory" : "border-line"}`}>{LEDGER_TYPE[t].label}</Link>)}
        </div>
        <table className="table">
          <thead><tr><th>Дата</th><th>Статья</th><th>Категория</th><th>Основание</th><th className="text-right">Сумма</th><th /></tr></thead>
          <tbody>
            {ledger.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-muted">{formatDate(e.date)}</td>
                <td>{LEDGER_TYPE[e.type].label}</td>
                <td className="text-muted">{e.category ?? "—"}</td>
                <td>{e.order ? <Link href={`/crm/orders/${e.order.id}`} className="underline">Заказ №{e.order.number}</Link> : e.comment ?? "—"}</td>
                <td className={`whitespace-nowrap text-right ${LEDGER_TYPE[e.type].sign > 0 ? "text-success" : ""}`}>{LEDGER_TYPE[e.type].sign > 0 ? "+" : "−"}{formatMoney(e.amount)}</td>
                <td>{!e.orderId && <form action={deleteLedgerAction}><input type="hidden" name="id" value={e.id} /><ConfirmButton message="Удалить проводку?" className="text-xs text-muted hover:text-danger">удалить</ConfirmButton></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 pb-5"><Pager page={page} pages={Math.ceil(ledgerTotal / PER)} href={(p) => qs("/crm/finance", { months, type, page: p })} /></div>
      </div>
    </div>
  );
}
