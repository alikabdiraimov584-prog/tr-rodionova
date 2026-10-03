import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/money";
import { CHANNEL } from "@/lib/labels";
import { Badge, Empty, PageTitle, Stat } from "@/components/ui";
import { ConfirmButton } from "@/components/form";
import { cancelCampaignAction } from "@/app/actions/crm-campaigns";
import type { CampaignStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Рассылки" };

const STATUS: Record<CampaignStatus, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  SCHEDULED: { label: "Запланирована", tone: "info" },
  SENDING: { label: "Отправляется", tone: "warning" },
  SENT: { label: "Отправлена", tone: "success" },
  CANCELLED: { label: "Отменена", tone: "danger" },
};

export default async function Campaigns() {
  await requireSection("campaigns");
  const [campaigns, consent, total, links] = await Promise.all([
    db.campaign.findMany({ orderBy: { createdAt: "desc" } }),
    db.user.count({ where: { role: "CUSTOMER", marketingConsent: true } }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.trackingLink.findMany({ where: { medium: "campaign" }, include: { sessions: { select: { orders: { where: { status: { notIn: ["NEW", "CANCELLED"] } }, select: { total: true } } } } } }),
  ]);
  const linkStats = new Map(links.map((l) => [l.id, { clicks: l.clicks, orders: l.sessions.reduce((a, s) => a + s.orders.length, 0), revenue: l.sessions.reduce((a, s) => a + s.orders.reduce((x, o) => x + o.total, 0), 0) }]));
  const sent = campaigns.filter((c) => c.status === "SENT");
  return (
    <div className="space-y-6">
      <PageTitle title="Рассылки" actions={<Link href="/crm/campaigns/new" className="btn-primary btn-sm">Новая рассылка</Link>}>
        Сегменты по уровню, RFM, покупкам, поведению на сайте и датам. Каналы: email, Telegram, WhatsApp, SMS и чат в кабинете.
      </PageTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="С согласием на рассылки" value={consent} hint={`из ${total} клиенток · ${total ? Math.round((consent / total) * 100) : 0}%`} />
        <Stat label="Отправлено рассылок" value={sent.length} hint={`сообщений: ${sent.reduce((a, c) => a + c.sentCount, 0)}`} />
        <Stat label="Заказов по ссылкам из рассылок" value={[...linkStats.values()].reduce((a, l) => a + l.orders, 0)} />
        <Stat label="Выручка из рассылок" value={formatMoney([...linkStats.values()].reduce((a, l) => a + l.revenue, 0))} hint="по трекинговым ссылкам" />
      </div>
      {campaigns.length === 0 ? (
        <Empty title="Рассылок ещё нет" action={<Link href="/crm/campaigns/new" className="btn-primary">Создать первую</Link>}>Начните с готового сегмента: «Сгорают баллы» или «Спящие».</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Рассылка</th><th>Канал</th><th>Статус</th><th className="text-right">Аудитория</th><th className="text-right">Доставлено</th><th className="text-right">Клики</th><th className="text-right">Заказы</th><th className="text-right">Выручка</th><th>Дата</th><th /></tr></thead>
            <tbody>
              {campaigns.map((c) => {
                const ls = c.trackingLinkId ? linkStats.get(c.trackingLinkId) : null;
                return (
                  <tr key={c.id}>
                    <td><Link href={`/crm/campaigns/${c.id}`} className="underline underline-offset-4">{c.name}</Link></td>
                    <td><span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[0.5rem] text-white" style={{ background: CHANNEL[c.channel].color }}>{CHANNEL[c.channel].short}</span></td>
                    <td><Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge></td>
                    <td className="text-right">{c.audienceCount}</td>
                    <td className="text-right">{c.status === "SENT" ? `${c.sentCount}${c.failedCount ? ` · ${c.failedCount} ошибок` : ""}` : "—"}</td>
                    <td className="text-right">{ls?.clicks ?? "—"}</td>
                    <td className="text-right">{ls?.orders || "—"}</td>
                    <td className="whitespace-nowrap text-right">{ls?.revenue ? formatMoney(ls.revenue) : "—"}</td>
                    <td className="whitespace-nowrap text-muted">{c.sentAt ? formatDate(c.sentAt, true) : c.scheduledAt ? `план ${formatDate(c.scheduledAt, true)}` : formatDate(c.createdAt)}</td>
                    <td>{(c.status === "DRAFT" || c.status === "SCHEDULED") && <form action={cancelCampaignAction}><input type="hidden" name="id" value={c.id} /><ConfirmButton message="Отменить рассылку?" className="text-xs text-muted hover:text-danger">отменить</ConfirmButton></form>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
