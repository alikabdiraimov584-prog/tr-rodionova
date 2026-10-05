import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { GROUPS, INTEGRATIONS, type IntegrationGroup } from "@/lib/integrations/registry";
import { listIntegrationStates } from "@/lib/integrations/store";
import { CHANNEL } from "@/lib/labels";
import { formatDate } from "@/lib/money";
import { Badge, PageTitle } from "@/components/ui";
import { IntegrationForm } from "@/components/crm/integration-forms";

export const metadata: Metadata = { title: "Интеграции" };

const ORDER: IntegrationGroup[] = ["payments", "delivery", "messaging", "analytics", "search", "service"];

export default async function IntegrationsPage() {
  await requireSection("integrations");
  const [states, channels, h] = await Promise.all([listIntegrationStates(), db.channelIntegration.findMany(), headers()]);
  const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const envYookassa = !!(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
  return (
    <div className="space-y-8">
      <PageTitle title="Интеграции">
        Все внешние подключения в одном месте: оплата, доставка, мессенджеры, аналитика и поисковики. Секретные ключи хранятся в базе в зашифрованном виде и не показываются после сохранения.
      </PageTitle>

      {ORDER.map((g) => (
        <section key={g} className="space-y-4">
          <div>
            <h2>{GROUPS[g].title}</h2>
            <p className="text-sm text-muted">{GROUPS[g].hint}</p>
          </div>

          {g === "messaging" && (
            <div className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {channels.length === 0 && <span className="text-sm text-muted">Каналы ещё не настроены</span>}
                  {channels.map((c) => (
                    <Badge key={c.channel} tone={c.enabled ? "success" : "neutral"}>{CHANNEL[c.channel].label}: {c.enabled ? "включён" : "выключен"}</Badge>
                  ))}
                </div>
                <Link href="/crm/settings/channels" className="btn-outline btn-sm">Настроить каналы →</Link>
              </div>
              <p className="mt-3 text-xs text-muted">Telegram, WhatsApp, Instagram, ВКонтакте, email (Postmark) и SMS (smsc.ru): токены, вебхуки и проверка подписи. Email и SMS также используются для уведомлений о заказах и восстановления пароля.</p>
            </div>
          )}

          {INTEGRATIONS.filter((i) => i.group === g).map((i) => {
            const st = states.get(i.key);
            const configured = !!st && Object.keys(st.filled).length > 0;
            const tone = st?.enabled ? (st.lastCheckOk === false ? "danger" : "success") : configured ? "warning" : "neutral";
            const label = st?.enabled ? (st.lastCheckOk === false ? "ошибка" : "включена") : configured ? "настроена, выключена" : "не подключена";
            return (
              <details key={i.key} className="card p-5" open={!st?.enabled}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{i.name}</div>
                    <div className="text-xs text-muted">{i.summary}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {i.key === "yookassa" && envYookassa && !st?.enabled && <Badge tone="info">ключи из переменных окружения</Badge>}
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                </summary>
                <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_300px]">
                  <div className="min-w-0 space-y-3">
                    <IntegrationForm integrationKey={i.key} fields={i.fields} filled={st?.filled ?? {}} enabled={st?.enabled ?? false} hasTest={!!i.test} />
                    {st?.lastCheckAt && (
                      <p className={`text-xs ${st.lastCheckOk ? "text-success" : "text-danger"}`}>
                        Последняя проверка {formatDate(st.lastCheckAt, true)}: {st.lastCheckOk ? "успешно" : st.lastError ?? "ошибка"}
                      </p>
                    )}
                    {i.webhookPath && (
                      <div className="rounded-lg bg-sand p-3 text-xs">
                        <div className="label">Адрес для уведомлений у провайдера</div>
                        <code className="select-all break-all">{base}{i.webhookPath}</code>
                      </div>
                    )}
                  </div>
                  <aside className="text-xs text-muted">
                    <div className="label">Как подключить</div>
                    <ol className="list-decimal space-y-1.5 pl-4">{i.guide.map((s, n) => <li key={n}>{s}</li>)}</ol>
                    <div className="label mt-4">Что изменится</div>
                    <p>{i.effect}</p>
                  </aside>
                </div>
              </details>
            );
          })}
        </section>
      ))}
    </div>
  );
}
