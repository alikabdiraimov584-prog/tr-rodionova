import { db } from "@/lib/db";
import { getCurrentUser, twoFactorMissing } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { LEDGER_TYPE } from "@/lib/labels";
import { cashFlowByMonth, monthRange, pnlByMonth, sumCash, sumRows } from "@/lib/finance";
import { audit } from "@/lib/audit";

const esc = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rub = (k: number) => (Number.isNaN(k) ? "" : (k / 100).toFixed(2).replace(".", ","));

/** Экспорт CSV: report=ledger — все проводки за период; cashflow — ДДС по месяцам; pnl — P&L по месяцам. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "finance")) return new Response("Forbidden", { status: 403 });
  if (await twoFactorMissing(user)) return new Response("Forbidden: подтвердите второй фактор", { status: 403 });
  const url = new URL(request.url);
  const months = [6, 12, 24].includes(Number(url.searchParams.get("months"))) ? Number(url.searchParams.get("months")) : 12;
  const report = url.searchParams.get("report") ?? "ledger";
  const from = monthRange(months);
  let lines: string[] = [];
  let name = "ledger";
  if (report === "cashflow") {
    name = "cashflow";
    const rows = await cashFlowByMonth(months, await getSetting("finance"));
    const total = sumCash(rows);
    const cols: [keyof typeof total, string][] = [["inSales", "Оплаты заказов"], ["inOther", "Прочие поступления"], ["inflow", "Всего поступлений"], ["outProduction", "Производство"], ["outMarketing", "Маркетинг"], ["outShipping", "Доставка"], ["outSalary", "Зарплаты"], ["outRent", "Аренда"], ["outServices", "Сервисы и сайт"], ["outTax", "Налоги и взносы"], ["outAcquiring", "Эквайринг"], ["outRefunds", "Возвраты покупателям"], ["outOther", "Прочие выплаты"], ["outflow", "Всего выплат"], ["operating", "Поток от операций"], ["ownerIn", "Взносы собственника"], ["ownerOut", "Вывод собственнику"], ["net", "Чистый денежный поток"], ["balance", "Остаток на конец месяца"]];
    lines = [["Месяц", ...cols.map((c) => c[1])].join(";")];
    for (const r of [...rows, total]) lines.push([r.key, ...cols.map((c) => rub(r[c[0]] as number))].join(";"));
  } else if (report === "pnl") {
    name = "pnl";
    const rows = await pnlByMonth(months);
    const total = sumRows(rows);
    const cols: [keyof typeof total, string][] = [["sales", "Выручка от продаж"], ["otherIncome", "Прочие доходы"], ["refunds", "Возвраты"], ["netRevenue", "Чистая выручка"], ["cogs", "Себестоимость"], ["gross", "Валовая прибыль"], ["grossPct", "Валовая маржа, %"], ["acquiring", "Эквайринг"], ["shipping", "Доставка"], ["marketing", "Маркетинг"], ["salary", "Зарплаты"], ["rent", "Аренда"], ["services", "Сервисы и сайт"], ["tax", "Налоги и взносы"], ["other", "Прочие расходы"], ["opex", "Операционные расходы"], ["operating", "Операционная прибыль"], ["operatingPct", "Рентабельность, %"]];
    lines = [["Месяц", ...cols.map((c) => c[1])].join(";")];
    for (const r of [...rows, total]) lines.push([r.key, ...cols.map((c) => (c[0].endsWith("Pct") ? String(r[c[0]]) : rub(r[c[0]] as number)))].join(";"));
  } else {
    const rows = await db.ledgerEntry.findMany({ where: { date: { gte: from } }, include: { order: { select: { number: true } } }, orderBy: { date: "asc" } });
    lines = ["Дата;Статья;Доход или расход;Сумма, ₽;Категория;Кому / от кого;Заказ;Комментарий"];
    for (const r of rows) {
      // знак и суммы вычисляются, экранировать нужно только свободный текст
      lines.push([r.date.toISOString().slice(0, 10), esc(LEDGER_TYPE[r.type].label), LEDGER_TYPE[r.type].sign > 0 ? "доход" : "расход", rub(r.amount), esc(r.category), esc(r.counterparty), esc(r.order?.number), esc(r.comment)].join(";"));
    }
  }
  await audit(user.id, "finance.export", "LedgerEntry", null, { months, report, count: lines.length - 1 });
  return new Response("﻿" + lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
