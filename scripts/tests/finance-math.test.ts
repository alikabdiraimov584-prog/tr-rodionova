// Проверка расчёта остатка ДДС при дате начала учёта не 1-го числа, процентов при отрицательной выручке и разбивки без себестоимости.
import { db } from "@/lib/db";
import { cashFlowByMonth, pnlByMonth, sumRows, expenseBreakdown } from "@/lib/finance";
let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n}${extra ? " — " + extra : ""}`); if (!ok) fails++; };
async function main() {
  const tag = `fin-test-${Date.now()}`;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const d = (day: number) => new Date(Date.UTC(y, m, day));
  try {
    await db.ledgerEntry.createMany({ data: [
      { type: "INCOME_SALE", amount: 20_000_00, date: d(3), counterparty: tag },
      { type: "EXPENSE_RENT", amount: 5_000_00, date: d(20), counterparty: tag },
      { type: "EXPENSE_COGS", amount: 7_000_00, date: d(3), counterparty: tag },
      { type: "EXPENSE_PRODUCTION", amount: 3_000_00, date: d(4), counterparty: tag },
    ] });
    const opening = `${y}-${String(m + 1).padStart(2, "0")}-15`;
    const rows = await cashFlowByMonth(1, { openingBalance: 100_000_00, openingDate: opening });
    const last = rows[rows.length - 1];
    // остаток «на 15-е» уже содержит оплату 3-го; после 15-го только аренда: ожидаем 100 000 − 5 000 − (прочие проводки месяца после 15-го)
    const others = await db.$queryRaw<{ net: bigint }[]>`SELECT coalesce(sum(CASE WHEN type::text LIKE 'INCOME%' OR type::text = 'OWNER_CONTRIBUTION' THEN amount ELSE -amount END), 0)::bigint AS net FROM "LedgerEntry" WHERE date >= ${new Date(Date.UTC(y, m, 15))} AND type::text NOT IN ('EXPENSE_COGS','COGS_REVERSAL') AND coalesce(counterparty,'') <> ${tag}`;
    const expected = 100_000_00 - 5_000_00 + Number(others[0]?.net ?? 0);
    check("остаток ДДС при дате начала учёта 15-го не включает оплату 3-го", last.balance === expected, `balance=${last.balance} expected=${expected}`);
    const first = await cashFlowByMonth(1, { openingBalance: 100_000_00, openingDate: `${y}-${String(m + 1).padStart(2, "0")}-01` });
    const allNet = await db.$queryRaw<{ net: bigint }[]>`SELECT coalesce(sum(CASE WHEN type::text LIKE 'INCOME%' OR type::text = 'OWNER_CONTRIBUTION' THEN amount ELSE -amount END), 0)::bigint AS net FROM "LedgerEntry" WHERE date >= ${new Date(Date.UTC(y, m, 1))} AND type::text NOT IN ('EXPENSE_COGS','COGS_REVERSAL')`;
    check("остаток ДДС с 1-го числа = остаток + весь поток месяца", first[first.length - 1].balance === 100_000_00 + Number(allNet[0]?.net ?? 0), `balance=${first[first.length - 1].balance}`);
    const noDate = await cashFlowByMonth(1, { openingBalance: 100_000_00, openingDate: "" });
    check("без даты остаток не показывается", Number.isNaN(noDate[noDate.length - 1].balance));
    const br = await expenseBreakdown(new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m + 1, 1)));
    check("разбивка расходов без себестоимости", !br.some((b) => b.type === "EXPENSE_COGS" || b.type === "COGS_REVERSAL"));
    const pnl = await pnlByMonth(1);
    const cur = pnl[pnl.length - 1];
    check("P&L: производство не входит в операционные расходы", cur.opex === cur.acquiring + cur.shipping + cur.marketing + cur.salary + cur.rent + cur.services + cur.tax + cur.other);
    const prod = await db.$queryRaw<{ s: bigint }[]>`SELECT coalesce(sum(amount), 0)::bigint AS s FROM "LedgerEntry" WHERE type = 'EXPENSE_PRODUCTION' AND date >= ${new Date(Date.UTC(y, m, 1))}`;
    check("P&L по расходам на производство: себестоимость = проводки «Производство» месяца", cur.cogs === Number(prod[0]?.s ?? 0), `${cur.cogs} vs ${Number(prod[0]?.s ?? 0)}`);
    const byCogs = (await pnlByMonth(1, "cogs")).pop()!;
    const cogsSum = await db.$queryRaw<{ s: bigint }[]>`SELECT coalesce(sum(CASE WHEN type = 'EXPENSE_COGS' THEN amount ELSE -amount END), 0)::bigint AS s FROM "LedgerEntry" WHERE type IN ('EXPENSE_COGS', 'COGS_REVERSAL') AND date >= ${new Date(Date.UTC(y, m, 1))}`;
    check("P&L по цене закупки: себестоимость = COGS − сторно", byCogs.cogs === Number(cogsSum[0]?.s ?? 0), `${byCogs.cogs} vs ${Number(cogsSum[0]?.s ?? 0)}`);
    const neg = sumRows([{ ...cur, netRevenue: -10_000_00, gross: -6_000_00, operating: -8_000_00, sales: 0, otherIncome: 0, refunds: 10_000_00, cogs: -4_000_00 }]);
    check("проценты при отрицательной выручке = 0", neg.grossPct === 0 && neg.operatingPct === 0, `${neg.grossPct}/${neg.operatingPct}`);
  } finally {
    await db.ledgerEntry.deleteMany({ where: { counterparty: tag } });
  }
  console.log(fails ? `FAILED: ${fails}` : "finance-math: все проверки PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
