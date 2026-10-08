import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { pnlByMonth, sumRows, unitEconomics, paymentMix, balanceSheetLite, cashFlowByMonth, sumCash, expenseBreakdown, ledgerSuggestions, stockReport, monthRange, type PnlRow, type CashRow } from "@/lib/finance";
import { formatDate, formatMoney } from "@/lib/money";
import { LEDGER_TYPE, MANUAL_LEDGER_TYPES, PAYMENT_METHOD, isSystemLedgerEntry } from "@/lib/labels";
import { Eyebrow, PageTitle, Stat } from "@/components/ui";
import { BarChart, HBar } from "@/components/crm/charts";
import { LedgerForm, SettingsForm } from "@/components/crm/admin-forms";
import { ConfirmButton } from "@/components/form";
import { deleteLedgerAction } from "@/app/actions/crm-admin";
import { Pager, qs, str } from "@/components/crm/pager";
import type { LedgerType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Финансы" };
const PER = 40;
const TABS: [string, string][] = [["overview", "Обзор"], ["cashflow", "ДДС"], ["pnl", "P&L"], ["expenses", "Расходы"], ["stock", "Склад"]];

const PNL_LINES: { key: keyof PnlRow; label: string; strong?: boolean; neg?: boolean; pct?: keyof PnlRow }[] = [
  { key: "sales", label: "Выручка от продаж" },
  { key: "otherIncome", label: "Прочие доходы" },
  { key: "refunds", label: "Возвраты покупателям", neg: true },
  { key: "netRevenue", label: "Чистая выручка", strong: true },
  { key: "cogs", label: "Себестоимость", neg: true },
  { key: "gross", label: "Валовая прибыль", strong: true, pct: "grossPct" },
  { key: "acquiring", label: "Эквайринг", neg: true },
  { key: "shipping", label: "Доставка", neg: true },
  { key: "marketing", label: "Маркетинг", neg: true },
  { key: "salary", label: "Зарплаты и подрядчики", neg: true },
  { key: "rent", label: "Аренда", neg: true },
  { key: "services", label: "Сервисы и сайт", neg: true },
  { key: "tax", label: "Налоги и взносы", neg: true },
  { key: "other", label: "Прочие расходы", neg: true },
  { key: "opex", label: "Операционные расходы", strong: true },
  { key: "operating", label: "Операционная прибыль", strong: true, pct: "operatingPct" },
];

const CASH_LINES: { key: keyof CashRow; label: string; strong?: boolean; neg?: boolean; group?: string }[] = [
  { key: "inSales", label: "Оплаты заказов", group: "Поступления" },
  { key: "inOther", label: "Прочие поступления" },
  { key: "inflow", label: "Всего поступлений", strong: true },
  { key: "outProduction", label: "Производство: ткани, пошив", neg: true, group: "Выплаты" },
  { key: "outMarketing", label: "Маркетинг", neg: true },
  { key: "outShipping", label: "Доставка и логистика", neg: true },
  { key: "outSalary", label: "Зарплаты и подрядчики", neg: true },
  { key: "outRent", label: "Аренда", neg: true },
  { key: "outServices", label: "Сервисы, сайт, банк", neg: true },
  { key: "outTax", label: "Налоги и взносы", neg: true },
  { key: "outAcquiring", label: "Эквайринг", neg: true },
  { key: "outRefunds", label: "Возвраты покупателям", neg: true },
  { key: "outOther", label: "Прочие выплаты", neg: true },
  { key: "outflow", label: "Всего выплат", strong: true, neg: true },
  { key: "operating", label: "Поток от операций", strong: true },
  { key: "ownerIn", label: "Взносы собственника, займы", group: "Собственник" },
  { key: "ownerOut", label: "Вывод собственнику", neg: true },
  { key: "net", label: "Чистый денежный поток", strong: true },
  { key: "balance", label: "Остаток на конец месяца", strong: true },
];

const short = (k: number) => {
  if (Number.isNaN(k)) return "—";
  const r = Math.round(k / 100);
  if (Math.abs(r) >= 1_000_000) return `${(r / 1_000_000).toFixed(1)} млн`;
  if (Math.abs(r) >= 1000) return `${Math.round(r / 1000)} тыс`;
  return String(r);
};
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function MonthTable<T extends { key: string; label: string }>({ rows, total, lines, netKey }: { rows: T[]; total: T; lines: { key: keyof T; label: string; strong?: boolean; neg?: boolean; group?: string; pct?: keyof T }[]; netKey?: keyof T }) {
  return (
    <table className="table text-xs">
      <thead><tr><th>Статья</th>{rows.map((r) => <th key={r.key} className="text-right">{r.label}</th>)}<th className="text-right">Итого</th></tr></thead>
      <tbody>
        {lines.map((l) => (
          <Fragment key={l.key as string}>
            {l.group && <tr><td colSpan={rows.length + 2} className="pt-3 text-[0.62rem] uppercase tracking-[0.16em] text-muted">{l.group}</td></tr>}
            <tr className={l.strong ? "bg-ivory" : ""}>
              <td className={l.strong ? "font-medium" : "text-muted"}>{l.label}</td>
              {[...rows, total].map((r) => {
                const v = r[l.key] as unknown as number;
                const shown = Number.isNaN(v) ? "—" : v ? `${l.neg && v > 0 ? "−" : ""}${short(v)}` : "—";
                return (
                  <td key={r.key} className={`whitespace-nowrap text-right ${l.strong ? "font-medium" : ""} ${l.strong && v < 0 ? "text-danger" : ""}`}>
                    {shown}
                    {l.pct && netKey && (r[netKey] as unknown as number) ? <div className="text-[0.6rem] text-muted">{r[l.pct] as unknown as number}%</div> : null}
                  </td>
                );
              })}
            </tr>
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

export default async function Finance({ searchParams }: PageProps<"/crm/finance">) {
  await requireSection("finance");
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === str(sp.tab)) ? (str(sp.tab) as string) : "overview";
  const months = Number(str(sp.months) ?? 6) === 12 ? 12 : 6;
  // параметры адреса проверяются: опечатка в ссылке не должна ронять страницу
  const type = Object.hasOwn(LEDGER_TYPE, str(sp.type) ?? "") ? (str(sp.type) as LedgerType) : undefined;
  const pageNum = Number(str(sp.page) ?? 1);
  const page = Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1;
  const edit = str(sp.edit);
  const from = monthRange(months);
  const now = new Date();
  const monthParam = str(sp.month) ?? "";
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) && !Number.isNaN(new Date(`${monthParam}-01T00:00:00`).getTime()) ? monthParam : keyOf(now);
  const monthFrom = new Date(`${monthKey}-01T00:00:00`);
  const monthTo = new Date(monthFrom);
  monthTo.setMonth(monthTo.getMonth() + 1);
  const finance = await getSetting("finance");
  const base = (p: Record<string, string | number | undefined>) => qs("/crm/finance", { tab, months, ...p });

  // считаем только то, что показывает открытая вкладка, и параллельно: «Расходы» не ждут P&L и ДДС за полгода
  const needPnl = tab === "overview" || tab === "pnl";
  const needCash = tab === "overview" || tab === "cashflow";
  const needBs = tab === "overview" || tab === "stock";
  const [rows, cash, bsOrNull] = await Promise.all([
    needPnl ? pnlByMonth(months, finance.pnlCost) : ([] as PnlRow[]),
    needCash ? cashFlowByMonth(months, finance) : ([] as CashRow[]),
    needBs ? balanceSheetLite() : null,
  ]);
  const total = sumRows(rows);
  const cashTotal = sumCash(cash);
  const bs = bsOrNull as Awaited<ReturnType<typeof balanceSheetLite>>;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Финансы"
        actions={
          <>
            {[6, 12].map((m) => <Link key={m} href={qs("/crm/finance", { tab, months: m })} className={`btn-sm btn ${months === m ? "bg-ink text-ivory" : "border border-line"}`} aria-current={months === m ? "true" : undefined}>{m} мес.</Link>)}
            <a href={qs("/crm/finance/export", { months, report: tab === "cashflow" ? "cashflow" : tab === "pnl" ? "pnl" : "ledger" })} className="btn-outline btn-sm">Экспорт CSV</a>
          </>
        }
      >
        Выручка, возвраты и себестоимость приходят из заказов сами; расходы, налоги, взносы и выводы вводятся на вкладке «Расходы» и сразу попадают в ДДС и P&L. ДДС — деньги по датам оплат, P&L — результат с себестоимостью проданного: ткани и пошив входят в него через цену закупки из карточки вещи, а в ДДС — статьёй «Производство».
      </PageTitle>

      <nav className="flex flex-wrap gap-1 border-b border-line text-sm" aria-label="Разделы финансов">
        {TABS.map(([t, label]) => (
          <Link key={t} href={qs("/crm/finance", { tab: t, months })} className={`-mb-px border-b-2 px-3 py-2 ${tab === t ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`} aria-current={tab === t ? "page" : undefined}>{label}</Link>
        ))}
      </nav>

      {tab === "overview" && <Overview rows={rows} total={total} cash={cash} cashTotal={cashTotal} bs={bs} months={months} from={from} />}
      {tab === "cashflow" && <CashFlow cash={cash} cashTotal={cashTotal} finance={finance} />}
      {tab === "pnl" && <Pnl rows={rows} total={total} monthKey={monthKey} monthFrom={monthFrom} monthTo={monthTo} base={base} method={finance.pnlCost} />}
      {tab === "expenses" && <Expenses type={type} page={page} edit={edit} base={base} />}
      {tab === "stock" && <StockTab months={months} bs={bs} />}
    </div>
  );
}

async function Overview({ rows, total, cash, cashTotal, bs, months, from }: { rows: PnlRow[]; total: PnlRow; cash: CashRow[]; cashTotal: CashRow; bs: Awaited<ReturnType<typeof balanceSheetLite>>; months: number; from: Date }) {
  const [ue, mix] = await Promise.all([unitEconomics(from), paymentMix(from)]);
  const last = cash[cash.length - 1];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Чистая выручка, ${months} мес.`} value={formatMoney(total.netRevenue)} />
        <Stat label="Валовая маржа" value={`${total.grossPct}%`} hint={formatMoney(total.gross)} />
        <Stat label="Операционная прибыль" value={formatMoney(total.operating)} hint={`рентабельность ${total.operatingPct}%`} tone={total.operating >= 0 ? "success" : "danger"} />
        <Stat label="Деньги на конец месяца" value={Number.isNaN(cashTotal.balance) ? "—" : formatMoney(cashTotal.balance)} hint={Number.isNaN(cashTotal.balance) ? "укажите дату начала учёта во вкладке ДДС" : `поток за ${last.label}: ${formatMoney(last.net)}`} tone={!Number.isNaN(cashTotal.balance) && cashTotal.balance < 0 ? "danger" : undefined} />
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
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <Eyebrow>Деньги по месяцам: поступления и выплаты</Eyebrow>
          <div className="mt-4"><BarChart data={cash.map((r) => ({ label: r.label, value: r.inflow + r.ownerIn, sub: r.outflow + r.ownerOut }))} /></div>
          <div className="mt-2 flex gap-4 text-xs text-muted"><span><span className="mr-1 inline-block h-2 w-2 bg-taupe" />поступления</span><span><span className="mr-1 inline-block h-2 w-2 bg-champagne" />выплаты</span></div>
        </div>
        <div className="card p-5">
          <Eyebrow>Активы и обязательства сейчас</Eyebrow>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Товарный запас по себестоимости</dt><dd>{formatMoney(bs.inventoryCost)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Товарный запас в розничных ценах</dt><dd>{formatMoney(bs.inventoryRetail)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Обязательства по баллам Circle</dt><dd className="text-danger">{formatMoney(bs.pointsLiability)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Неоплаченные заказы ({bs.unpaidCount})</dt><dd>{formatMoney(bs.unpaidOrders)}</dd></div>
          </dl>
          <div className="mt-5"><Eyebrow>Способы оплаты, {months} мес.</Eyebrow><div className="mt-3"><HBar items={mix.map((m) => ({ label: `${PAYMENT_METHOD[m.method]} · ${m.count}`, value: m.amount, display: formatMoney(m.amount) }))} /></div></div>
        </div>
      </div>
    </>
  );
}

function CashFlow({ cash, cashTotal, finance }: { cash: CashRow[]; cashTotal: CashRow; finance: { openingBalance: number; openingDate: string } }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Поступления за период" value={formatMoney(cashTotal.inflow + cashTotal.ownerIn)} hint={`оплаты заказов ${formatMoney(cashTotal.inSales)}`} />
        <Stat label="Выплаты за период" value={formatMoney(cashTotal.outflow + cashTotal.ownerOut)} hint={`производство ${formatMoney(cashTotal.outProduction)}`} />
        <Stat label="Чистый денежный поток" value={formatMoney(cashTotal.net)} tone={cashTotal.net >= 0 ? "success" : "danger"} hint={Number.isNaN(cashTotal.balance) ? "остаток не считается: нет даты начала учёта" : `остаток на конец периода ${formatMoney(cashTotal.balance)}`} />
      </div>
      <div className="card overflow-x-auto" tabIndex={0}>
        <div className="p-5 pb-2"><Eyebrow>Движение денежных средств по месяцам</Eyebrow><p className="mt-1 text-xs text-muted">Оплаты заказов попадают сюда в день оплаты, возвраты — в день возврата, расходы — датой оплаты из вкладки «Расходы». Себестоимость здесь не учитывается: деньги за ткани и пошив идут статьёй «Производство».</p></div>
        <MonthTable rows={cash} total={cashTotal} lines={CASH_LINES} />
      </div>
      <div className="card p-5">
        <Eyebrow>Начало учёта</Eyebrow>
        <p className="mt-1 text-xs text-muted">Остаток денег на счёте и в кассе на утро указанной даты: проводки раньше неё в остаток не прибавляются. От него считается строка «Остаток на конец месяца». Без даты остаток не показывается, а потоки считаются всё равно.</p>
        <div className="mt-3">
          <SettingsForm section="finance">
            <div className="grid gap-3 sm:grid-cols-2 md:max-w-xl">
              <label><span className="label">Остаток на начало, ₽</span><input name="openingBalance" inputMode="decimal" defaultValue={finance.openingBalance ? (finance.openingBalance / 100).toString() : ""} placeholder="0" className="input py-2" /></label>
              <label><span className="label">Дата начала учёта</span><input aria-label="Дата начала учёта" name="openingDate" type="date" defaultValue={finance.openingDate} required={!finance.openingDate && finance.openingBalance !== 0} className="input py-2" /></label>
            </div>
          </SettingsForm>
        </div>
      </div>
    </>
  );
}

async function Pnl({ rows, total, monthKey, monthFrom, monthTo, base, method }: { rows: PnlRow[]; total: PnlRow; monthKey: string; monthFrom: Date; monthTo: Date; base: (p: Record<string, string | number | undefined>) => string; method: "production" | "cogs" }) {
  const breakdown = await expenseBreakdown(monthFrom, monthTo);
  const lines = PNL_LINES.map((l) => (l.key === "cogs" ? { ...l, label: method === "cogs" ? "Себестоимость проданного (по карточкам)" : "Производство: ткани, пошив" } : l));
  const sum = breakdown.reduce((s, b) => s + b.amount, 0);
  const prev = new Date(monthFrom); prev.setMonth(prev.getMonth() - 1);
  const next = new Date(monthFrom); next.setMonth(next.getMonth() + 1);
  const k = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return (
    <>
      <div className="card overflow-x-auto" tabIndex={0}>
        <div className="p-5 pb-2">
          <Eyebrow>Отчёт о прибылях и убытках по месяцам</Eyebrow>
          <p className="mt-1 text-xs text-muted">
            Выручка — по дате оплаты заказа, возвраты её уменьшают.{" "}
            {method === "cogs"
              ? "Себестоимость списывается при продаже по цене закупки из карточки вещи (возврат её восстанавливает); расходы «Производство» — вложение в запас, они видны в ДДС и в разбивке ниже, а в таблицу не входят."
              : "Себестоимость — фактические расходы на ткани и пошив (статья «Производство») в месяце оплаты; цена закупки из карточек здесь не используется."}{" "}
            Взносы и выводы собственника в P&L не входят.
          </p>
        </div>
        <MonthTable rows={rows} total={total} lines={lines} netKey="netRevenue" />
      </div>
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>Расходы за {monthLabel(monthKey)}: по статьям и категориям</Eyebrow>
          <div className="flex gap-2 text-xs"><Link href={base({ month: k(prev) })} className="btn-outline btn-sm">← {monthLabel(k(prev))}</Link>{next <= new Date() && <Link href={base({ month: k(next) })} className="btn-outline btn-sm">{monthLabel(k(next))} →</Link>}</div>
        </div>
        {breakdown.length === 0 ? (
          <p className="mt-3 text-sm text-muted">За этот месяц денежных расходов нет. Добавьте их на вкладке «Расходы».</p>
        ) : (
          <div className="mt-4"><HBar items={breakdown.map((b) => ({ label: `${LEDGER_TYPE[b.type].label}${b.category ? ` · ${b.category}` : ""} · ${b.count}`, value: b.amount, display: `${formatMoney(b.amount)} (${sum ? Math.round((b.amount / sum) * 100) : 0}%)` }))} /></div>
        )}
      </div>
      <div className="card p-5">
        <Eyebrow>Как считать себестоимость в P&L</Eyebrow>
        <p className="mt-1 text-xs text-muted">Один из двух способов, не оба сразу: иначе одна закупка ткани попала бы в отчёт дважды.</p>
        <SettingsForm section="finance">
          <div className="mt-3 space-y-2 text-sm">
            <label className="flex gap-2"><input type="radio" name="pnlCost" value="production" defaultChecked={method === "production"} className="mt-1 accent-black" /><span><b>По расходам на производство</b> — то, что вы вводите на вкладке «Расходы» статьёй «Производство», в месяце оплаты. Подходит, пока цена закупки в карточках вещей не ведётся.</span></label>
            <label className="flex gap-2"><input type="radio" name="pnlCost" value="cogs" defaultChecked={method === "cogs"} className="mt-1 accent-black" /><span><b>По цене закупки из карточек</b> — себестоимость списывается при продаже каждой вещи, запас на складе считается вложением. Точнее по месяцам, но требует заполненной цены закупки у всех вещей.</span></label>
          </div>
        </SettingsForm>
      </div>
    </>
  );
}

async function Expenses({ type, page: requested, edit, base }: { type?: LedgerType; page: number; edit?: string; base: (p: Record<string, string | number | undefined>) => string }) {
  const where = type ? { type } : {};
  const ledgerTotal = await db.ledgerEntry.count({ where });
  const pages = Math.max(1, Math.ceil(ledgerTotal / PER));
  const page = Math.min(requested, pages);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const [ledger, suggestions, editing, monthSum] = await Promise.all([
    db.ledgerEntry.findMany({ where, include: { order: { select: { id: true, number: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PER, take: PER }),
    ledgerSuggestions(),
    edit ? db.ledgerEntry.findUnique({ where: { id: edit } }) : null,
    db.ledgerEntry.aggregate({ where: { type: { in: MANUAL_LEDGER_TYPES.filter((t) => t.startsWith("EXPENSE")) }, date: { gte: monthStart, lt: nextMonth } }, _sum: { amount: true } }),
  ]);
  const initial = editing && !isSystemLedgerEntry(editing) ? { id: editing.id, type: editing.type, amount: editing.amount, date: editing.date.toISOString().slice(0, 10), category: editing.category ?? "", counterparty: editing.counterparty ?? "", comment: editing.comment ?? "" } : undefined;
  return (
    <>
      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Eyebrow>{initial ? "Изменить проводку" : "Добавить расход, доход, взнос или вывод"}</Eyebrow>
          <span className="text-xs text-muted">Расходов в этом месяце: {formatMoney(monthSum._sum.amount ?? 0)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">Дата — день, когда деньги ушли или пришли. Себестоимость вещей вводить не нужно: она списывается при продаже из цены закупки в карточке товара.</p>
        <div className="mt-3"><LedgerForm key={initial?.id ?? "new"} initial={initial} categories={suggestions.categories} counterparties={suggestions.counterparties} cancelHref={base({ edit: undefined, type, page: page > 1 ? page : undefined })} /></div>
      </div>
      <div className="card overflow-x-auto" tabIndex={0}>
        <div className="flex flex-wrap items-center gap-2 p-5 pb-2">
          <Eyebrow>Проводки</Eyebrow>
          <Link href={base({ type: undefined, page: undefined })} className={`badge ${!type ? "border-ink bg-ink text-ivory" : "border-line"}`} aria-current={!type ? "true" : undefined}>Все</Link>
          {(Object.keys(LEDGER_TYPE) as LedgerType[]).map((t) => <Link key={t} href={base({ type: t, page: undefined })} className={`badge ${type === t ? "border-ink bg-ink text-ivory" : "border-line"}`} aria-current={type === t ? "true" : undefined}>{LEDGER_TYPE[t].label}</Link>)}
        </div>
        <table className="table">
          <thead><tr><th>Дата</th><th>Статья</th><th>Категория</th><th>Кому / от кого</th><th>Основание</th><th className="text-right">Сумма</th><th /></tr></thead>
          <tbody>
            {ledger.map((e) => (
              <tr key={e.id} className={e.id === edit ? "bg-ivory" : ""}>
                <td className="whitespace-nowrap text-muted">{formatDate(e.date)}</td>
                <td>{LEDGER_TYPE[e.type].label}</td>
                <td className="text-muted">{e.category ?? "—"}</td>
                <td className="text-muted">{e.counterparty ?? "—"}</td>
                <td>{e.order ? <Link href={`/crm/orders/${e.order.id}`} className="underline">Заказ №{e.order.number}</Link> : e.comment ?? "—"}</td>
                <td className={`whitespace-nowrap text-right ${LEDGER_TYPE[e.type].sign > 0 ? "text-success" : ""}`}>{LEDGER_TYPE[e.type].sign > 0 ? "+" : "−"}{formatMoney(e.amount)}</td>
                <td className="whitespace-nowrap text-xs">
                  {!isSystemLedgerEntry(e) && (
                    <span className="flex gap-3">
                      <Link href={base({ edit: e.id, page: page > 1 ? page : undefined, type })} className="text-muted underline hover:text-ink">изменить</Link>
                      <form action={deleteLedgerAction}><input type="hidden" name="id" value={e.id} /><ConfirmButton message="Удалить проводку?" className="text-muted underline hover:text-danger">удалить</ConfirmButton></form>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {ledger.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted">Проводок пока нет</td></tr>}
          </tbody>
        </table>
        <div className="px-5 pb-5"><Pager page={page} pages={pages} href={(p) => base({ type, page: p })} /></div>
      </div>
    </>
  );
}

async function StockTab({ months, bs }: { months: number; bs: Awaited<ReturnType<typeof balanceSheetLite>> }) {
  const stock = await stockReport(months);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Вещей на складе" value={stock.total.qty} hint={`${stock.products.length} моделей в наличии`} />
        <Stat label="Запас по себестоимости" value={formatMoney(stock.total.cost)} hint={stock.total.withoutCost ? `${stock.total.withoutCost} моделей без цены закупки` : "по цене закупки из карточек"} tone={stock.total.withoutCost ? "warning" : undefined} />
        <Stat label="Запас в розничных ценах" value={formatMoney(stock.total.retail)} hint={stock.total.cost ? `наценка ${Math.round(((stock.total.retail - stock.total.cost) / stock.total.cost) * 100)}%` : undefined} />
        <Stat label="Обязательства по баллам" value={formatMoney(bs.pointsLiability)} hint="баллы Circle, которыми могут оплатить" />
      </div>
      <div className="card overflow-x-auto" tabIndex={0}>
        <div className="p-5 pb-2"><Eyebrow>Движение склада по месяцам, штуки и себестоимость</Eyebrow><p className="mt-1 text-xs text-muted">Приход — из поступлений на складе, продажи и возвраты — из заказов, списания и инвентаризация — из раздела «Склад». Себестоимость движения считается по цене закупки на момент операции.</p></div>
        <table className="table text-xs">
          <thead><tr><th>Месяц</th><th className="text-right">Приход</th><th className="text-right">Продано</th><th className="text-right">Возвраты</th><th className="text-right">Списано</th><th className="text-right">Инвентаризация</th></tr></thead>
          <tbody>
            {stock.months.map((m) => (
              <tr key={m.key}>
                <td>{m.label}</td>
                <td className="whitespace-nowrap text-right">{m.receiptQty ? `${m.receiptQty} шт · ${short(m.receiptCost)}` : "—"}</td>
                <td className="whitespace-nowrap text-right">{m.saleQty ? `${m.saleQty} шт · ${short(m.saleCost)}` : "—"}</td>
                <td className="whitespace-nowrap text-right">{m.returnQty ? `${m.returnQty} шт · ${short(m.returnCost)}` : "—"}</td>
                <td className="whitespace-nowrap text-right">{m.writeOffQty ? `${m.writeOffQty} шт · ${short(m.writeOffCost)}` : "—"}</td>
                <td className="whitespace-nowrap text-right">{m.adjustQty ? `${m.adjustQty > 0 ? "+" : ""}${m.adjustQty} шт · ${short(m.adjustCost)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card overflow-x-auto" tabIndex={0}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-2"><Eyebrow>Остатки по вещам</Eyebrow><Link href="/crm/stock" className="text-xs underline">Приход, списание, инвентаризация →</Link></div>
        <table className="table text-xs">
          <thead><tr><th>Вещь</th><th>Категория</th><th className="text-right">Остаток</th><th className="text-right">В резерве</th><th className="text-right">Закупка за шт.</th><th className="text-right">По себестоимости</th><th className="text-right">В рознице</th><th>Заканчиваются</th></tr></thead>
          <tbody>
            {stock.products.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/crm/products/${p.id}`} className="underline">{p.name}</Link><span className="ml-2 text-muted">{p.sku}</span>{p.isPreloved && <span className="ml-2 badge border-line">pre-loved</span>}{p.archived && <span className="ml-2 badge border-line text-muted">архив</span>}</td>
                <td className="text-muted">{p.category || "—"}</td>
                <td className="text-right">{p.qty}</td>
                <td className="text-right text-muted">{p.reserved || "—"}</td>
                <td className="whitespace-nowrap text-right">{p.costPrice != null ? formatMoney(p.costPrice) : <Link href={`/crm/products/${p.id}`} className="text-warning underline">указать</Link>}</td>
                <td className="whitespace-nowrap text-right">{formatMoney(p.cost)}</td>
                <td className="whitespace-nowrap text-right">{formatMoney(p.retail)}</td>
                <td className="text-muted">{p.lowStock.length ? p.lowStock.join(", ") : "—"}</td>
              </tr>
            ))}
            {stock.products.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted">На складе пусто</td></tr>}
          </tbody>
          {stock.products.length > 0 && <tfoot><tr className="bg-ivory font-medium"><td colSpan={2}>Итого</td><td className="text-right">{stock.total.qty}</td><td /><td /><td className="whitespace-nowrap text-right">{formatMoney(stock.total.cost)}</td><td className="whitespace-nowrap text-right">{formatMoney(stock.total.retail)}</td><td /></tr></tfoot>}
        </table>
      </div>
    </>
  );
}
