import type { Metadata } from "next";
import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { TextPage, Section } from "@/components/shop/page-shell";

export const metadata: Metadata = { title: "Доставка и возврат" };

export default async function Delivery() {
  const brand = await getSetting("brand");
  return (
    <TextPage eyebrow="Покупателям" title="Доставка и возврат" crumbs={[{ name: "Доставка и возврат", path: "/delivery" }]}>
      <Section id="russia" title="Доставка">
        <p>Отправляем заказы через СДЭК, Яндекс Доставку и Яндекс Экспресс.</p>
      </Section>
      <Section id="returns" title="Возврат">
        <p>Обратитесь в <Link href="/account/support?topic=return" className="underline">поддержку</Link>{brand.email && <> или напишите на <a className="underline" href={`mailto:${brand.email}`}>{brand.email}</a></>} в течение 14 дней с момента получения. Сохраните ярлыки и товарный вид вещи. Укажите номер заказа и вещь, которую хотите вернуть.</p>
      </Section>
    </TextPage>
  );
}
