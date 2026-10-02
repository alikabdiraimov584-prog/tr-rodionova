import type { Metadata } from "next";
import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { TextPage, Section } from "@/components/shop/page-shell";

export const metadata: Metadata = { title: "Шоурум и контакты" };

export default async function Showroom() {
  const b = await getSetting("brand");
  return (
    <TextPage eyebrow="Шоурум" title="Москва, Большая Никитская 14" intro="Ежедневно 11:00–21:00. Вся коллекция в наличии, примерочные с дневным светом, стилист по записи." aside={
      <div className="border border-line bg-white p-5">
        <div className="eyebrow">Связь</div>
        <p className="mt-2">{b.phone}<br />{b.email}<br /><a href={b.telegram} className="underline">Telegram</a></p>
        <div className="eyebrow mt-5">Служба заботы</div>
        <p className="mt-2">Ежедневно 10:00–21:00, ответ в течение 15 минут. <Link href="/account/support" className="underline">Написать в кабинете</Link></p>
      </div>
    }>
      <div className="aspect-[16/9] border border-line bg-sand" aria-label="Карта: Большая Никитская 14" />
      <Section title="Как добраться">
        <p>Метро «Арбатская» или «Библиотека имени Ленина», 6 минут пешком по Большой Никитской. Вход со стороны улицы, второй этаж. Парковка на Романовом переулке.</p>
      </Section>
      <Section title="Запись к стилисту">
        <p>Час с персональным стилистом: подбор капсулы под ваш гардероб и события сезона. Бесплатно для участниц Circle. <Link href="/account/support?topic=stylist" className="underline">Записаться</Link>.</p>
      </Section>
      <Section title="Примерка дома">
        <p>Для Москвы и Петербурга привезём до 8 вещей на примерку с курьером или стилистом. Оплачиваете только то, что оставили.</p>
      </Section>
    </TextPage>
  );
}
