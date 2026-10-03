import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { LEDGER_TYPE } from "@/lib/labels";
import { audit } from "@/lib/audit";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "finance")) return new Response("Forbidden", { status: 403 });
  const months = Number(new URL(request.url).searchParams.get("months") ?? 12) || 12;
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  from.setMonth(from.getMonth() - (months - 1));
  const rows = await db.ledgerEntry.findMany({ where: { date: { gte: from } }, include: { order: { select: { number: true } } }, orderBy: { date: "asc" } });
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ["Дата;Статья;Знак;Сумма, ₽;Категория;Заказ;Комментарий"];
  for (const r of rows) {
    lines.push([r.date.toISOString().slice(0, 10), LEDGER_TYPE[r.type].label, LEDGER_TYPE[r.type].sign > 0 ? "+" : "-", (r.amount / 100).toFixed(2).replace(".", ","), r.category, r.order?.number, r.comment].map(esc).join(";"));
  }
  await audit(user.id, "finance.export", "LedgerEntry", null, { months, count: rows.length });
  return new Response("﻿" + lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ledger-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
