import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { customerStats } from "@/lib/analytics";
import { rfmSegment, SEGMENTS, daysSince } from "@/lib/rfm";
import { formatDate, formatMoney } from "@/lib/money";
import { Badge, PageTitle } from "@/components/ui";
import { Pager, qs, str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Клиенты" };
const PER = 40;

const SORTS = {
  spent: "Сумма покупок",
  recent: "Последний заказ",
  points: "Баллы",
  created: "Дата регистрации",
} as const;

export default async function Customers({ searchParams }: PageProps<"/crm/customers">) {
  await requireSection("customers");
  const sp = await searchParams;
  const q = str(sp.q);
  const tier = str(sp.tier);
  const segment = str(sp.segment);
  const tag = str(sp.tag);
  const sort = (str(sp.sort) ?? "spent") as keyof typeof SORTS;
  const page = Math.max(1, Number(str(sp.page) ?? 1));
  const [users, tiers, stats] = await Promise.all([
    db.user.findMany({
      where: {
        role: "CUSTOMER",
        ...(tier ? { loyaltyTier: { code: tier } } : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(q
          ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
          : {}),
      },
      include: { loyaltyTier: true },
    }),
    db.loyaltyTier.findMany({ orderBy: { threshold: "asc" } }),
    customerStats(),
  ]);
  const rows = users
    .map((u) => {
      const s = stats.get(u.id);
      const seg = rfmSegment({ lastOrderAt: s?.lastOrderAt ?? null, ordersCount: s?.ordersCount ?? 0, lifetimeSpent: u.lifetimeSpent, createdAt: u.createdAt });
      return { u, last: s?.lastOrderAt ?? null, orders: s?.ordersCount ?? 0, seg };
    })
    .filter((r) => !segment || r.seg.code === segment)
    .sort((a, b) => {
      if (sort === "recent") return (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0);
      if (sort === "points") return b.u.pointsBalance - a.u.pointsBalance;
      if (sort === "created") return b.u.createdAt.getTime() - a.u.createdAt.getTime();
      return b.u.lifetimeSpent - a.u.lifetimeSpent;
    });
  const pageRows = rows.slice((page - 1) * PER, page * PER);
  const allTags = [...new Set(users.flatMap((u) => u.tags))].sort();
  const base = { q, tier, segment, tag, sort: sort === "spent" ? undefined : sort };
  return (
    <div>
      <PageTitle
        title="Клиенты"
        actions={<a href={qs("/crm/customers/export", { q, tier, segment, tag })} className="btn-outline btn-sm">Экспорт CSV</a>}
      >
        {rows.length} клиентов · LTV {formatMoney(rows.reduce((s, r) => s + r.u.lifetimeSpent, 0))}
      </PageTitle>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Имя, email, телефон" className="input w-64 py-2" />
        <select name="tier" defaultValue={tier ?? ""} className="input w-40 py-2">
          <option value="">Все уровни</option>
          {tiers.map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
        </select>
        <select name="segment" defaultValue={segment ?? ""} className="input w-48 py-2">
          <option value="">Все сегменты</option>
          {Object.values(SEGMENTS).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select name="tag" defaultValue={tag ?? ""} className="input w-44 py-2">
          <option value="">Все теги</option>
          {allTags.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select name="sort" defaultValue={sort} className="input w-48 py-2">
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-primary btn-sm">Найти</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Клиент</th><th>Уровень</th><th>Сегмент</th><th className="text-right">Заказов</th><th className="text-right">LTV</th><th className="text-right">За 12 мес.</th><th className="text-right">Баллы</th><th>Последний заказ</th><th>Источник</th></tr></thead>
          <tbody>
            {pageRows.map(({ u, last, orders, seg }) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/crm/customers/${u.id}`} className="underline underline-offset-4">{u.firstName} {u.lastName}</Link>
                  <div className="text-xs text-muted">{u.phone ?? u.email}</div>
                  {u.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{u.tags.map((t) => <span key={t} className="text-[0.6rem] text-taupe-dark">#{t}</span>)}</div>}
                </td>
                <td>{u.loyaltyTier?.name}</td>
                <td><Badge tone={seg.tone}>{seg.label}</Badge></td>
                <td className="text-right">{orders}</td>
                <td className="whitespace-nowrap text-right">{formatMoney(u.lifetimeSpent)}</td>
                <td className="whitespace-nowrap text-right text-muted">{formatMoney(u.yearSpent)}</td>
                <td className="text-right">{u.pointsBalance.toLocaleString("ru-RU")}</td>
                <td className="whitespace-nowrap text-muted">{last ? `${formatDate(last)} · ${daysSince(last)} дн.` : "—"}</td>
                <td className="text-muted">{u.source ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pageRows.length === 0 && <p className="p-6 text-center text-sm text-muted">Никого не найдено</p>}
      </div>
      <Pager page={page} pages={Math.ceil(rows.length / PER)} href={(p) => qs("/crm/customers", { ...base, page: p })} />
    </div>
  );
}
