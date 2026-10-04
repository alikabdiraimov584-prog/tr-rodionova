import Link from "next/link";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { kpis, revenueByMonth, topProducts, repeatRate, customerStats } from "@/lib/analytics";
import { rfmSegment, SEGMENTS } from "@/lib/rfm";
import { formatDate, formatMoney, pct } from "@/lib/money";
import { ORDER_STATUS } from "@/lib/labels";
import { Badge, Eyebrow, PageTitle, Stat } from "@/components/ui";
import { BarChart, HBar } from "@/components/crm/charts";

export default async function Dashboard() {
  const user = await requireSection("dashboard");
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d60 = new Date(now.getTime() - 60 * 86_400_000);
  const [cur, prev, months, top, repeat, toProcess, tasks, lowStock, stats, customers, tiers, birthdays] = await Promise.all([
    kpis(d30),
    kpis(d60, d30),
    revenueByMonth(12),
    topProducts(new Date(now.getTime() - 90 * 86_400_000)),
    repeatRate(),
    db.order.findMany({ where: { status: { in: ["NEW", "PAID", "CONFIRMED", "PACKING"] } }, orderBy: { createdAt: "asc" }, take: 8 }),
    db.crmTask.findMany({ where: { status: "OPEN", OR: [{ assigneeId: user.id }, { assigneeId: null }] }, include: { customer: true }, orderBy: { dueAt: "asc" }, take: 6 }),
    db.productVariant.findMany({ where: { product: { status: "ACTIVE" } }, include: { product: true, _count: { select: { alerts: { where: { notifiedAt: null } } } } }, orderBy: { stock: "asc" }, take: 40 }),
    customerStats(),
    db.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true, lifetimeSpent: true, createdAt: true, loyaltyTierId: true } }),
    db.loyaltyTier.findMany({ orderBy: { threshold: "asc" } }),
    db.$queryRaw<{ id: string; firstName: string; lastName: string | null; birthday: Date }[]>`
      SELECT id, "firstName", "lastName", birthday FROM "User"
      WHERE role = 'CUSTOMER' AND birthday IS NOT NULL
        AND (make_date(EXTRACT(YEAR FROM now())::int, EXTRACT(MONTH FROM birthday)::int, LEAST(EXTRACT(DAY FROM birthday)::int, 28)) - current_date) BETWEEN 0 AND 14
      ORDER BY EXTRACT(MONTH FROM birthday), EXTRACT(DAY FROM birthday) LIMIT 6`,
  ]);
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${pct(a - b, b)}% к пред. 30 дням` : "");
  const segCounts = new Map<string, number>();
  for (const c of customers) {
    const s = stats.get(c.id);
    const seg = rfmSegment({ lastOrderAt: s?.lastOrderAt ?? null, ordersCount: s?.ordersCount ?? 0, lifetimeSpent: c.lifetimeSpent, createdAt: c.createdAt });
    segCounts.set(seg.code, (segCounts.get(seg.code) ?? 0) + 1);
  }
  const low = lowStock.filter((v) => v.stock - v.reserved <= 1).slice(0, 8);
  const liability = await db.user.aggregate({ where: { role: "CUSTOMER" }, _sum: { pointsBalance: true } });
  return (
    <div className="space-y-8">
      <PageTitle eyebrow={formatDate(now)} title={`Добрый день, ${user.firstName}`} actions={<Link href="/crm/orders/new" className="btn-primary btn-sm">Продажа в шоуруме</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Выручка, 30 дней" value={formatMoney(cur.revenue)} hint={delta(cur.revenue, prev.revenue)} />
        <Stat label="Заказы" value={cur.count} hint={delta(cur.count, prev.count)} />
        <Stat label="Средний чек" value={formatMoney(cur.aov)} hint={delta(cur.aov, prev.aov)} />
        <Stat label="Повторные покупки" value={`${repeat.rate}%`} hint={`${repeat.repeaters} из ${repeat.buyers} покупательниц`} />
        <Stat label="Новые клиенты" value={cur.newCustomers} hint={`Баллов на счетах: ${(liability._sum.pointsBalance ?? 0).toLocaleString("ru-RU")}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="card min-w-0 p-5">
          <div className="flex items-baseline justify-between"><Eyebrow>Выручка по месяцам</Eyebrow><span className="text-xs text-muted">12 мес.</span></div>
          <div className="mt-4"><BarChart data={months.map((m) => ({ label: m.label, value: m.revenue }))} /></div>
        </div>
        <div className="card p-5">
          <Eyebrow>Топ товаров, 90 дней</Eyebrow>
          <div className="mt-4"><HBar items={top.map((t) => ({ label: `${t.name} · ${t.qty} шт.`, value: t.revenue, display: formatMoney(t.revenue) }))} /></div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card p-5">
          <div className="flex justify-between"><Eyebrow>В работу</Eyebrow><Link href="/crm/orders" className="text-xs underline">Все</Link></div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {toProcess.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <Link href={`/crm/orders/${o.id}`}>№{o.number} · {o.firstName}</Link>
                <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
              </li>
            ))}
            {toProcess.length === 0 && <li className="py-2 text-muted">Все заказы обработаны</li>}
          </ul>
        </div>
        <div className="card p-5">
          <div className="flex justify-between"><Eyebrow>Мои задачи</Eyebrow><Link href="/crm/tasks" className="text-xs underline">Все</Link></div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {tasks.map((t) => (
              <li key={t.id} className="py-2">
                <div>{t.title}</div>
                <div className={`text-xs ${t.dueAt && t.dueAt < now ? "text-danger" : "text-muted"}`}>
                  {t.customer && <Link href={`/crm/customers/${t.customer.id}`} className="underline">{t.customer.firstName} {t.customer.lastName}</Link>} {t.dueAt && `· до ${formatDate(t.dueAt)}`}
                </div>
              </li>
            ))}
            {tasks.length === 0 && <li className="py-2 text-muted">Открытых задач нет</li>}
          </ul>
        </div>
        <div className="card p-5">
          <div className="flex justify-between"><Eyebrow>Заканчивается на складе</Eyebrow><Link href="/crm/stock?low=1" className="text-xs underline">Склад</Link></div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {low.map((v) => (
              <li key={v.id} className="flex justify-between py-2">
                <span>{v.product.name} · {v.size} <span className="text-muted">{v.color}</span></span>
                <span className={v.stock - v.reserved <= 0 ? "text-danger" : "text-warning"}>
                  {v.stock - v.reserved}{v._count.alerts ? ` · ждут ${v._count.alerts}` : ""}
                </span>
              </li>
            ))}
            {low.length === 0 && <li className="py-2 text-muted">Остатки в норме</li>}
          </ul>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <div className="flex justify-between"><Eyebrow>Сегменты клиентов (RFM)</Eyebrow><Link href="/crm/customers" className="text-xs underline">Клиенты</Link></div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Object.values(SEGMENTS).map((s) => (
              <Link key={s.code} href={`/crm/customers?segment=${s.code}`} className="border border-line p-3 hover:bg-ivory">
                <Badge tone={s.tone}>{s.label}</Badge>
                <div className="serif mt-2 text-2xl">{segCounts.get(s.code) ?? 0}</div>
                <div className="mt-1 text-[0.7rem] leading-snug text-muted">{s.advice}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="card p-5">
            <Eyebrow>Уровни Circle</Eyebrow>
            <div className="mt-4">
              <HBar items={tiers.map((t) => ({ label: t.name, value: customers.filter((c) => c.loyaltyTierId === t.id).length, tone: t.code === "PRIVE" ? "var(--black)" : t.code === "MAISON" ? "var(--champagne-dark)" : "var(--taupe)" }))} />
            </div>
          </div>
          <div className="card p-5">
            <Eyebrow>Дни рождения, 14 дней</Eyebrow>
            <ul className="mt-3 space-y-1 text-sm">
              {birthdays.map((b) => (
                <li key={b.id} className="flex justify-between"><Link href={`/crm/customers/${b.id}`}>{b.firstName} {b.lastName}</Link><span className="text-muted">{b.birthday.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span></li>
              ))}
              {birthdays.length === 0 && <li className="text-muted">Нет ближайших</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
