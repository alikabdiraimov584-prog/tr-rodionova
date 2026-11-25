import type { Metadata } from "next";
import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { TextPage, Section } from "@/components/shop/page-shell";
import { JsonLd, publicPhone, storeJsonLd } from "@/lib/seo";

export const metadata: Metadata = { title: "Контакты" };

export default async function Showroom() {
  const [brand, seller] = await Promise.all([getSetting("brand"), getSetting("seller")]);
  const phone = publicPhone(brand.phone);
  const store = storeJsonLd(brand, seller);
  return (
    <TextPage
      crumbs={[{ name: "Контакты", path: "/showroom" }]}
      title="Контакты"
      intro={seller.showroom ? undefined : "Сейчас заказы принимаются онлайн."}
    >
      {store && <JsonLd data={store} />}
      <div className="space-y-5">
        <ul className="space-y-1">
          {phone && <li>{phone}</li>}
          <li><a href={`mailto:${brand.email}`} className="underline">{brand.email}</a></li>
          {brand.telegram && <li><a href={brand.telegram} className="underline">Telegram</a></li>}
          <li><a href="https://www.instagram.com/t.rodionova_womenswear/" className="underline">Instagram</a></li>
        </ul>
        <div>
          <div className="eyebrow">Служба заботы</div>
          <p className="mt-2">{seller.hours}, ответ в течение 15 минут.</p>
          <Link href="/account/support" className="underline">Написать в кабинете</Link>
        </div>
        <Link href="/seller" className="text-xs text-muted underline">Информация о продавце</Link>
      </div>
      {seller.showroom && (
        <Section id="map" title="Как добраться">
          <p>{seller.showroom}. Часы работы: {seller.hours}.</p>
        </Section>
      )}
    </TextPage>
  );
}
