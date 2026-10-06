import type { Metadata } from "next";
import Link from "next/link";
import { getSettingOrDefault } from "@/lib/settings";
import { TextPage, Section } from "@/components/shop/page-shell";
import { publicPhone } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Информация о продавце",
  description: "Реквизиты продавца T.Rodionova: наименование, ОГРНИП, ИНН, адрес, контакты и адрес для претензий.",
};

/**
 * Сведения о продавце по ст. 26.1 Закона «О защите прав потребителей» и Правилам продажи товаров дистанционным
 * способом: единственное место на сайте, где реквизиты показаны целиком (в подвале только ссылка сюда).
 * Данные берутся из CRM → Настройки → Реквизиты продавца.
 */
export default async function SellerPage() {
  const [seller, brand] = await Promise.all([getSettingOrDefault("seller"), getSettingOrDefault("brand")]);
  const phone = publicPhone(brand.phone);
  const rows: [string, string | undefined][] = [
    ["Продавец", seller.name],
    ["ОГРНИП", seller.ogrn],
    ["ИНН", seller.inn],
    ["Адрес", seller.address],
    ["Адрес для претензий и возвратов", seller.claimsAddress || seller.address],
    ["Электронная почта", brand.email],
    ["Телефон", phone],
    ["Часы работы службы заботы", seller.hours],
    ["Шоурум", seller.showroom || undefined],
  ];
  return (
    <TextPage crumbs={[{ name: "Информация о продавце", path: "/seller" }]} eyebrow="Документы" title="Информация о продавце" intro="Сведения о продавце, обязательные при дистанционной продаже товаров.">
      <Section id="requisites" title="Реквизиты">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[max-content_1fr]">
          {rows.filter(([, v]) => !!v).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words">{k === "Электронная почта" ? <a href={`mailto:${v}`} className="underline">{v}</a> : v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section id="documents" title="Документы">
        <p>
          Условия продажи: <Link href="/offer" className="underline">публичная оферта</Link>. Обработка персональных данных: <Link href="/privacy" className="underline">политика конфиденциальности</Link>. Условия доставки и возврата: <Link href="/delivery" className="underline">доставка и возврат</Link>.
        </p>
      </Section>
    </TextPage>
  );
}
