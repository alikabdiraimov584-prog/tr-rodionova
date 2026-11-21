import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pendingPoints, tierProgress } from "@/lib/loyalty";
import { getSetting } from "@/lib/settings";
import { formatDate, formatMoney } from "@/lib/money";
import { POINTS_TYPE } from "@/lib/labels";
import { PageTitle, Eyebrow } from "@/components/ui";
import { TierCard } from "@/components/account/tier-card";
import { CopyLink } from "@/components/account/copy-link";

export const metadata: Metadata = { title: "Circle и баллы" };

export default async function LoyaltyPage() {
  const user = await requireUser("/account/loyalty");
  const [tiers, tx, pending, s, invited] = await Promise.all([
    db.loyaltyTier.findMany({ orderBy: { threshold: "asc" } }),
    db.pointsTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { number: true } } } }),
    pendingPoints(user.id),
    getSetting("loyalty"),
    db.user.count({ where: { referredById: user.id } }),
  ]);
  const tp = tierProgress(user.yearSpent, tiers, user.loyaltyTier?.code);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const refLink = `${origin}/register?ref=${user.referralCode}`;
  return (
    <div className="space-y-10">
      <PageTitle title="T.Rodionova Circle" />
      <div className="grid gap-6 lg:grid-cols-2">
        <TierCard name={user.loyaltyTier?.name ?? "Atelier"} code={user.loyaltyTier?.code ?? "ATELIER"} points={user.pointsBalance} pending={pending} yearSpent={user.yearSpent} next={tp.next} progress={tp.progress} remaining={tp.remaining} firstName={`${user.firstName} ${user.lastName ?? ""}`} />
        <div className="card p-6">
          <Eyebrow>Пригласите подругу</Eyebrow>
          <p className="mt-3 text-sm text-muted">
            Подруга получит {s.welcomePoints.toLocaleString("ru-RU")} баллов при регистрации, вы — {s.referralPoints.toLocaleString("ru-RU")} баллов после её первой покупки.
          </p>
          <CopyLink value={refLink} label="Реферальная ссылка" />
          <p className="mt-3 text-xs text-muted">Приглашено: {invited}</p>
        </div>
      </div>

      <div className="grid gap-px border border-line bg-line md:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.id} className={`p-5 ${t.id === user.loyaltyTierId ? "bg-white" : "bg-ivory"}`}>
            <div className="flex items-baseline justify-between">
              <span className="serif text-xl">{t.name}</span>
              <span className="text-sm text-taupe-dark">{t.cashbackPct}%</span>
            </div>
            <div className="eyebrow mt-1">{t.threshold ? `от ${formatMoney(t.threshold)}` : "с первой покупки"}</div>
            {t.id === user.loyaltyTierId && <div className="mt-2 text-xs text-success">Ваш уровень</div>}
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-4">История баллов</h2>
        {/* на телефоне таблица шире экрана: область прокручивается и с клавиатуры */}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="История баллов">
          <table className="table">
            <thead><tr><th>Дата</th><th>Операция</th><th>Комментарий</th><th>Действуют до</th><th className="text-right">Баллы</th></tr></thead>
            <tbody>
              {tx.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap text-muted">{formatDate(t.createdAt)}</td>
                  <td>{POINTS_TYPE[t.type]}</td>
                  <td className="text-muted">{t.comment?.replace(/\s*\((#?c[a-z0-9]{20,})\)/, "")}</td>
                  <td className="whitespace-nowrap text-muted">{t.amount > 0 && t.expiresAt ? formatDate(t.expiresAt) : "—"}</td>
                  <td className={`whitespace-nowrap text-right ${t.amount > 0 ? "text-success" : "text-danger"}`}>{t.amount > 0 ? "+" : "−"}{Math.abs(t.amount).toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
