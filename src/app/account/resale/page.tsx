import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, formatPoints } from "@/lib/money";
import { RESALE_STATUS } from "@/lib/labels";
import { RESALE_ACTIVE, RESALE_CANCELLABLE, RESALE_CONDITIONS } from "@/lib/resale";
import { Badge, Eyebrow, PageTitle, Star } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/form";
import { ResaleRequestForm } from "@/components/account/resale-form";
import { acceptResaleOfferAction, cancelResaleAction } from "@/app/actions/resale";

export const metadata: Metadata = { title: "Выкуп вещей" };

export default async function ResalePage() {
  const user = await requireUser("/account/resale");
  const [items, requests] = await Promise.all([
    db.orderItem.findMany({
      where: { order: { userId: user.id, status: { in: ["DELIVERED", "COMPLETED"] } }, resales: { none: { status: { in: RESALE_ACTIVE } } } },
      include: { order: { select: { number: true, createdAt: true } } },
      orderBy: { order: { createdAt: "desc" } },
    }),
    db.resaleRequest.findMany({
      where: { userId: user.id },
      include: { orderItem: { select: { productName: true, size: true, color: true, price: true } }, product: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const candidates = items
    .filter((i) => i.returnedQty < i.quantity)
    .map((i) => ({ id: i.id, label: `${i.productName}, ${i.size}${i.color ? `, ${i.color}` : ""} · заказ №${i.order.number}`, priceLabel: formatMoney(i.price) }));

  return (
    <div className="space-y-12">
      <PageTitle eyebrow="Circle · Re-love" title="Выкуп вещей">
        Вещи T.Rodionova живут долго. Когда вы готовы с ними расстаться, бренд выкупит их за баллы Circle, а вещь найдёт новую хозяйку на витрине pre-loved.
      </PageTitle>

      <section className="grid gap-px border border-line bg-line sm:grid-cols-3">
        {[
          ["01", "Заявка", "Выберите вещь из ваших заказов, укажите состояние и опишите её. Менеджер оценит и предложит сумму баллами."],
          ["02", "Отправка", "Согласились с предложением — передайте вещь курьеру или принесите в шоурум. Доставка за наш счёт."],
          ["03", "Баллы", "После получения и проверки вещи баллы приходят на ваш счёт Circle, а вещь появляется на витрине pre-loved."],
        ].map(([n, t, d]) => (
          <div key={n} className="bg-ivory p-6">
            <div className="eyebrow">{n}</div>
            <h3 className="mt-2">{t}</h3>
            <p className="mt-2 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>

      <section className="card p-6">
        <Eyebrow>Сколько вернём</Eyebrow>
        <ul className="mt-3 space-y-2 text-sm">
          {RESALE_CONDITIONS.map((c) => (
            <li key={c.value} className="flex gap-2"><Star /> <span><span className="text-ink">{c.label}</span> — до {c.pct}% цены покупки баллами · <span className="text-muted">{c.hint}</span></span></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">1 балл = 1 ₽. Баллы начисляются после получения вещи и действуют как обычные баллы Circle. Принимаем вещи после химчистки, без запаха парфюма.</p>
      </section>

      <section>
        <h2 className="mb-4">Подать заявку</h2>
        <ResaleRequestForm items={candidates} />
      </section>

      <section>
        <h2 className="mb-4">Мои заявки</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">Заявок пока нет. <Link href="/preloved" className="underline">Посмотреть витрину pre-loved</Link></p>
        ) : (
          <div className="divide-y divide-line border-y border-line">
            {requests.map((r) => {
              const name = r.orderItem?.productName ?? r.product?.name ?? "Вещь";
              return (
                <div key={r.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div className="text-sm">
                    <div>{name}{r.orderItem && <span className="text-muted">, {r.orderItem.size}{r.orderItem.color ? `, ${r.orderItem.color}` : ""}</span>}</div>
                    <div className="mt-1 text-xs text-muted">
                      {formatDate(r.createdAt)} · {r.condition ?? "состояние не указано"}
                      {r.orderItem && ` · куплено за ${formatMoney(r.orderItem.price)}`}
                    </div>
                    {r.offerPoints != null && r.status !== "DECLINED" && r.status !== "CANCELLED" && (
                      <div className="mt-1 text-xs">Предложение бренда: <span className="text-ink">{formatPoints(r.offerPoints)}</span></div>
                    )}
                    {r.managerNote && (r.status === "OFFERED" || r.status === "DECLINED") && <div className="mt-1 text-xs text-muted">Комментарий менеджера: {r.managerNote}</div>}
                    {r.status === "ACCEPTED" && <div className="mt-1 text-xs text-muted">Передайте вещь курьеру (вызов оформит менеджер). Баллы придут после проверки.</div>}
                    {r.status === "LISTED" && <div className="mt-1 text-xs text-muted">Вещь на <Link href="/preloved" className="underline">витрине pre-loved</Link>.</div>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={RESALE_STATUS[r.status].tone}>{RESALE_STATUS[r.status].label}</Badge>
                    {r.status === "OFFERED" && (
                      <form action={acceptResaleOfferAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitButton className="btn-primary btn-sm">Принять</SubmitButton>
                      </form>
                    )}
                    {RESALE_CANCELLABLE.includes(r.status) && (
                      <form action={cancelResaleAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmButton message="Отменить заявку на выкуп?" className="text-[0.62rem] uppercase tracking-[0.18em] text-muted hover:text-danger">Отменить</ConfirmButton>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
