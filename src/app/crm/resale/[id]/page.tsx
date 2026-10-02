import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { formatDate, formatMoney } from "@/lib/money";
import { RESALE_STATUS } from "@/lib/labels";
import { RESALE_CONDITIONS, conditionPct, maxOfferPoints } from "@/lib/resale";
import { Badge, Eyebrow, PageTitle, Stat } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/form";
import { ListForm, OfferForm } from "@/components/crm/resale-forms";
import { declineResaleAction, receiveResaleAction, soldResaleAction } from "@/app/actions/crm-resale";

export default async function ResaleCard({ params }: PageProps<"/crm/resale/[id]">) {
  await requireSection("resale");
  const { id } = await params;
  const [r, loyalty] = await Promise.all([
    db.resaleRequest.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, pointsBalance: true, loyaltyTier: { select: { name: true } } } },
        orderItem: { include: { order: { select: { id: true, number: true, createdAt: true } }, variant: { include: { product: { select: { slug: true, name: true, price: true } } } } } },
        product: { select: { slug: true, name: true, price: true } },
      },
    }),
    getSetting("loyalty"),
  ]);
  if (!r) notFound();
  const listed = r.listedProductId ? await db.product.findUnique({ where: { id: r.listedProductId }, select: { id: true, slug: true, name: true, price: true, variants: { select: { stock: true, reserved: true } } } }) : null;
  const purchasePrice = r.orderItem?.price ?? r.product?.price ?? 0;
  const maxByCondition = RESALE_CONDITIONS.map((c) => ({ label: c.label, pct: c.pct, points: maxOfferPoints(purchasePrice, c.value, loyalty.pointValueKopecks) }));
  const suggested = maxOfferPoints(purchasePrice, r.condition, loyalty.pointValueKopecks);
  const itemName = r.orderItem?.productName ?? r.product?.name ?? "Вещь";
  const st = RESALE_STATUS[r.status];
  return (
    <div className="space-y-6">
      <PageTitle eyebrow={`Заявка от ${formatDate(r.createdAt)}`} title={`${itemName}${r.orderItem ? ` · ${r.orderItem.size}` : ""}`} actions={<Badge tone={st.tone}>{st.label}</Badge>}>
        <Link href="/crm/resale" className="underline">← Все заявки</Link>
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Цена покупки" value={purchasePrice ? formatMoney(purchasePrice) : "—"} hint={r.orderItem ? <Link href={`/crm/orders/${r.orderItem.order.id}`} className="underline">заказ №{r.orderItem.order.number} от {formatDate(r.orderItem.order.createdAt)}</Link> : undefined} />
        <Stat label="Состояние" value={r.condition ?? "—"} hint={r.condition ? `до ${conditionPct(r.condition)}% = ${suggested.toLocaleString("ru-RU")} баллов` : undefined} />
        <Stat label="Предложение" value={r.offerPoints != null ? `${r.offerPoints.toLocaleString("ru-RU")} б.` : "—"} hint={r.offerPoints != null && purchasePrice ? `${Math.round((r.offerPoints * loyalty.pointValueKopecks * 100) / purchasePrice)}% от цены` : undefined} />
        <Stat label="Витрина" value={listed ? formatMoney(listed.price) : "—"} hint={listed ? <Link href={`/product/${listed.slug}`} target="_blank" className="underline">{listed.name}</Link> : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="card p-5 text-sm">
            <Eyebrow>Клиентка</Eyebrow>
            <div className="mt-2">
              <Link href={`/crm/customers/${r.user.id}`} className="underline">{r.user.firstName} {r.user.lastName}</Link> · {r.user.loyaltyTier?.name ?? "—"} · {r.user.pointsBalance.toLocaleString("ru-RU")} баллов
            </div>
            <div className="text-xs text-muted">{r.user.email} · {r.user.phone ?? "без телефона"}</div>
          </div>
          <div className="card p-5 text-sm">
            <Eyebrow>Вещь</Eyebrow>
            <div className="mt-2">
              {r.orderItem ? (
                <>
                  <Link href={`/product/${r.orderItem.variant.product.slug}`} target="_blank" className="underline">{r.orderItem.productName}</Link>
                  {" · "}{r.orderItem.size}{r.orderItem.color ? `, ${r.orderItem.color}` : ""} · {r.orderItem.sku}
                  {r.orderItem.variant.product.price !== purchasePrice && <span className="text-muted"> · сейчас в каталоге {formatMoney(r.orderItem.variant.product.price)}</span>}
                </>
              ) : r.product ? (
                <Link href={`/product/${r.product.slug}`} target="_blank" className="underline">{r.product.name}</Link>
              ) : "—"}
            </div>
            <Eyebrow className="mt-5">Описание клиентки</Eyebrow>
            <p className="mt-2 whitespace-pre-wrap">{r.description}</p>
            {r.photos.length > 0 && (
              <>
                <Eyebrow className="mt-5">Фото</Eyebrow>
                <ul className="mt-2 space-y-1 text-xs">{r.photos.map((p) => <li key={p}><a href={p} target="_blank" className="underline">{p}</a></li>)}</ul>
              </>
            )}
            {r.managerNote && (
              <>
                <Eyebrow className="mt-5">Комментарий менеджера</Eyebrow>
                <p className="mt-2 text-muted">{r.managerNote}</p>
              </>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          {(r.status === "REQUESTED" || r.status === "OFFERED") && (
            <div className="card p-5">
              <Eyebrow className="mb-3">Предложить баллы</Eyebrow>
              <OfferForm id={r.id} suggested={suggested} maxByCondition={maxByCondition} current={r.offerPoints} note={r.managerNote} />
            </div>
          )}
          {r.status === "ACCEPTED" && (
            <div className="card p-5">
              <Eyebrow className="mb-3">Вещь получена</Eyebrow>
              <p className="mb-3 text-xs text-muted">Клиентка приняла предложение. После проверки вещи начислите {r.offerPoints?.toLocaleString("ru-RU")} баллов — это сделает кнопка ниже.</p>
              <form action={receiveResaleAction}>
                <input type="hidden" name="id" value={r.id} />
                <ConfirmButton className="btn-primary btn-sm" message={`Начислить ${r.offerPoints} баллов и отметить вещь полученной?`}>Вещь получена, начислить баллы</ConfirmButton>
              </form>
            </div>
          )}
          {r.status === "RECEIVED" && (
            <div className="card p-5">
              <Eyebrow className="mb-3">Выставить на витрину</Eyebrow>
              <p className="mb-3 text-xs text-muted">Создадим товар «{itemName} · pre-loved» с одним размером {r.orderItem?.size ?? ""} и остатком 1 шт.</p>
              <ListForm id={r.id} condition={r.condition} suggestedPrice={Math.round((purchasePrice * (conditionPct(r.condition) + 20)) / 100 / 100)} />
            </div>
          )}
          {r.status === "LISTED" && (
            <div className="card p-5">
              <Eyebrow className="mb-3">На витрине</Eyebrow>
              {listed && <p className="mb-3 text-xs text-muted">Остаток: {listed.variants.reduce((s, v) => s + v.stock - v.reserved, 0)} шт. · <Link href={`/crm/products/${listed.id}`} className="underline">карточка товара</Link></p>}
              <form action={soldResaleAction}>
                <input type="hidden" name="id" value={r.id} />
                <SubmitButton className="btn-outline btn-sm">Продана</SubmitButton>
              </form>
            </div>
          )}
          {["REQUESTED", "OFFERED", "ACCEPTED"].includes(r.status) && (
            <div className="card p-5">
              <Eyebrow className="mb-3">Отклонить</Eyebrow>
              <form action={declineResaleAction} className="space-y-2">
                <input type="hidden" name="id" value={r.id} />
                <input name="managerNote" className="input py-2" placeholder="Причина (увидит клиентка)" />
                <ConfirmButton className="btn-outline btn-sm text-danger" message="Отклонить заявку?">Отклонить</ConfirmButton>
              </form>
            </div>
          )}
          {["SOLD", "DECLINED", "CANCELLED"].includes(r.status) && <p className="text-xs text-muted">Заявка закрыта: {st.label.toLowerCase()}.</p>}
        </aside>
      </div>
    </div>
  );
}
