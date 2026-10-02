import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { DELIVERY_METHOD, ORDER_STATUS, PAYMENT_METHOD } from "@/lib/labels";
import { Alert, Badge, PageTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/form";
import { ReviewForm } from "@/components/account/review-form";
import { cancelOwnOrderAction } from "@/app/actions/shop";
import { PayButton } from "@/components/account/pay-button";
import { syncOrderPayment, yookassaEnabled } from "@/lib/payments/yookassa";

const STEPS = ["NEW", "PAID", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] as const;

export default async function OrderPage({ params, searchParams }: PageProps<"/account/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/account/orders/${id}`);
  if (sp.paid) await syncOrderPayment(id);
  const order = await db.order.findUnique({
    where: { id },
    include: { items: { include: { variant: { include: { product: true } } } }, payments: true, history: { orderBy: { createdAt: "asc" } }, address: true },
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

      {order.status === "NEW" && (
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="text-sm">Ожидает оплаты: {formatMoney(order.total)}</div>
            <div className="text-xs text-muted">{payment ? PAYMENT_METHOD[payment.method] : ""} · резерв действует 24 часа{order.isPreorder ? " · предзаказ" : ""}</div>
          </div>
          <div className="flex gap-2">
            <PayButton orderId={order.id} live={yookassaEnabled()} />
            <form action={cancelOwnOrderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <ConfirmButton message="Отменить заказ? Списанные баллы вернутся на счёт.">Отменить</ConfirmButton>
            </form>
          </div>
        </div>
      )}

      {stepIdx >= 0 && (
        <ol className="grid grid-cols-6 gap-1 text-center text-[0.6rem] uppercase tracking-[0.12em]">
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
              <div>
                <Link href={`/product/${i.variant.product.slug}`} className="text-sm">{i.productName}</Link>
                <div className="text-xs text-muted">{i.color} · {i.size} · {i.quantity} шт. {i.returnedQty ? `· возвращено ${i.returnedQty}` : ""}</div>
                {canReview && !reviewed.has(i.variant.productId) && <div className="mt-2"><ReviewForm productId={i.variant.productId} productName={i.productName} /></div>}
              </div>
              <div className="text-sm">{formatMoney(i.price * i.quantity)}</div>
            </div>
          ))}
        </div>
        <aside className="card h-fit space-y-2 p-5 text-sm">
          <div className="flex justify-between"><span>Товары</span><span>{formatMoney(order.subtotal)}</span></div>
          {order.discount - order.pointsUsed * 100 > 0 && <div className="flex justify-between text-success"><span>Скидка</span><span>−{formatMoney(order.discount - order.pointsUsed * 100)}</span></div>}
          {order.pointsUsed > 0 && <div className="flex justify-between text-success"><span>Баллами</span><span>−{formatMoney(order.pointsUsed * 100)}</span></div>}
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
            {order.trackingNumber && <div className="mt-1 text-ink">Трек-номер: {order.trackingNumber}</div>}
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
        <h2 className="mb-3 text-xl">История</h2>
        <ul className="space-y-2 text-sm">
          {order.history.map((h) => (
            <li key={h.id} className="flex gap-4"><span className="w-36 shrink-0 text-xs text-muted">{formatDate(h.createdAt, true)}</span><span>{h.status ? `${ORDER_STATUS[h.status].label}. ` : ""}{h.message !== "Статус изменён" ? h.message : ""}</span></li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-muted">Вопрос по заказу? <Link href={`/account/support?order=${order.number}`} className="underline">Напишите в службу заботы</Link> или позвоните +7 (495) 000-00-00.</p>
    </div>
  );
}
