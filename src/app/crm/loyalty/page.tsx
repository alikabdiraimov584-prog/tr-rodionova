import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { formatMoney, formatDate } from "@/lib/money";
import { POINTS_TYPE } from "@/lib/labels";
import { Eyebrow, PageTitle, Stat } from "@/components/ui";
import { HBar } from "@/components/crm/charts";
import { LoyaltySettingsForm, RunJobsButton, TierForm } from "@/components/crm/marketing-forms";
import type { PointsType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Лояльность" };

export default async function Loyalty() {
  const me = await requireSection("loyalty");
  const editable = can(me.role, "loyaltyEdit");
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  const [tiers, s, liability, byType, members, expiring, lastJob, referrals] = await Promise.all([
    db.loyaltyTier.findMany({ orderBy: { threshold: "asc" }, include: { _count: { select: { users: { where: { role: "CUSTOMER" } } } } } }),
    getSetting("loyalty"),
    db.user.aggregate({ where: { role: "CUSTOMER" }, _sum: { pointsBalance: true }, _count: true }),
    db.pointsTransaction.groupBy({ by: ["type"], where: { createdAt: { gte: d30 } }, _sum: { amount: true } }),
    db.user.count({ where: { role: "CUSTOMER", orders: { some: { status: { in: ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] } } } } }),
    db.pointsTransaction.aggregate({ where: { amount: { gt: 0 }, expiresAt: { gte: now, lt: in30 } }, _sum: { amount: true } }),
    db.auditLog.findFirst({ where: { action: "jobs.daily" }, orderBy: { createdAt: "desc" } }),
    db.user.count({ where: { referredById: { not: null } } }),
  ]);
  const sum = (t: PointsType) => byType.find((b) => b.type === t)?._sum.amount ?? 0;
  const issued = byType.filter((b) => (b._sum.amount ?? 0) > 0).reduce((a, b) => a + (b._sum.amount ?? 0), 0);
  return (
    <div className="space-y-6">
      <PageTitle title="T.Rodionova Circle">1 балл = {s.pointValueKopecks / 100} ₽ · баллы начисляются при завершении заказа (через 14 дней после доставки)</PageTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Участниц" value={liability._count} hint={`с покупками: ${members}`} />
        <Stat label="Обязательства по баллам" value={formatMoney((liability._sum.pointsBalance ?? 0) * s.pointValueKopecks)} hint="баланс всех клиентов" />
        <Stat label="Начислено, 30 дней" value={issued.toLocaleString("ru-RU")} />
        <Stat label="Списано покупками, 30 дней" value={(-sum("SPEND_PURCHASE")).toLocaleString("ru-RU")} hint={`сгорело ${(-sum("EXPIRE")).toLocaleString("ru-RU")}`} />
        <Stat label="Сгорят за 30 дней" value={(expiring._sum.amount ?? 0).toLocaleString("ru-RU")} hint={`по рефералам пришло ${referrals}`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="card p-5">
          <Eyebrow>Начисления и списания за 30 дней</Eyebrow>
          <div className="mt-4">
            <HBar items={byType.map((b) => ({ label: POINTS_TYPE[b.type], value: Math.abs(b._sum.amount ?? 0), display: (b._sum.amount ?? 0).toLocaleString("ru-RU"), tone: (b._sum.amount ?? 0) > 0 ? "var(--success)" : "var(--danger)" }))} />
          </div>
        </div>
        <div className="card space-y-3 p-5">
          <Eyebrow>Ежедневные задачи</Eyebrow>
          <p className="text-xs text-muted">Завершение доставленных заказов и начисление баллов, подарки ко дню рождения, сгорание баллов, пересчёт уровней. В продакшене запускаются по расписанию через /api/cron.</p>
          <p className="text-xs">Последний запуск: {lastJob ? formatDate(lastJob.createdAt, true) : "ещё не запускались"}</p>
          <RunJobsButton />
        </div>
      </div>
      <div className="card p-5">
        <Eyebrow>Правила начисления</Eyebrow>
        <div className="mt-3"><LoyaltySettingsForm s={s} editable={editable} /></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.id} className="card p-5">
            <div className="mb-3 flex items-baseline justify-between"><span className="serif text-2xl">{t.name}</span><span className="text-xs text-muted">{t._count.users} клиентов</span></div>
            <TierForm t={t} editable={editable} />
          </div>
        ))}
      </div>
      {!editable && <p className="text-xs text-muted">Изменять уровни и правила может администратор.</p>}
    </div>
  );
}
