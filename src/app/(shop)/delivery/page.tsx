import type { Metadata } from "next";
import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { TextPage, Section } from "@/components/shop/page-shell";

export const metadata: Metadata = { title: "Доставка и возврат" };

export default async function Delivery() {
  const [d, seller] = await Promise.all([getSetting("delivery"), getSetting("seller")]);
  return (
    <TextPage eyebrow="Покупателям" title="Доставка и возврат" intro={`Бесплатная доставка от ${formatMoney(d.freeFrom)} и для участниц Circle уровней Maison и Privé.`}>
      <Section title="Курьер с примеркой">
        <p>Москва и Санкт-Петербург, 1–2 дня. Курьер привезёт заказ и подождёт до 20 минут, пока вы примерите. Можно заказать несколько размеров и оставить один. Стоимость {formatMoney(d.courier)}.</p>
      </Section>
      <Section title="По России">
        <p>СДЭК до пункта выдачи или курьером, 2–7 дней, {formatMoney(d.cdek)}. Boxberry до пункта выдачи, {formatMoney(d.boxberry)}. Яндекс Доставка по Москве в день заказа, {formatMoney(d.yandex)}. Трек-номер появится в <Link href="/account/orders" className="underline">кабинете</Link> после отправки.</p>
      </Section>
      {seller.showroom && (
        <Section title="Самовывоз">
          <p>Шоурум: {seller.showroom}{seller.hours ? `, ${seller.hours}` : ""}. Заказ ждёт три дня, примерка на месте.</p>
        </Section>
      )}
      <Section title="Возврат">
        <p>14 дней с момента получения, если сохранены ярлыки и товарный вид. Оформите возврат в <Link href="/account/orders" className="underline">кабинете</Link>: мы вызовем курьера или пришлём накладную. Деньги вернутся тем же способом в течение 10 дней. Для уровня Privé обратный забор бесплатный.</p>
        <p>Вещи, сшитые по предзаказу и с подгонкой, возврату по размеру не подлежат. Брак меняем или возвращаем деньги в любом случае.</p>
      </Section>
      <Section title="Оплата">
        <p>Банковская карта, СБП, рассрочка банка-партнёра, оплата при получении курьеру. Чек приходит на email. Баллами Circle можно оплатить до 30% заказа, подарочным сертификатом — любую часть.</p>
      </Section>
    </TextPage>
  );
}
