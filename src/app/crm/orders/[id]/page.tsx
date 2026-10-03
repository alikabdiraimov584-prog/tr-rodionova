import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { ORDER_TRANSITIONS } from "@/lib/orders";
import { formatDate, formatMoney } from "@/lib/money";
import { DELIVERY_METHOD, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, STOCK_MOVEMENT, LEDGER_TYPE, TRAFFIC_CHANNEL } from "@/lib/labels";
import { Badge, Eyebrow, PageTitle } from "@/components/ui";
import { StatusForm, ReturnForm } from "@/components/crm/order-forms";
import { SubmitButton } from "@/components/form";
import { updateOrderInfoAction } from "@/app/actions/crm-orders";
import { can } from "@/lib/permissions";

export default async function CrmOrder({ params }: PageProps<"/crm/orders/[id]">) {
  const me = await requireSection("orders");
  const canEdit = can(me.role, "ordersEdit");
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: true,
      payments: true,
      history: { orderBy: { createdAt: "desc" } },
      movements: { include: { variant: true }, orderBy: { createdAt: "asc" } },
      ledger: true,
      address: true,
      promoCode: true,
      user: { include: { loyaltyTier: true } },
    },
  });
  if (!order) notFound();
  const staff = await db.user.findMany({ where: { id: { in: order.history.map((h) => h.createdBy).filter((x): x is string => !!x) } }, select: { id: true, firstName: true } });
  const staffName = new Map(staff.map((s) => [s.id, s.firstName]));
  const cogs = order.items.reduce((s, i) => s + (i.costPrice ?? 0) * (i.quantity - i.returnedQty), 0);
  const margin = order.total - order.deliveryCost - cogs;
  return (
    <div>
      <PageTitle
        eyebrow={formatDate(order.createdAt, true)}
        title={`Заказ №${order.number}`}
        actions={<Badge tone={ORDER_STATUS[order.status].tone}>{ORDER_STATUS[order.status].label}</Badge>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Товар</th><th>Артикул</th><th>Размер</th><th>Кол-во</th><th>Возврат</th><th className="text-right">Цена</th><th className="text-right">Себест.</th></tr></thead>
              <tbody>
                {order.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.productName}{i.isPreorder && <span className="ml-2 text-[0.6rem] uppercase text-warning">предзаказ</span>}<div className="text-xs text-muted">{i.color}</div></td>
                    <td className="text-muted">{i.sku}</td>
                    <td>{i.size}</td>
                    <td>{i.quantity}</td>
                    <td className={i.returnedQty ? "text-danger" : "text-muted"}>{i.returnedQty || "—"}</td>
                    <td className="text-right">{formatMoney(i.price)}</td>
                    <td className="text-right text-muted">{i.costPrice ? formatMoney(i.costPrice) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid gap-1 border-t border-line p-4 text-sm sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex justify-between"><span className="text-muted">Товары</span><span>{formatMoney(order.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Скидка {order.promoCode ? `(${order.promoCode.code})` : ""}</span><span>−{formatMoney(order.discount - order.pointsUsed * 100)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Баллами</span><span>−{formatMoney(order.pointsUsed * 100)}</span></div>
                {order.giftUsed > 0 && <div className="flex justify-between"><span className="text-muted">Сертификатом</span><span>−{formatMoney(order.giftUsed)}</span></div>}
                <div className="flex justify-between"><span className="text-muted">Доставка</span><span>{formatMoney(order.deliveryCost)}</span></div>
                <div className="flex justify-between border-t border-line pt-1"><span>Итого</span><span>{formatMoney(order.total)}</span></div>
              </div>
              <div className="space-y-1 sm:border-l sm:border-line sm:pl-4">
                <div className="flex justify-between"><span className="text-muted">Себестоимость</span><span>{formatMoney(cogs)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Валовая маржа</span><span className={margin >= 0 ? "text-success" : "text-danger"}>{formatMoney(margin)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Баллов начислено</span><span>{order.pointsEarned.toLocaleString("ru-RU")}</span></div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="card p-5 text-sm">
              <Eyebrow>Клиент</Eyebrow>
              <div className="mt-2">{order.firstName} {order.lastName}</div>
              <div className="text-muted">{order.phone} · {order.email}</div>
              {order.user && (
                <Link href={`/crm/customers/${order.user.id}`} className="mt-2 inline-block text-xs underline">
                  Карточка клиента · {order.user.loyaltyTier?.name} · {order.user.pointsBalance.toLocaleString("ru-RU")} баллов
                </Link>
              )}
              {order.channel && <div className="mt-2 text-xs text-muted">Источник заказа: {TRAFFIC_CHANNEL[order.channel]}{order.source ? ` · ${order.source}` : ""}{order.campaign ? ` · ${order.campaign}` : ""}</div>}
              {order.fittingRequested && <p className="mt-3 border-t border-line pt-3 font-medium">👗 Примерка курьером: клиентка оплачивает только подошедшее, курьер ждёт 15 минут</p>}
              {order.comment && <p className="mt-3 border-t border-line pt-3">💬 {order.comment}</p>}
            </div>
            <div className="card p-5 text-sm">
              <Eyebrow>Доставка и оплата</Eyebrow>
              <div className="mt-2">{DELIVERY_METHOD[order.deliveryMethod].label}</div>
              <div className="text-muted">
                {order.address ? [order.address.city, order.address.street, order.address.building, order.address.apartment && `кв. ${order.address.apartment}`].filter(Boolean).join(", ") : order.addressText ?? "—"}
              </div>
              {order.payments.map((p) => (
                <div key={p.id} className="mt-2 flex items-center justify-between">
                  <span>{PAYMENT_METHOD[p.method]} · {formatMoney(p.amount)}</span>
                  <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
                </div>
              ))}
            </div>
          </div>

          {canEdit && <div className="card p-5">
            <Eyebrow>Трек-номер и заметка менеджера</Eyebrow>
            <form action={updateOrderInfoAction} className="mt-3 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
              <input type="hidden" name="orderId" value={order.id} />
              <input name="trackingNumber" defaultValue={order.trackingNumber ?? ""} placeholder="Трек-номер" className="input" />
              <input name="managerNote" defaultValue={order.managerNote ?? ""} placeholder="Внутренняя заметка" className="input" />
              <SubmitButton className="btn-outline">Сохранить</SubmitButton>
            </form>
          </div>}

          <div className="grid gap-6 md:grid-cols-2">
            <div className="card p-5">
              <Eyebrow>Движения склада</Eyebrow>
              <ul className="mt-3 space-y-1 text-sm">
                {order.movements.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span>{STOCK_MOVEMENT[m.type].label} · {m.variant.sku}</span>
                    <span className="text-muted">{m.quantity > 0 ? "+" : ""}{m.quantity}</span>
                  </li>
                ))}
                {order.movements.length === 0 && <li className="text-muted">—</li>}
              </ul>
            </div>
            <div className="card p-5">
              <Eyebrow>Финансовые проводки</Eyebrow>
              <ul className="mt-3 space-y-1 text-sm">
                {order.ledger.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span>{LEDGER_TYPE[l.type].label}</span>
                    <span className={LEDGER_TYPE[l.type].sign > 0 ? "text-success" : "text-danger"}>{LEDGER_TYPE[l.type].sign > 0 ? "+" : "−"}{formatMoney(l.amount)}</span>
                  </li>
                ))}
                {order.ledger.length === 0 && <li className="text-muted">—</li>}
              </ul>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          {canEdit && <div className="card p-5">
            <Eyebrow>Статус</Eyebrow>
            <div className="mt-3"><StatusForm orderId={order.id} next={ORDER_TRANSITIONS[order.status]} tracking={order.trackingNumber} /></div>
          </div>}
          {canEdit && ["SHIPPED", "DELIVERED", "COMPLETED"].includes(order.status) && (
            <div className="card p-5">
              <Eyebrow>Частичный возврат</Eyebrow>
              <div className="mt-3"><ReturnForm orderId={order.id} items={order.items.map((i) => ({ id: i.id, name: `${i.productName} · ${i.size}`, left: i.quantity - i.returnedQty }))} /></div>
            </div>
          )}
          <div className="card p-5">
            <Eyebrow>История</Eyebrow>
            <ol className="mt-3 space-y-3 text-sm">
              {order.history.map((h) => (
                <li key={h.id} className="border-l border-line pl-3">
                  <div className="text-xs text-muted">{formatDate(h.createdAt, true)}{h.createdBy && staffName.get(h.createdBy) ? ` · ${staffName.get(h.createdBy)}` : ""}</div>
                  <div>{h.status ? <b className="font-normal">{ORDER_STATUS[h.status].label}. </b> : null}{h.message}</div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
