import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { BRAND_FACTS } from "@/lib/brand-facts";
import { TextPage, Section } from "@/components/shop/page-shell";
import { JsonLd, absolute, ids } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Пресс-кит",
  description: "Факты о бренде T.Rodionova для журналистов, блогеров и партнёров: основание, основательница, ткани, производство, тираж, цены, сервис; фото вещей и контакт для СМИ.",
};

/**
 * Пресс-кит: проверяемые факты одной таблицей, те же формулировки, что в «О бренде» и llms.txt.
 * Цитаты основательницы здесь не публикуются: их даёт только она сама в ответ на запрос.
 */
export default async function PressPage() {
  const [brand, seller, delivery, products] = await Promise.all([
    getSetting("brand"),
    getSetting("seller"),
    getSetting("delivery"),
    db.product.findMany({ where: { status: "ACTIVE", isPreloved: false }, orderBy: { createdAt: "desc" }, include: { images: { orderBy: { order: "asc" }, take: 1 }, category: true } }),
  ]);
  const rows: [string, string][] = [
    ["Название", `${brand.name} (латиницей, с точкой, без пробела); по-русски — Т.Родионова`],
    ["Основана", `${brand.foundedYear || "2019"} год, ${brand.city || "Москва"}`],
    ["Основательница и дизайнер", brand.founder || "Татьяна Родионова"],
    ["Что делает", brand.description || "Премиальная женская одежда из натуральных волокон"],
    ["Ткани", "Костюмная шерсть и пальтовые ткани из Бьеллы (Италия), кашемир из Монголии, шёлк из Комо, хлопковый поплин из Швейцарии"],
    ["Производство", "Пошив в Португалии и Литве; контроль качества в Москве, каждая вещь проверяется вручную"],
    ["Тираж", "До 60 единиц на модель; допошив только под предзаказ"],
    ["Цены", `Фиксированы на сезон, распродаж нет. Текущая коллекция: ${products.length ? `от ${formatMoney(Math.min(...products.map((p) => p.price)))} до ${formatMoney(Math.max(...products.map((p) => p.price)))}` : "см. каталог"}`],
    ["Сервис", `Примерка курьером в Москве и Санкт-Петербурге, доставка по России; бесплатная доставка от ${formatMoney(delivery.freeFrom)}; возврат 14 дней; программа Circle; выкуп своих вещей обратно и витрина pre-loved`],
    ...(seller.showroom ? [["Шоурум", `${seller.showroom}${seller.hours ? `, ${seller.hours}` : ""}`] as [string, string]] : []),
    ["Продавец", `${seller.name}${seller.inn ? `, ИНН ${seller.inn}` : ""}`],
    ["Сайт", absolute("/")],
  ];
  const boilerplate = `${brand.name} — ${(brand.description || "премиальная женская одежда из натуральных волокон").replace(/\.$/, "")}. Марка основана в ${brand.foundedYear || "2019"} году${brand.founder ? ` дизайнером ${brand.founder}` : ""}; ${brand.city || "Москва"}. Продаёт напрямую: сайт ${absolute("/").replace(/^https?:\/\//, "").replace(/\/$/, "")}, примерка курьером в Москве и Санкт-Петербурге${seller.showroom ? `, шоурум по адресу ${seller.showroom}` : ""}.`;
  // «Издание, дата — https://…» по строке; строка без ссылки показывается как есть
  const press = brand.pressLinks.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)\s*[—–-]\s*(https?:\/\/\S+)$/); return m ? { title: m[1] || m[2], url: m[2] } : { title: l, url: "" }; });
  return (
    <TextPage eyebrow="Для прессы" title="Пресс-кит" intro="Факты, формулировки и фото для журналистов, блогеров и партнёров. Всё на этой странице можно цитировать со ссылкой на tr-rodionova.ru; данные обновляются вместе с сайтом." crumbs={[{ name: "Пресс-кит", path: "/press" }]}>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", "@id": absolute("/press"), name: `Пресс-кит ${brand.name}`, url: absolute("/press"), inLanguage: "ru-RU", isPartOf: { "@id": ids().website }, about: { "@id": ids().organization }, dateModified: new Date().toISOString().slice(0, 10) }} />
      <Section id="boilerplate" title="Абзац о бренде">
        <p>{boilerplate}</p>
        <p className="text-xs text-muted">Этот абзац можно копировать целиком в справки, подписи к публикациям и карточки площадок; формулировки совпадают с сайтом и машиночитаемыми данными.</p>
      </Section>
      <Section id="facts" title="Факты">
        <dl className="divide-y divide-line border-y border-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[190px_1fr] sm:gap-3"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
        <p className="text-xs text-muted">Данные на {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}.</p>
      </Section>
      <Section id="quotes" title="Что можно цитировать">
        <ul className="list-disc space-y-1.5 pl-5">
          {BRAND_FACTS.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <p>Прямые цитаты основательницы, комментарии для материалов и ответы на вопросы — по запросу на почту ниже; готовые цитаты мы не раздаём.</p>
      </Section>
      <Section id="founder" title="Основательница">
        <p>{brand.founder || "Татьяна Родионова"} начинала как дизайнер в ателье индивидуального пошива; марка появилась в {brand.foundedYear || "2019"} году. Подробнее — <Link href="/about#founder" className="underline">на странице о бренде</Link>.</p>
      </Section>
      {products.length > 0 && (
        <Section id="products" title="Вещи и фото">
          <p>Текущая коллекция. По ссылке на вещь — все ракурсы, состав, уход и размеры; «фото» ведёт на файл в исходном разрешении. При публикации укажите {brand.name}.</p>
          <ul className="divide-y divide-line border-y border-line">
            {products.map((p) => (
              <li key={p.id} className="grid gap-1 py-2.5 sm:grid-cols-[1fr_auto] sm:gap-4">
                <span><Link href={`/product/${p.slug}`} className="underline underline-offset-4">{p.name}</Link>{p.category ? ` · ${p.category.name.toLowerCase()}` : ""}{p.composition ? ` · ${p.composition}` : ""}</span>
                <span className="text-muted">{formatMoney(p.price)}{p.images[0] && <> · <a href={p.images[0].url} className="underline underline-offset-4" target="_blank" rel="noopener">фото</a></>}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {press.length > 0 && (
        <Section id="publications" title="Публикации о бренде">
          <ul className="list-disc space-y-1.5 pl-5">
            {press.map((p) => <li key={p.title + p.url}>{p.url ? <a href={p.url} className="underline underline-offset-4" target="_blank" rel="noopener">{p.title}</a> : p.title}</li>)}
          </ul>
        </Section>
      )}
      <Section id="contact" title="Контакт для СМИ">
        <p>Запросы на интервью, комментарии и вещи для съёмок: <a href={`mailto:${brand.email}`} className="underline">{brand.email}</a>, {brand.phone}{brand.telegram ? <>, <a href={brand.telegram} className="underline">Telegram</a></> : null}. Отвечаем {seller.hours || "в рабочие часы"}.</p>
        <p>Логотип: <a href="/logo.png" className="underline">PNG 512×512</a>. Для машинного чтения: <a href="/llms.txt" className="underline">llms.txt</a>.</p>
      </Section>
    </TextPage>
  );
}
