import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { isWorkingTime } from "@/lib/support/inbox";
import { formatDate, formatMoney } from "@/lib/money";
import { CHANNEL, CONVERSATION_STATUS, ORDER_STATUS } from "@/lib/labels";
import { Badge, Empty, Eyebrow } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { Composer, LinkCustomerForm, MarkRead, ScrollToBottom, SimulateForm } from "@/components/crm/support-client";
import { qs, str } from "@/components/crm/pager";
import { retryMessageAction, unlinkCustomerAction, updateConversationAction } from "@/app/actions/support";
import type { Prisma } from "@/generated/prisma/client";
import type { Channel, ConversationStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Поддержка" };

function ago(d: Date, now: Date) {
  const m = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (m < 1) return "сейчас";
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч`;
  return `${Math.floor(h / 24)} д`;
}

function ChannelDot({ channel }: { channel: Channel }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.55rem] font-medium text-white" style={{ background: CHANNEL[channel].color }} title={CHANNEL[channel].label}>
      {CHANNEL[channel].short}
    </span>
  );
}

export default async function SupportInbox({ searchParams }: PageProps<"/crm/support">) {
  const me = await requireSection("support");
  const sp = await searchParams;
  const view = str(sp.view) ?? "mine";
  const status = (str(sp.status) ?? "active") as ConversationStatus | "active";
  const channel = str(sp.channel) as Channel | undefined;
  const q = str(sp.q);
  const selected = str(sp.c);
  const now = new Date();
  const settings = await getSetting("support");

  const where: Prisma.ConversationWhereInput = {
    ...(status === "active" ? { status: { in: ["OPEN", "PENDING"] } } : { status }),
    ...(view === "mine" ? { assigneeId: me.id } : view === "unassigned" ? { assigneeId: null } : {}),
    ...(channel ? { channel } : {}),
    ...(q
      ? {
          OR: [
            { contact: { name: { contains: q, mode: "insensitive" } } },
            { contact: { username: { contains: q, mode: "insensitive" } } },
            { contact: { phone: { contains: q } } },
            { contact: { email: { contains: q, mode: "insensitive" } } },
            { messages: { some: { text: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const slaBorder = new Date(now.getTime() - settings.slaMinutes * 60_000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const [list, counts, overdue, firstResponses, staff, templates] = await Promise.all([
    db.conversation.findMany({
      where,
      include: { contact: true, assignee: { select: { firstName: true } }, customer: { select: { firstName: true, lastName: true, loyaltyTier: { select: { name: true } } } }, messages: { orderBy: { createdAt: "desc" }, take: 1, where: { direction: { in: ["IN", "OUT", "SYSTEM"] } } } },
      orderBy: [{ priority: "desc" }, { lastMessageAt: "desc" }],
      take: 100,
    }),
    Promise.all([
      db.conversation.count({ where: { status: { in: ["OPEN", "PENDING"] }, assigneeId: me.id } }),
      db.conversation.count({ where: { status: { in: ["OPEN", "PENDING"] }, assigneeId: null } }),
      db.conversation.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
    ]),
    db.conversation.count({ where: { status: "OPEN", waitingSince: { lt: slaBorder } } }),
    db.conversation.findMany({ where: { firstResponseAt: { gte: todayStart } }, select: { createdAt: true, firstResponseAt: true } }),
    db.user.findMany({ where: { role: { in: ["SUPPORT", "MANAGER", "ADMIN"] }, isActive: true }, select: { id: true, firstName: true, role: true } }),
    db.replyTemplate.findMany({ orderBy: [{ order: "asc" }, { title: "asc" }] }),
  ]);
  const avgFirst = firstResponses.length
    ? Math.round(firstResponses.reduce((s, c) => s + (c.firstResponseAt!.getTime() - c.createdAt.getTime()), 0) / firstResponses.length / 60_000)
    : null;
  const conv = selected
    ? await db.conversation.findUnique({
        where: { id: selected },
        include: {
          contact: true,
          assignee: { select: { id: true, firstName: true } },
          messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { firstName: true } } } },
          customer: { include: { loyaltyTier: true, orders: { orderBy: { createdAt: "desc" }, take: 5, include: { items: { select: { productName: true, size: true } } } }, notes: { orderBy: { createdAt: "desc" }, take: 3 } } },
        },
      })
    : null;
  const history = conv ? await db.conversation.findMany({ where: { contactId: conv.contactId, id: { not: conv.id } }, orderBy: { createdAt: "desc" }, take: 5 }) : [];
  const linkedOrders = conv?.orderNumbers.length ? await db.order.findMany({ where: { number: { in: conv.orderNumbers } } }) : [];
  const base = { view, status: status === "active" ? undefined : status, channel, q };
  const working = isWorkingTime(settings, now);

  return (
    <div className="-mx-4 -my-8 md:-mx-8">
      <AutoRefresh seconds={8} />
      {conv && <MarkRead id={conv.id} unread={conv.unread} />}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-white px-4 py-3 text-sm md:px-6">
        <h1 className="text-2xl">Поддержка</h1>
        <span className="text-muted">Активных: <b className="font-normal text-ink">{counts[2]}</b></span>
        <span className={overdue ? "text-danger" : "text-muted"}>Ждут дольше {settings.slaMinutes} мин: {overdue}</span>
        <span className="text-muted">Первый ответ сегодня: {avgFirst !== null ? `${avgFirst} мин` : "—"}</span>
        <span className={working ? "text-success" : "text-warning"}>{working ? "Рабочее время" : "Нерабочее время · автоответ включён"}</span>
        <div className="ml-auto flex gap-3 text-[0.68rem] uppercase tracking-[0.16em]">
          {can(me.role, "ordersEdit") && <Link href="/crm/support/templates" className="text-muted hover:text-ink">Шаблоны</Link>}
          {can(me.role, "integrations") && <Link href="/crm/settings/channels" className="text-muted hover:text-ink">Каналы</Link>}
        </div>
      </div>
      {can(me.role, "ordersEdit") && (
        <details className="border-b border-line bg-ivory px-4 py-2 md:px-6">
          <summary className="cursor-pointer text-xs text-muted">Тестовое входящее сообщение — проверить маршрутизацию без подключённых каналов</summary>
          <div className="py-3"><SimulateForm /></div>
        </details>
      )}

      <div className="grid min-h-[calc(100vh-120px)] lg:grid-cols-[340px_1fr] 2xl:grid-cols-[340px_1fr_320px]">
        {/* Список диалогов */}
        <aside className={`border-r border-line bg-white ${conv ? "hidden lg:block" : ""}`}>
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex gap-1 text-[0.65rem] uppercase tracking-[0.12em]">
              {[["mine", `Мои · ${counts[0]}`], ["unassigned", `Без ответственного · ${counts[1]}`], ["all", "Все"]].map(([k, v]) => (
                <Link key={k} href={qs("/crm/support", { ...base, view: k })} className={`px-2 py-1 ${view === k ? "bg-ink text-ivory" : "text-muted hover:text-ink"}`}>{v}</Link>
              ))}
            </div>
            <form className="flex gap-2">
              <input type="hidden" name="view" value={view} />
              <input name="q" defaultValue={q} placeholder="Поиск по имени, тексту" className="input py-1.5 text-xs" />
              <select name="channel" defaultValue={channel ?? ""} className="border border-line bg-white px-1 text-xs">
                <option value="">Все</option>
                {Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}
              </select>
              <select name="status" defaultValue={status} className="border border-line bg-white px-1 text-xs">
                <option value="active">Активные</option>
                <option value="OPEN">Ждут ответа</option>
                <option value="PENDING">Ждём клиента</option>
                <option value="CLOSED">Закрытые</option>
              </select>
              <button className="text-xs">→</button>
            </form>
          </div>
          <ul className="max-h-[calc(100vh-230px)] overflow-y-auto">
            {list.map((c) => {
              const late = c.status === "OPEN" && c.waitingSince && c.waitingSince < slaBorder;
              const last = c.messages[0];
              return (
                <li key={c.id}>
                  <Link href={qs("/crm/support", { ...base, c: c.id })} className={`flex gap-3 border-b border-line/60 px-3 py-3 hover:bg-ivory ${selected === c.id ? "bg-sand/50" : ""}`}>
                    <ChannelDot channel={c.channel} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${c.unread ? "font-medium" : ""}`}>
                          {c.priority === "HIGH" && <span className="mr-1 text-danger">●</span>}
                          {c.customer ? `${c.customer.firstName} ${c.customer.lastName ?? ""}` : c.contact.name ?? c.contact.username ?? c.contact.externalId}
                        </span>
                        <span className={`shrink-0 text-[0.65rem] ${late ? "text-danger" : "text-muted"}`}>{ago(c.status === "OPEN" && c.waitingSince ? c.waitingSince : c.lastMessageAt, now)}</span>
                      </div>
                      <div className="truncate text-xs text-muted">{last ? `${last.direction === "IN" ? "" : "Вы: "}${last.text}` : ""}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {c.customer?.loyaltyTier && <span className="text-[0.6rem] uppercase tracking-[0.1em] text-taupe-dark">{c.customer.loyaltyTier.name}</span>}
                        {c.tags.slice(0, 3).map((t) => <span key={t} className="text-[0.6rem] text-muted">#{t}</span>)}
                        <span className="ml-auto text-[0.6rem] text-muted">{c.assignee?.firstName ?? "—"}</span>
                        {c.unread > 0 && <span className="rounded-full bg-ink px-1.5 text-[0.6rem] text-ivory">{c.unread}</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
            {list.length === 0 && <li className="p-6 text-center text-sm text-muted">Диалогов нет</li>}
          </ul>
        </aside>

        {/* Переписка */}
        <section className={`flex min-w-0 flex-col bg-ivory ${conv ? "" : "hidden lg:flex"}`}>
          {!conv ? (
            <div className="m-auto max-w-md p-6"><Empty title="Выберите диалог">Сообщения из Telegram, WhatsApp, Instagram, ВКонтакте, почты и с сайта собираются здесь. Клиент определяется автоматически по телефону или email.</Empty></div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-3">
                <Link href={qs("/crm/support", base)} className="text-xs text-muted lg:hidden">← Назад</Link>
                <ChannelDot channel={conv.channel} />
                <div className="min-w-0">
                  <div className="truncate text-sm">{conv.contact.name ?? conv.contact.username ?? conv.contact.externalId}</div>
                  <div className="text-xs text-muted">{CHANNEL[conv.channel].label} · {conv.contact.username ?? conv.contact.phone ?? conv.contact.email ?? conv.contact.externalId}</div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Badge tone={CONVERSATION_STATUS[conv.status].tone}>{CONVERSATION_STATUS[conv.status].label}</Badge>
                  <form action={updateConversationAction} className="flex gap-1">
                    <input type="hidden" name="conversationId" value={conv.id} />
                    <select name="assigneeId" defaultValue={conv.assignee?.id ?? ""} className="border border-line bg-white px-2 py-1 text-xs">
                      <option value="">Без ответственного</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.firstName}</option>)}
                    </select>
                    <button className="text-xs underline">ок</button>
                  </form>
                  <form action={updateConversationAction}>
                    <input type="hidden" name="conversationId" value={conv.id} />
                    <input type="hidden" name="priority" value={conv.priority === "HIGH" ? "NORMAL" : "HIGH"} />
                    <button className={`badge ${conv.priority === "HIGH" ? "border-danger/40 text-danger" : "border-line"}`}>{conv.priority === "HIGH" ? "● Важно" : "Пометить важным"}</button>
                  </form>
                  <form action={updateConversationAction}>
                    <input type="hidden" name="conversationId" value={conv.id} />
                    <input type="hidden" name="status" value={conv.status === "CLOSED" ? "OPEN" : "CLOSED"} />
                    <button className="btn-outline btn-sm">{conv.status === "CLOSED" ? "Открыть" : "Закрыть"}</button>
                  </form>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4 md:max-h-[calc(100vh-330px)]">
                {history.length > 0 && (
                  <div className="text-center text-xs text-muted">
                    Предыдущие обращения: {history.map((h, i) => <span key={h.id}>{i > 0 && ", "}<Link href={qs("/crm/support", { ...base, c: h.id, status: "CLOSED" })} className="underline">{formatDate(h.createdAt)}</Link></span>)}
                  </div>
                )}
                {conv.messages.map((m) =>
                  m.direction === "SYSTEM" ? (
                    <div key={m.id} className="mx-auto max-w-md text-center text-xs text-muted">
                      Автоответ · {formatDate(m.createdAt, true)}<br />{m.text}
                      {m.status === "FAILED" && <div className="text-danger">не доставлен: {m.error}</div>}
                    </div>
                  ) : m.direction === "NOTE" ? (
                    <div key={m.id} className="mx-auto max-w-xl border border-dashed border-champagne-dark bg-champagne/20 px-3 py-2 text-xs">
                      <span className="text-muted">{m.author?.firstName ?? "Система"} · {formatDate(m.createdAt, true)} · заметка</span>
                      <div className="mt-1 whitespace-pre-wrap text-sm">{m.text}</div>
                    </div>
                  ) : (
                    <div key={m.id} className={`flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] px-4 py-2.5 text-sm ${m.direction === "OUT" ? "bg-ink text-ivory" : "border border-line bg-white"}`}>
                        <div className="whitespace-pre-wrap">{m.text}</div>
                        <div className={`mt-1 text-[0.65rem] ${m.direction === "OUT" ? "text-ivory/60" : "text-muted"}`}>
                          {m.direction === "OUT" && `${m.author?.firstName ?? ""} · `}{formatDate(m.createdAt, true)}
                          {m.direction === "OUT" && (m.status === "SENT" ? " · ✓" : m.status === "QUEUED" ? " · …" : "")}
                        </div>
                        {m.status === "FAILED" && (
                          <form action={retryMessageAction} className="mt-1 text-[0.7rem] text-champagne">
                            <input type="hidden" name="messageId" value={m.id} />
                            Не доставлено: {m.error} · <button className="underline">повторить</button>
                          </form>
                        )}
                      </div>
                    </div>
                  ),
                )}
                <ScrollToBottom dep={`${conv.id}-${conv.messages.length}`} />
              </div>
              <Composer
                conversationId={conv.id}
                templates={templates}
                ctx={{ name: conv.customer?.firstName ?? conv.contact.name?.split(" ")[0], tier: conv.customer?.loyaltyTier?.name, points: conv.customer?.pointsBalance, order: conv.orderNumbers.at(-1) ?? conv.customer?.orders[0]?.number }}
                hint={conv.channel === "WHATSAPP" ? "WhatsApp: свободный ответ — в течение 24 ч после сообщения клиента" : undefined}
              />
            </>
          )}
        </section>

        {/* Контекст клиента */}
        {conv && (
          <aside className="hidden space-y-5 border-l border-line bg-white p-4 text-sm 2xl:block">
            {conv.customer ? (
              <div>
                <Eyebrow>Клиент</Eyebrow>
                <Link href={`/crm/customers/${conv.customer.id}`} className="serif mt-1 block text-xl underline-offset-4 hover:underline">{conv.customer.firstName} {conv.customer.lastName}</Link>
                <div className="text-xs text-muted">{conv.customer.phone} · {conv.customer.email}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-ivory p-2"><div className="text-muted">Уровень</div>{conv.customer.loyaltyTier?.name}</div>
                  <div className="bg-ivory p-2"><div className="text-muted">Баллы</div>{conv.customer.pointsBalance.toLocaleString("ru-RU")}</div>
                  <div className="bg-ivory p-2"><div className="text-muted">LTV</div>{formatMoney(conv.customer.lifetimeSpent)}</div>
                  <div className="bg-ivory p-2"><div className="text-muted">Размер</div>{conv.customer.preferredSize ?? "—"}</div>
                </div>
                <form action={unlinkCustomerAction} className="mt-2"><input type="hidden" name="conversationId" value={conv.id} /><button className="text-[0.65rem] text-muted underline">Отвязать</button></form>
              </div>
            ) : (
              <div>
                <Eyebrow>Клиент не определён</Eyebrow>
                <p className="mt-1 text-xs text-muted">Найдите карточку по email или телефону — переписка попадёт в профиль клиента.</p>
                <div className="mt-2"><LinkCustomerForm conversationId={conv.id} /></div>
              </div>
            )}
            {(linkedOrders.length > 0 || (conv.customer?.orders.length ?? 0) > 0) && (
              <div>
                <Eyebrow>Заказы</Eyebrow>
                <ul className="mt-2 space-y-2">
                  {[...linkedOrders, ...(conv.customer?.orders ?? []).filter((o) => !linkedOrders.some((l) => l.id === o.id))].slice(0, 6).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <Link href={`/crm/orders/${o.id}`} className="underline">№{o.number}{conv.orderNumbers.includes(o.number) ? " · упомянут" : ""}</Link>
                      <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {conv.customer && conv.customer.notes.length > 0 && (
              <div>
                <Eyebrow>Заметки стилиста</Eyebrow>
                <ul className="mt-2 space-y-1 text-xs">{conv.customer.notes.map((n) => <li key={n.id} className="border-l-2 border-champagne pl-2">{n.text}</li>)}</ul>
              </div>
            )}
            <div>
              <Eyebrow>Теги</Eyebrow>
              <form action={updateConversationAction} className="mt-2 flex gap-2">
                <input type="hidden" name="conversationId" value={conv.id} />
                <input name="tags" defaultValue={conv.tags.join(", ")} className="input py-1.5 text-xs" />
                <button className="text-xs underline">ок</button>
              </form>
              <p className="mt-1 text-[0.65rem] text-muted">Темы определяются автоматически по тексту: доставка, размер, возврат, оплата, баллы.</p>
            </div>
            <div className="text-xs text-muted">
              Создан {formatDate(conv.createdAt, true)}<br />
              Первый ответ: {conv.firstResponseAt ? `${Math.max(0, Math.round((conv.firstResponseAt.getTime() - conv.createdAt.getTime()) / 60_000))} мин` : "ещё нет"}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
