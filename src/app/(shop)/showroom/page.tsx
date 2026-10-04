import type { Metadata } from "next";
import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { TextPage, Section } from "@/components/shop/page-shell";

export const metadata: Metadata = { title: "Шоурум и контакты" };

export default async function Showroom() {
  const [b, seller] = await Promise.all([getSetting("brand"), getSetting("seller")]);
  const hasShowroom = !!seller.showroom;
  return (
    <TextPage
      eyebrow="Шоурум"
      title={hasShowroom ? seller.showroom : "Примерка там, где удобно вам"}
      intro={hasShowroom ? `${seller.hours}. Вся коллекция в наличии, примерочные с дневным светом, стилист по записи.` : "Шоурум пока не открыт: мы продаём онлайн и привозим вещи на примерку курьером. Оплачиваете только то, что оставили."}
      aside={
        <div className="border border-line bg-white p-5">
          <div className="eyebrow">Связь</div>
          <p className="mt-2">{b.phone}<br />{b.email}<br /><a href={b.telegram} className="underline">Telegram</a></p>
          <div className="eyebrow mt-5">Служба заботы</div>
          <p className="mt-2">{seller.hours}, ответ в течение 15 минут. <Link href="/account/support" className="underline">Написать в кабинете</Link></p>
          <div className="eyebrow mt-5">Продавец</div>
          <p className="mt-2 text-xs text-muted">{seller.name}{seller.inn && `, ИНН ${seller.inn}`}{seller.ogrn && `, ОГРНИП ${seller.ogrn}`}<br />{seller.address}</p>
        </div>
      }
    >
      <Section title="Примерка дома">
        <p>Для Москвы и области привезём до 6 вещей на примерку с курьером: 15 минут на примерку, оплата на месте только за то, что подошло. Выбирается при оформлении заказа.</p>
      </Section>
      <Section title="Запись к стилисту">
        <p>Час с персональным стилистом онлайн: подбор капсулы под ваш гардероб и события сезона. Бесплатно для участниц Circle. <Link href="/account/support?topic=stylist" className="underline">Записаться</Link>.</p>
      </Section>
      {hasShowroom && (
        <Section title="Как добраться">
          <p>{seller.showroom}. Часы работы: {seller.hours}.</p>
        </Section>
      )}
    </TextPage>
  );
}
