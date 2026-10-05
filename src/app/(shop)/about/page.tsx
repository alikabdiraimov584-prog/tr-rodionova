import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { TextPage, Section } from "@/components/shop/page-shell";
import { JsonLd, absolute, founderJsonLd, ids } from "@/lib/seo";
import { BRAND_FACTS } from "@/lib/brand-facts";

export const metadata: Metadata = {
  title: "О бренде",
  description: "T.Rodionova: премиальная женская одежда из натуральных волокон. Основана в 2019 году Татьяной Родионовой; ткани из Бьеллы, Комо и Монголии, пошив в Португалии и Литве, тираж до 60 единиц.",
};

export default async function About() {
  const brand = await getSetting("brand");
  const founder = founderJsonLd(brand);
  return (
    <TextPage
      eyebrow="О бренде"
      title="A woman who chooses more"
      intro={`${brand.name} — марка женской одежды из натуральных волокон. Мы шьём небольшими партиями в Европе и продаём напрямую: без универмагов, без сезонных распродаж, без вещей «на один раз».`}
      crumbs={[{ name: "О бренде", path: "/about" }]}
    >
      <JsonLd
        data={[
          { "@context": "https://schema.org", "@type": "AboutPage", "@id": absolute("/about"), name: `О бренде ${brand.name}`, url: absolute("/about"), inLanguage: "ru-RU", isPartOf: { "@id": ids().website }, about: { "@id": ids().organization }, mainEntity: { "@id": ids().organization } },
          ...(founder ? [{ "@context": "https://schema.org", "@type": "ProfilePage", "@id": absolute("/about#founder"), name: founder.name, url: absolute("/about#founder"), inLanguage: "ru-RU", isPartOf: { "@id": ids().website }, mainEntity: founder }] : []),
        ]}
      />
      <div className="relative aspect-[16/9] bg-sand"><Image src="/images/placeholder/hero.svg" alt="" fill unoptimized className="object-cover" /></div>
      <Section id="founder" title="Основательница">
        <p>{brand.founder || "Татьяна Родионова"} начинала как дизайнер в ателье индивидуального пошива. Десять лет работы с клиентками научили главному: женщине нужна не мода, а вещь, которая сидит и служит. Так в {brand.foundedYear || "2019"} году появилась марка с коротким списком правил.</p>
        <p className="text-muted-dark">Основательница и дизайнер {brand.name}; автор статей журнала о тканях, уходе и посадке.</p>
      </Section>
      <Section id="facts" title="Коротко">
        <ul className="list-disc space-y-1.5 pl-5">
          {BRAND_FACTS.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </Section>
      <Section id="rules" title="Правила">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Только натуральные волокна: шерсть, кашемир, шёлк, хлопок. Синтетика допускается до 2% и только для эластичности.</li>
          <li>Две примерки на живой модели до запуска в пошив. Ни одна модель не уходит в производство по эскизу.</li>
          <li>Тираж до 60 единиц на модель. Допошив только под предзаказ.</li>
          <li>Цена не меняется в течение сезона. Распродаж не бывает: вещь стоит столько, сколько стоит.</li>
        </ul>
      </Section>
      <Section id="fabrics" title="Ткани">
        <p>Костюмная шерсть и пальтовые ткани с фабрик Бьеллы (Италия), кашемир 12 gauge из Монголии, шёлк из Комо, хлопковый поплин из Швейцарии. Фабрику и состав мы указываем в паспорте каждой вещи.</p>
      </Section>
      <Section id="production" title="Производство">
        <p>Пошив в Португалии и Литве на фабриках, с которыми работаем с первого сезона. Контроль качества в Москве: каждая вещь проверяется вручную до того, как попадёт в упаковку.</p>
      </Section>
      <Section id="service" title="Сервис">
        <p>Примерка курьером в Москве и Петербурге, персональный стилист и подгонка в ателье для участниц Circle уровня Privé, выкуп своих вещей обратно за баллы и витрина pre-loved. <Link href="/circle" className="underline">О программе Circle</Link>. Для журналистов и партнёров — <Link href="/press" className="underline">пресс-кит</Link>.</p>
      </Section>
    </TextPage>
  );
}
