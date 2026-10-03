import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageTitle } from "@/components/ui";
import { GiftForm } from "@/components/shop/gift-form";
import { GIFT_MIN_RUB, GIFT_PRESETS, GIFT_VALIDITY_MONTHS } from "@/lib/gift";

export const metadata: Metadata = { title: "Подарочный сертификат", description: "Электронный подарочный сертификат T.Rodionova на любую сумму от 5 000 ₽." };

export default async function GiftPage() {
  await requireUser("/gift");
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-8">
      <PageTitle eyebrow="Подарок" title="Подарочный сертификат">
        Электронный сертификат приходит на почту сразу после оплаты. Получатель выбирает вещь сама — в любое время в течение года.
      </PageTitle>
      <div className="grid gap-10 md:grid-cols-[1fr_320px]">
        <div className="card p-6 md:p-8">
          <GiftForm presets={GIFT_PRESETS} minRub={GIFT_MIN_RUB} validityMonths={GIFT_VALIDITY_MONTHS} />
        </div>
        <aside className="space-y-6 text-sm leading-relaxed text-ink/80">
          <div>
            <div className="eyebrow mb-2">Как это работает</div>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Выберите номинал и оплатите сертификат.</li>
              <li>Код появится в <Link href="/account/giftcards" className="underline">вашем кабинете</Link> — перешлите его получателю или отправьте письмо.</li>
              <li>Получатель вводит код при оформлении заказа — сумма списывается с сертификата, остаток сохраняется.</li>
            </ol>
          </div>
          <div>
            <div className="eyebrow mb-2">Условия</div>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Срок действия — {GIFT_VALIDITY_MONTHS} месяцев.</li>
              <li>Сертификат можно использовать частями.</li>
              <li>Суммируется с промокодами и баллами Circle.</li>
              <li>При отмене заказа сумма возвращается на сертификат.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
