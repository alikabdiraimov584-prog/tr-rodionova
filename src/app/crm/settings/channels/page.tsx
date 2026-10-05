import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { CHANNEL_FIELDS } from "@/lib/support/channels";
import { CHANNEL } from "@/lib/labels";
import { formatDate } from "@/lib/money";
import { Badge, PageTitle } from "@/components/ui";
import { ChannelForm, TelegramWebhookForm } from "@/components/crm/admin-forms";
import { ConfirmButton } from "@/components/form";
import { rotateWebhookSecretAction } from "@/app/actions/crm-admin";
import type { Channel } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Каналы поддержки" };

const GUIDES: Record<Exclude<Channel, "WEBSITE">, string[]> = {
  TELEGRAM: ["Создайте бота у @BotFather и вставьте токен.", "Включите канал и нажмите «Установить вебхук» — адрес и секрет подставятся автоматически."],
  WHATSAPP: [
    "Вариант 1 — WhatsApp Cloud API (Meta): укажите provider = meta, токен, phone number ID и verify token; в Meta for Developers задайте URL вебхука ниже и подпишитесь на messages.",
    "Вариант 2 — Wazzup24 (если прямой доступ к Meta API недоступен): provider = wazzup, API-ключ и channelId; в кабинете Wazzup укажите URL вебхука ниже.",
    "Ограничение WhatsApp: свободный ответ возможен в течение 24 часов после сообщения клиента.",
  ],
  INSTAGRAM: ["Meta: provider = meta, токен страницы/IG и verify token; подпишите приложение на messages.", "Или через Wazzup24: provider = wazzup, тот же API-ключ и channelId канала Instagram."],
  VK: ["Управление сообществом → Работа с API → Callback API: вставьте URL ниже, версию 5.199, событие «Входящее сообщение».", "Скопируйте строку подтверждения и секретный ключ в поля, ключ доступа — с правом «сообщения»."],
  EMAIL: ["Входящие: в Postmark (или другом сервисе) настройте Inbound webhook на URL ниже.", "Исходящие: укажите адрес отправителя и server token Postmark."],
  SMS: ["Только исходящие рассылки и уведомления через smsc.ru. Имя отправителя регистрируется у оператора."],
};

export default async function Channels() {
  await requireSection("integrations");
  const rows = await db.channelIntegration.findMany();
  const byChannel = new Map(rows.map((r) => [r.channel, r]));
  const h = await headers();
  const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const counts = await db.conversation.groupBy({ by: ["channel"], where: { createdAt: { gte: monthAgo } }, _count: true });
  const countBy = new Map(counts.map((c) => [c.channel, c._count]));
  return (
    <div className="space-y-6">
      <PageTitle title="Каналы поддержки" actions={<Link href="/crm/support" className="btn-ghost btn-sm">← В поддержку</Link>}>
        Сообщения из всех подключённых каналов попадают в единый раздел «Поддержка». Чат на сайте работает всегда и настройки не требует. Токены видит только администратор.
      </PageTitle>
      <div className="grid gap-6 xl:grid-cols-2">
        {(Object.keys(CHANNEL_FIELDS) as Exclude<Channel, "WEBSITE">[]).map((ch) => {
          const i = byChannel.get(ch);
          const slug = ch.toLowerCase();
          const url = i ? `${base}/api/webhooks/${slug}/${i.webhookSecret}` : null;
          return (
            <div key={ch} className="card space-y-4 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs text-white" style={{ background: CHANNEL[ch].color }}>{CHANNEL[ch].short}</span>
                  <span className="serif text-xl">{CHANNEL[ch].label}</span>
                </div>
                <Badge tone={i?.enabled ? (i.lastError ? "warning" : "success") : "neutral"}>{i?.enabled ? (i.lastError ? "Есть ошибки" : "Подключён") : "Выключен"}</Badge>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted">{GUIDES[ch].map((g) => <li key={g}>{g}</li>)}</ul>
              <ChannelForm channel={ch} fields={CHANNEL_FIELDS[ch]} values={(i?.config as Record<string, string>) ?? {}} enabled={!!i?.enabled} />
              {url ? (
                <div className="space-y-2 border-t border-line pt-3 text-xs">
                  <div className="label">URL вебхука</div>
                  <code className="block break-all bg-ivory p-2">{url}</code>
                  <div className="flex flex-wrap items-center gap-4 text-muted">
                    <span>Последнее событие: {i?.lastEventAt ? formatDate(i.lastEventAt, true) : "—"}</span>
                    <span>Диалогов за 30 дней: {countBy.get(ch) ?? 0}</span>
                    <form action={rotateWebhookSecretAction}><input type="hidden" name="channel" value={ch} /><ConfirmButton message="Старый URL перестанет работать. Продолжить?" className="underline">сменить секрет</ConfirmButton></form>
                  </div>
                  {i?.lastError && <div className="text-danger">Последняя ошибка: {i.lastError}</div>}
                  {ch === "TELEGRAM" && <TelegramWebhookForm baseUrl={process.env.APP_URL ?? ""} />}
                </div>
              ) : (
                <p className="text-xs text-muted">URL вебхука появится после первого сохранения.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
