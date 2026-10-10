import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { DELIVERY_METHOD, ORDER_STATUS, PAYMENT_METHOD } from "@/lib/labels";
import { Alert, Badge, PageTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/form";
import { ReviewForm } from "@/components/account/review-form";
import { ExchangeForm } from "@/components/account/exchange-form";
import { cancelOwnOrderAction } from "@/app/actions/shop";
import { PayButton } from "@/components/account/pay-button";
import { syncOrderPayment, paymentsEnabled, onlinePaymentsAvailable } from "@/lib/payments/provider";
import { getSettingOrDefault } from "@/lib/settings";
import { trackingUrl, yandexTrackingLink } from "@/lib/delivery";
import { MetrikaGoal } from "@/components/metrika-goal";

const STEPS = ["NEW", "PAID", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] as const;

export const metadata: Metadata = { title: "Заказ" };

export default async function OrderPage({ params, searchParams }: PageProps<"/account/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/account/orders/${id}`);
  // статус у кассы запрашиваем только для своего заказа; сбой кассы не мешает показать заказ
  if (sp.paid && (await db.order.count({ where: { id, userId: user.id } }))) await syncOrderPayment(id).catch((e) => console.error("sync payment", id, e));
  const order = await db.order.findUnique({
    where: { id },
    include: { items: { include: { variant: { include: { product: { include: { variants: { select: { size: true, color: true, stock: true, reserved: true } } } } } } } }, payments: true, history: { orderBy: { createdAt: "asc" } }, address: true },
  });
  if (!order || order.userId !== user.id) notFound();
  const reviewed = new Set((await db.review.findMany({ where: { userId: user.id }, select: { productId: true } })).map((r) => r.productId));
  const canReview = order.status === "DELIVERED" || order.status === "COMPLETED";
  const stepIdx = STEPS.indexOf(order.status === "CONFIRMED" ? "PAID" : (order.status as (typeof STEPS)[number]));
  const payment = order.payments[0];
  const returnUntil = order.deliveredAt ? new Date(order.deliveredAt.getTime() + 14 * 86_400_000) : null;
  return (
    <div className="space-y-8">
      <PageTitle eyebrow={formatDate(order.createdAt, true)} title={`Заказ №${order.number}`} actions={<Badge tone={ORDER_STATUS[order.status].tone}>{ORDER_STATUS[order.status].label}</Badge>} />
      {sp.created && <Alert tone="success">Спасибо! Заказ оформлен, товары зарезервированы за вами.</Alert>}
      {sp.created && (
        <MetrikaGoal
          goal="order"
          dedupe={order.id}
          purchase={{ id: String(order.number), revenue: order.total / 100, products: order.items.map((i) => ({ id: i.variant.sku, name: i.productName, price: i.price / 100, quantity: i.quantity, variant: `${i.color} · ${i.size}` })) }}
        />
      )}
      {sp.paid && order.status !== "NEW" && order.status !== "CANCELLED" && <Alert tone="success">Оплата получена, спасибо! Мы начали собирать заказ.</Alert>}
      {sp.paid && order.status === "NEW" && (() => {
        // вернулись с платёжной страницы, а оплата не подтверждена: говорим, что ответила касса
        const p = (payment?.payload ?? null) as { status?: string; reason?: string | null } | null;
        if (p?.status === "Declined" || p?.status === "Cancelled") return <Alert tone="danger">Платёж не прошёл{p.reason ? `: ${p.reason}` : ""}. Попробуйте ещё раз или выберите другую карту.</Alert>;
        if (p?.status === "TestMode") return <Alert tone="warning">Платёж прошёл в тестовом режиме кассы: деньги не списаны, заказ пока не оплачен.</Alert>;
        return <Alert tone="warning">Касса ещё не подтвердила оплату. Обновите страницу через минуту — статус заказа сменится на «Оплачен».</Alert>;
      })()}

      {order.status === "NEW" && (
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="text-sm">Ожидает оплаты: {formatMoney(order.total)}</div>
            <div className="text-xs text-muted">{payment ? PAYMENT_METHOD[payment.method] : ""}{/* снимается через сутки только неоплаченная онлайн-оплата; при получении и переводом резерв держится */}{payment && ["CARD", "SBP", "INSTALLMENT"].includes(payment.method) ? " · резерв действует 24 часа" : ""}{order.isPreorder ? " · предзаказ" : ""}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* кнопка оплаты — только когда заплатить на сайте можно; иначе заказ ждёт оплаты при получении или переводом */}
            {(await onlinePaymentsAvailable()) && <PayButton orderId={order.id} live={await paymentsEnabled()} />}
            <form action={cancelOwnOrderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <ConfirmButton message="Отменить заказ? Списанные баллы вернутся на счёт.">Отменить</ConfirmButton>
            </form>
          </div>
        </div>
      )}

      {order.status === "NEW" && payment?.method === "MANUAL" && (await (async () => {
        const seller = await getSettingOrDefault("seller");
        if (!seller.account) return null;
        return (
          <div className="card p-5 text-sm">
            <div className="eyebrow">Реквизиты для перевода</div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Получатель</dt><dd>{seller.name}</dd>
              <dt className="text-muted">ИНН</dt><dd>{seller.inn}</dd>
              <dt className="text-muted">Банк</dt><dd>{seller.bank}, БИК {seller.bik}</dd>
              <dt className="text-muted">Расчётный счёт</dt><dd className="select-all">{seller.account}</dd>
              <dt className="text-muted">Корр. счёт</dt><dd>{seller.corrAccount}</dd>
              <dt className="text-muted">Сумма</dt><dd>{formatMoney(order.total)}</dd>
              <dt className="text-muted">Назначение</dt><dd className="select-all">Оплата заказа №{order.number}, без НДС</dd>
            </dl>
            <p className="mt-3 text-xs text-muted">После поступления денег менеджер подтвердит оплату, и заказ перейдёт в сборку. Резерв действует 24 часа.</p>
          </div>
        );
      })())}

      {stepIdx >= 0 && (
        <ol className="grid grid-cols-3 gap-x-1 gap-y-3 text-center text-[0.6rem] uppercase tracking-[0.12em] sm:grid-cols-6">
          {STEPS.map((s, i) => (
            <li key={s}>
              <div className={`h-1 ${i <= stepIdx ? "bg-ink" : "bg-line"}`} />
              <div className={`mt-2 ${i <= stepIdx ? "text-ink" : "text-muted"}`}>{ORDER_STATUS[s].label}</div>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="divide-y divide-line border-y border-line">
          {order.items.map((i) => (
            <div key={i.id} className="flex justify-between gap-4 py-4">
              <div className="min-w-0">
                <Link href={`/product/${i.variant.product.slug}`} className="text-sm">{i.productName}</Link>
                <div className="text-xs text-muted">{i.color} · {i.size} · {i.quantity} шт. {i.returnedQty ? `· возвращено ${i.returnedQty}` : ""}</div>
                {canReview && !reviewed.has(i.variant.productId) && <div className="mt-2"><ReviewForm productId={i.variant.productId} productName={i.productName} /></div>}
                {canReview && returnUntil && returnUntil > new Date() && i.quantity - i.returnedQty > 0 && (
                  <ExchangeForm orderItemId={i.id} currentSize={i.size} sizes={i.variant.product.variants.filter((v) => (v.color ?? "") === (i.variant.color ?? "") && v.stock - v.reserved > 0).map((v) => v.size)} />
                )}
              </div>
              <div className="shrink-0 text-sm">{formatMoney(i.price * i.quantity)}</div>
            </div>
          ))}
        </div>
        <aside className="card h-fit space-y-2 p-5 text-sm">
          <div className="flex justify-between"><span>Товары</span><span>{formatMoney(order.subtotal)}</span></div>
          {order.discount - order.pointsUsed * 100 > 0 && <div className="flex justify-between text-success"><span>Скидка</span><span>−{formatMoney(order.discount - order.pointsUsed * 100)}</span></div>}
          {order.pointsUsed > 0 && <div className="flex justify-between text-success"><span>Баллами</span><span>−{formatMoney(order.pointsUsed * 100)}</span></div>}
          {order.giftUsed > 0 && <div className="flex justify-between text-success"><span>Сертификатом</span><span>−{formatMoney(order.giftUsed)}</span></div>}
          <div className="flex justify-between"><span>Доставка</span><span>{order.deliveryCost ? formatMoney(order.deliveryCost) : "бесплатно"}</span></div>
          <div className="flex justify-between border-t border-line pt-2 text-base"><span className="serif">Итого</span><span>{formatMoney(order.total)}</span></div>
          <div className="pt-2 text-xs text-taupe-dark">
            {order.pointsEarned ? `Начислено ${order.pointsEarned.toLocaleString("ru-RU")} баллов` : order.status === "CANCELLED" || order.status === "RETURNED" ? "" : "Баллы начислятся через 14 дней после получения"}
          </div>
          <div className="border-t border-line pt-3 text-xs text-muted">
            <div className="eyebrow mb-1">Доставка</div>
            {DELIVERY_METHOD[order.deliveryMethod].label}
            {order.address && <div>{[order.address.city, order.address.street, order.address.building, order.address.apartment && `кв. ${order.address.apartment}`].filter(Boolean).join(", ")}</div>}
            {order.addressText && <div>{order.addressText}</div>}
            {order.deliverySlot && <div>Интервал: {order.deliverySlot}</div>}
            {order.fittingRequested && <div>Примерка до 20 минут</div>}
            {order.trackingNumber && (
              <div className="mt-1 text-ink">
                Трек-номер: {trackingUrl(order.deliveryMethod, order.trackingNumber) ? <a href={trackingUrl(order.deliveryMethod, order.trackingNumber)!} target="_blank" rel="noopener" className="underline">{order.trackingNumber} ↗</a> : order.trackingNumber}
              </div>
            )}
            {yandexTrackingLink(order.shipmentData) && ["PACKING", "SHIPPED"].includes(order.status) && (
              <div className="mt-1 text-ink">
                <a href={yandexTrackingLink(order.shipmentData)!} target="_blank" rel="noopener" className="underline">Следить за курьером на карте ↗</a>
              </div>
            )}
            {returnUntil && order.status === "DELIVERED" && returnUntil > new Date() && (
              <div className="mt-2">
                Возврат возможен до {formatDate(returnUntil)}.{" "}
                <Link href={`/account/support?topic=return&order=${order.number}`} className="text-ink underline">Оформить возврат</Link>
              </div>
            )}
          </div>
        </aside>
      </div>

      <section>
        <h2 className="mb-3">История</h2>
        <ul className="space-y-2 text-sm">
          {order.history.map((h) => (
            <li key={h.id} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4"><span className="shrink-0 text-xs text-muted sm:w-36">{formatDate(h.createdAt, true)}</span><span>{h.status ? `${ORDER_STATUS[h.status].label}. ` : ""}{h.message !== "Статус изменён" ? h.message : ""}</span></li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-muted">Вопрос по заказу? <Link href={`/account/support?order=${order.number}`} className="underline">Напишите в службу заботы</Link>.</p>
    </div>
  );
}
