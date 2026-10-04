import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { GIFT_STATUS } from "@/lib/labels";
import { Alert, Badge, PageTitle } from "@/components/ui";
import { CopyLink } from "@/components/account/copy-link";
import { GiftPayButton } from "@/components/account/gift-pay-button";
import { syncGiftCardPayment, yookassaEnabled } from "@/lib/payments/yookassa";

export const metadata: Metadata = { title: "Сертификат" };

export default async function GiftCardPage({ params, searchParams }: PageProps<"/account/giftcards/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/account/giftcards/${id}`);
  if ((await searchParams).paid && (await db.giftCard.count({ where: { id, purchaserId: user.id } }))) await syncGiftCardPayment(id);
  const card = await db.giftCard.findUnique({
    where: { id },
    include: { redemptions: { orderBy: { createdAt: "desc" }, include: { order: { select: { number: true } } } } },
  });
  if (!card || card.purchaserId !== user.id) notFound();
  const showCode = card.status === "ACTIVE" || card.status === "USED";
  const greeting = card.recipientName ? `${card.recipientName}, ` : "";
  const recipientText = `${greeting}вам подарили сертификат T.Rodionova на ${formatMoney(card.amount)}.${card.message ? ` «${card.message}»` : ""} Код сертификата: ${card.code}. Введите его при оформлении заказа на сайте или назовите в шоуруме. Срок действия — до ${formatDate(card.expiresAt)}`;
  return (
    <div className="space-y-8">
      <PageTitle eyebrow={formatDate(card.createdAt, true)} title={`Сертификат на ${formatMoney(card.amount)}`} actions={<Badge tone={GIFT_STATUS[card.status].tone}>{GIFT_STATUS[card.status].label}</Badge>} />

      {card.status === "PENDING" && (
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="text-sm">Ожидает оплаты: {formatMoney(card.amount)}</div>
            <div className="text-xs text-muted">Код сертификата появится сразу после оплаты</div>
          </div>
          <GiftPayButton cardId={card.id} live={await yookassaEnabled()} />
        </div>
      )}
      {card.status === "ACTIVE" && <Alert tone="success">Сертификат оплачен и активен. Перешлите код получателю — текст ниже можно скопировать.</Alert>}
      {card.status === "USED" && <Alert tone="neutral">Сертификат использован полностью.</Alert>}
      {card.status === "CANCELLED" && <Alert tone="danger">Сертификат отменён. Если это ошибка, напишите в <Link href="/account/support" className="underline">службу заботы</Link>.</Alert>}
      {card.status === "EXPIRED" && <Alert tone="warning">Срок действия сертификата истёк {formatDate(card.expiresAt)}.</Alert>}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card p-6 text-center">
            <div className="eyebrow">Код сертификата</div>
            <div className="serif mt-3 text-2xl tracking-[0.12em] md:text-3xl">{showCode ? card.code : "TR-••••-••••-••••-••••"}</div>
            <div className="mt-2 text-xs text-muted">Остаток {formatMoney(card.balance)} из {formatMoney(card.amount)} · действует до {formatDate(card.expiresAt)}</div>
            {card.status === "ACTIVE" && <CopyLink value={card.code} />}
          </div>
          {card.status === "ACTIVE" && (
            <div>
              <div className="eyebrow mb-2">Текст для получателя</div>
              <p className="border border-line bg-white p-4 text-sm leading-relaxed">{recipientText}</p>
              <CopyLink value={recipientText} />
            </div>
          )}
          {card.redemptions.length > 0 && (
            <section>
              <h2 className="mb-3 text-xl">Списания</h2>
              <ul className="divide-y divide-line border-y border-line text-sm">
                {card.redemptions.map((r) => (
                  <li key={r.id} className="flex justify-between py-3">
                    <span>{r.amount < 0 ? "Возврат на сертификат" : "Оплата заказа"} №{r.order.number} · <span className="text-xs text-muted">{formatDate(r.createdAt, true)}</span></span>
                    <span className={r.amount < 0 ? "text-success" : ""}>{r.amount < 0 ? "+" : "−"}{formatMoney(Math.abs(r.amount))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="card h-fit space-y-3 p-5 text-sm">
          <div className="eyebrow">Получатель</div>
          <div>{card.recipientName ?? "Не указан"}</div>
          {card.recipientEmail && <div className="text-xs text-muted">{card.recipientEmail}</div>}
          {card.message && (
            <>
              <div className="eyebrow pt-2">Сообщение</div>
              <p className="text-ink/80">{card.message}</p>
            </>
          )}
          <div className="border-t border-line pt-3 text-xs text-muted">
            Сертификат можно использовать частями при оформлении заказа — поле «Подарочный сертификат» рядом с промокодом.
          </div>
          <Link href="/account/giftcards" className="block text-xs underline">← Все сертификаты</Link>
        </aside>
      </div>
    </div>
  );
}
