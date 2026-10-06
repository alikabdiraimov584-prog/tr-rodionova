import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getCurrentCustomer } from "@/lib/auth";
import { circleCta } from "@/lib/role-links";
import { formatMoney } from "@/lib/money";
import { Eyebrow, Monogram, Star } from "@/components/ui";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = { title: "T.Rodionova Circle — программа лояльности" };

export default async function CirclePage({ searchParams }: PageProps<"/circle">) {
  const sp = await searchParams;
  const [tiers, s, user] = await Promise.all([db.loyaltyTier.findMany({ orderBy: { order: "asc" } }), getSetting("loyalty"), getCurrentCustomer()]);
  const cta = circleCta(user, s.welcomePoints);
  const early = typeof sp.early === "string";
  return (
    <div>
      <JsonLd data={breadcrumbJsonLd([{ name: "Главная", path: "/" }, { name: "T.Rodionova Circle", path: "/circle" }])} />
      <section className="border-b border-line bg-white py-14 text-center">
        {early && <p className="mx-auto mb-6 max-w-lg border border-champagne bg-champagne/20 px-4 py-3 text-sm">Эта вещь пока доступна только участницам уровней Maison и Privé в рамках раннего доступа. Вступите в Circle: уровень растёт с покупками.</p>}
        <Monogram className="text-6xl" />
        <Eyebrow className="mt-6">Программа лояльности</Eyebrow>
        <h1 className="mt-3">T.Rodionova Circle</h1>
        <p className="mx-auto mt-5 max-w-xl px-4 text-sm text-muted">
          Баллы с каждой покупки, подарки ко дню рождения и привилегии, которые растут вместе с вами. 1 балл = 1 ₽.
        </p>
        <Link href={cta.href} className="btn-primary mt-8">{cta.label}</Link>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 md:px-8">
        <div className="grid gap-px border border-line bg-line md:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.id} id={t.code.toLowerCase()} className={`scroll-mt-32 p-8 ${t.code === "PRIVE" ? "bg-ink text-ivory" : "bg-ivory"}`}>
              <div className={`eyebrow ${t.code === "PRIVE" ? "text-champagne" : ""}`}>
                {t.threshold ? `от ${formatMoney(t.threshold)} за 12 месяцев` : "с первой покупки"}
              </div>
              <h2 className="mt-4">{t.name}</h2>
              <div className={`mt-6 text-5xl ${t.code === "PRIVE" ? "text-champagne" : "text-taupe-dark"}`}>{t.cashbackPct}%</div>
              <div className="text-xs opacity-70">возвращается баллами</div>
              <ul className="mt-8 space-y-3 text-sm">
                {t.perks.map((p) => (
                  <li key={p} className="flex gap-2"><Star className={t.code === "PRIVE" ? "text-champagne" : ""} />{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 md:px-8">
        <h2 className="text-center">Как это работает</h2>
        <div className="mt-10 grid gap-8 text-sm md:grid-cols-2">
          {[
            ["Начисление", "Баллы начисляются через 14 дней после получения заказа — когда закончится срок возврата. Считаются от суммы, оплаченной деньгами, без доставки."],
            ["Списание", "Баллами можно оплатить до 30% заказа. Ползунок на странице оформления покажет доступную сумму."],
            ["Срок действия", `Баллы действуют ${s.pointsExpireDays} дней с момента начисления, подарочные баллы ко дню рождения — 30 дней.`],
            ["Уровень", "Уровень зависит от суммы покупок за последние 12 месяцев и пересчитывается автоматически после каждой оплаты."],
            ["Приглашайте подруг", `Подруга получит ${s.welcomePoints.toLocaleString("ru-RU")} баллов при регистрации по вашей ссылке, вы — ${s.referralPoints.toLocaleString("ru-RU")} баллов после её первой покупки.`],
            ["Отзывы", `${s.reviewPoints} баллов за отзыв о купленной вещи после модерации.`],
          ].map(([t, d]) => (
            <div key={t} className="border-t border-line pt-5">
              <h3>{t}</h3>
              <p className="mt-2 text-muted">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-12 text-center text-xs text-muted">
          Полные правила — в приложении к <Link href="/offer" className="underline">публичной оферте</Link>.
        </p>
      </section>
    </div>
  );
}
