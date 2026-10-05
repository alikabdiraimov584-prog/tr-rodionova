import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { PageTitle } from "@/components/ui";
import { Pager, qs, str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Журнал действий" };
const PER = 60;

export default async function Audit({ searchParams }: PageProps<"/crm/audit">) {
  await requireSection("audit");
  const sp = await searchParams;
  const action = str(sp.action);
  const page = Math.max(1, Number(str(sp.page) ?? 1));
  const where = action ? { action: { startsWith: action } } : {};
  const [rows, total, groups] = await Promise.all([
    db.auditLog.findMany({ where, include: { user: { select: { firstName: true, lastName: true, role: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER }),
    db.auditLog.count({ where }),
    db.$queryRaw<{ g: string; n: bigint }[]>`SELECT split_part(action, '.', 1) AS g, count(*)::bigint AS n FROM "AuditLog" GROUP BY 1 ORDER BY 2 DESC`,
  ]);
  return (
    <div>
      <PageTitle title="Журнал действий">Кто и что менял: заказы, баллы, склад, финансы, сотрудники, настройки, входы и экспорт данных.</PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        <a href="/crm/audit" className={`badge ${!action ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>Все</a>
        {groups.map((g) => <a key={g.g} href={qs("/crm/audit", { action: g.g })} className={`badge ${action === g.g ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>{g.g} · {Number(g.n)}</a>)}
      </div>
      <div className="card overflow-x-auto" tabIndex={0}>
        <table className="table text-xs">
          <thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Детали</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-muted">{formatDate(r.createdAt, true)}</td>
                <td>{r.user ? `${r.user.firstName} ${r.user.lastName ?? ""}` : "Система"}</td>
                <td className="font-mono">{r.action}</td>
                <td className="text-muted">{r.entity}{r.entityId ? ` · ${r.entityId.slice(0, 10)}` : ""}</td>
                <td className="max-w-md truncate font-mono text-muted">{r.payload ? JSON.stringify(r.payload) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={Math.ceil(total / PER)} href={(p) => qs("/crm/audit", { action, page: p })} />
    </div>
  );
}
