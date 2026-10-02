import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/money";
import { PageTitle } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { SupportChatForm } from "@/components/account/support-chat";

export const metadata: Metadata = { title: "Служба заботы" };

const PRESETS: Record<string, (order?: string) => string> = {
  return: (o) => `Хочу оформить возврат по заказу №${o ?? ""}. Позиции и причина: `,
  delete: () => "Прошу удалить мой аккаунт и персональные данные. Понимаю, что баллы Circle будут аннулированы.",
  stylist: () => "Хочу записаться на консультацию стилиста / примерку дома.",
};

export default async function AccountSupport({ searchParams }: PageProps<"/account/support">) {
  const user = await requireUser("/account/support");
  const sp = await searchParams;
  const topic = typeof sp.topic === "string" ? sp.topic : undefined;
  const order = typeof sp.order === "string" ? sp.order : undefined;
  const contact = await db.contact.findUnique({ where: { channel_externalId: { channel: "WEBSITE", externalId: user.id } } });
  const messages = contact
    ? await db.message.findMany({
        where: { conversation: { contactId: contact.id }, direction: { in: ["IN", "OUT", "SYSTEM"] } },
        include: { author: { select: { firstName: true } } },
        orderBy: { createdAt: "asc" },
        take: 200,
      })
    : [];
  return (
    <div className="max-w-3xl">
      <AutoRefresh seconds={10} />
      <PageTitle title="Служба заботы">Ответим в течение 15 минут в рабочее время, ежедневно 10:00–21:00 по Москве. Можно также написать в Telegram, WhatsApp или на care@t-rodionova.ru — вся переписка попадает к одному менеджеру.</PageTitle>
      <div className="card mb-4 max-h-[55vh] space-y-3 overflow-y-auto p-5">
        {messages.length === 0 && <p className="text-center text-sm text-muted">Здесь появится ваша переписка с командой T.Rodionova.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "IN" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] px-4 py-2.5 text-sm ${m.direction === "IN" ? "bg-ink text-ivory" : m.direction === "SYSTEM" ? "border border-dashed border-line text-muted" : "border border-line bg-ivory"}`}>
              <div className="whitespace-pre-wrap">{m.text}</div>
              <div className={`mt-1 text-[0.65rem] ${m.direction === "IN" ? "text-ivory/60" : "text-muted"}`}>
                {m.direction === "OUT" ? `${m.author?.firstName ?? "T.Rodionova"} · ` : ""}{formatDate(m.createdAt, true)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <SupportChatForm key={topic ?? "chat"} preset={topic && PRESETS[topic] ? PRESETS[topic](order) : undefined} />
      <div className="mt-8 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.16em]">
        <a href="/account/support?topic=stylist" className="btn-ghost btn-sm">Записаться к стилисту</a>
        <a href="/account/support?topic=delete" className="btn-ghost btn-sm text-muted">Удалить аккаунт</a>
      </div>
    </div>
  );
}
