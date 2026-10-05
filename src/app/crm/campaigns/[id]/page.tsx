import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/money";
import { CHANNEL } from "@/lib/labels";
import { Badge, Eyebrow, PageTitle, Stat } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/form";
import { cancelCampaignAction, duplicateCampaignAction, sendCampaignNowAction } from "@/app/actions/crm-campaigns";
import type { Segment } from "@/lib/campaigns";
import { SEGMENTS } from "@/lib/rfm";

function describe(s: Segment, tierNames: Map<string, string>) {
  const out: string[] = [];
  if (s.tiers?.length) out.push(`уровень: ${s.tiers.map((t) => tierNames.get(t) ?? t).join(", ")}`);
  if (s.rfm?.length) out.push(`RFM: ${s.rfm.map((r) => SEGMENTS[r]?.label ?? r).join(", ")}`);
  if (s.tags?.length) out.push(`теги: ${s.tags.join(", ")}`);
  if (s.sources?.length) out.push(`источник: ${s.sources.join(", ")}`);
  if (s.sizes?.length) out.push(`размер: ${s.sizes.join(", ")}`);
  if (s.minLifetime) out.push(`покупок от ${s.minLifetime.toLocaleString("ru-RU")} ₽`);
  if (s.maxLifetime) out.push(`покупок до ${s.maxLifetime.toLocaleString("ru-RU")} ₽`);
  if (s.lastOrderMinDays) out.push(`последний заказ ≥ ${s.lastOrderMinDays} дн.`);
  if (s.lastOrderMaxDays) out.push(`последний заказ ≤ ${s.lastOrderMaxDays} дн.`);
  if (s.registeredDays) out.push(`регистрация за ${s.registeredDays} дн.`);
  if (s.birthdayMonth) out.push(`ДР в ${s.birthdayMonth}-м месяце`);
  if (s.hasPoints) out.push(`баллов от ${s.hasPoints}`);
  if (s.pointsExpiringDays) out.push(`баллы сгорают в ${s.pointsExpiringDays} дн.`);
  if (s.waitlist) out.push("ждут поступления");
  if (s.wishlist) out.push("есть избранное");
  if (s.cartAbandoned) out.push("брошенная корзина");
  if (s.productBought) out.push("покупали товар");
  if (s.categoryBought) out.push("покупали категорию");
  if (s.viewedProductId) out.push("смотрели товар");
  if (s.marketing === false) out.push("сервисное, без фильтра по согласию");
  return out.length ? out.join(" · ") : "все клиентки с согласием на рассылки";
}

export default async function CampaignPage({ params }: PageProps<"/crm/campaigns/[id]">) {
  await requireSection("campaigns");
  const { id } = await params;
  const c = await db.campaign.findUnique({ where: { id }, include: { recipients: { include: { user: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { status: "asc" }, take: 300 } } });
  if (!c) notFound();
  const [tiers, link] = await Promise.all([
    db.loyaltyTier.findMany({ select: { code: true, name: true } }),
    c.trackingLinkId ? db.trackingLink.findUnique({ where: { id: c.trackingLinkId }, include: { sessions: { select: { id: true, orders: { where: { status: { notIn: ["NEW", "CANCELLED"] } }, select: { total: true } } } } } }) : null,
  ]);
  const visits = link?.sessions.length ?? 0;
  const orders = link?.sessions.reduce((a, s) => a + s.orders.length, 0) ?? 0;
  const revenue = link?.sessions.reduce((a, s) => a + s.orders.reduce((x, o) => x + o.total, 0), 0) ?? 0;
  const editable = c.status === "DRAFT" || c.status === "SCHEDULED";
  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow={`${CHANNEL[c.channel].label} · создана ${formatDate(c.createdAt, true)}`}
        title={c.name}
        actions={
          <>
            {editable && <Link href={`/crm/campaigns/${c.id}/edit`} className="btn-outline btn-sm">Редактировать</Link>}
            {editable && <form action={sendCampaignNowAction}><input type="hidden" name="id" value={c.id} /><ConfirmButton message={`Отправить сейчас ${c.audienceCount} получателям?`} className="btn-primary btn-sm">Отправить сейчас</ConfirmButton></form>}
            {editable && <form action={cancelCampaignAction}><input type="hidden" name="id" value={c.id} /><ConfirmButton message="Отменить рассылку?" className="btn-ghost btn-sm">Отменить</ConfirmButton></form>}
            <form action={duplicateCampaignAction}><input type="hidden" name="id" value={c.id} /><SubmitButton className="btn-ghost btn-sm">Дублировать</SubmitButton></form>
          </>
        }
      >
        Аудитория: {describe(c.segment as Segment, new Map(tiers.map((t) => [t.code, t.name])))}
      </PageTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Статус" value={c.status === "SENT" ? "Отправлена" : c.status === "SCHEDULED" ? "План" : c.status === "SENDING" ? "Идёт" : c.status === "CANCELLED" ? "Отменена" : "Черновик"} hint={c.sentAt ? formatDate(c.sentAt, true) : c.scheduledAt ? formatDate(c.scheduledAt, true) : undefined} />
        <Stat label="Аудитория" value={c.audienceCount} />
        <Stat label="Доставлено" value={c.sentCount} hint={`ошибок ${c.failedCount} · пропущено ${c.skippedCount}`} tone={c.failedCount ? "danger" : undefined} />
        <Stat label="Клики по ссылке" value={link?.clicks ?? "—"} hint={visits ? `визитов ${visits}` : undefined} />
        <Stat label="Заказы" value={orders || "—"} hint={c.sentCount && orders ? `конверсия ${Math.round((orders / c.sentCount) * 1000) / 10}%` : undefined} />
        <Stat label="Выручка" value={revenue ? formatMoney(revenue) : "—"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr] [&>*]:min-w-0">
        <div className="card p-5">
          <Eyebrow>Сообщение</Eyebrow>
          {c.subject && <div className="mt-2 text-sm font-medium">{c.subject}</div>}
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{c.text}</pre>
          {link && <p className="mt-3 text-xs text-muted">Ссылка: /go/{link.slug} → {link.targetPath}</p>}
        </div>
        <div className="card overflow-x-auto" tabIndex={0}>
          <div className="p-5 pb-2"><Eyebrow>Получатели</Eyebrow></div>
          {c.recipients.length === 0 ? <p className="p-5 text-sm text-muted">Список сформируется при отправке.</p> : (
            <table className="table">
              <thead><tr><th>Клиентка</th><th>Адрес</th><th>Статус</th></tr></thead>
              <tbody>
                {c.recipients.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/crm/customers/${r.user.id}`} className="underline">{r.user.firstName} {r.user.lastName}</Link></td>
                    <td className="text-xs text-muted">{r.address || "—"}</td>
                    <td><Badge tone={r.status === "SENT" ? "success" : r.status === "FAILED" ? "danger" : r.status === "SKIPPED" ? "neutral" : "info"}>{r.status === "SENT" ? "доставлено" : r.status === "FAILED" ? "ошибка" : r.status === "SKIPPED" ? "пропущено" : "в очереди"}</Badge>{r.error && <div className="text-[0.65rem] text-danger">{r.error}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
