import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { siteFaq } from "@/lib/faq";
import { formatMoney } from "@/lib/money";
import { absolute, publicPhone, siteUrl } from "@/lib/seo";
import { BRAND_FACTS } from "@/lib/brand-facts";

/**
 * llms.txt (llmstxt.org): сжатое описание сайта для ИИ-систем — что это за бренд, где главные страницы, какие вещи есть. llms-full.txt — то же плюс полные тексты: факты о бренде, ответы на вопросы, описания вещей.
 * Строится на запрос из базы, поэтому всегда совпадает с сайтом.
 */
const FACTS = BRAND_FACTS;

async function data() {
  const [brand, seller, products, faq] = await Promise.all([
    getSetting("brand"),
    getSetting("seller"),
    db.product.findMany({ where: { status: "ACTIVE", isPreloved: false }, orderBy: { createdAt: "desc" }, include: { category: true, variants: { where: { archivedAt: null } } } }),
    siteFaq(),
  ]);
  return { brand, seller, products, faq };
}

const line = (t: string) => t.replace(/\s+/g, " ").trim();

export async function llmsText(full: boolean) {
  const { brand, seller, products, faq } = await data();
  const base = siteUrl();
  const out: string[] = [];
  out.push(`# ${brand.name}`);
  out.push("");
  out.push(`> ${line(brand.description || brand.tagline)} Год основания: ${brand.foundedYear || "2019"}${brand.founder ? `; основательница и дизайнер: ${brand.founder}` : ""}; город: ${brand.city || "Москва"}. Сайт: ${base}.`);
  out.push("");
  out.push("Коротко о бренде:");
  for (const f of FACTS) out.push(`- ${f}`);
  out.push(`- СДЭК, Яндекс Доставка и Яндекс Экспресс. Возврат через поддержку в течение 14 дней.`);
  if (seller.showroom) out.push(`- Шоурум: ${seller.showroom}${seller.hours ? `, ${seller.hours}` : ""}.`);
  out.push(`- Связь: ${[brand.email, publicPhone(brand.phone), brand.telegram].filter(Boolean).join(", ")}.`);
  out.push("");
  out.push("## Главные страницы");
  out.push(`- [Каталог](${absolute("/catalog")}): все вещи текущей коллекции с ценами, составом и размерами`);
  out.push(`- [О бренде](${absolute("/about")}): история, принципы, ткани и производство`);
  out.push(`- [Вопросы и ответы](${absolute("/faq")}): доставка, возврат, размеры, уход`);
  out.push(`- [Доставка и возврат](${absolute("/delivery")}): службы доставки и оформление возврата`);
  out.push(`- [Размеры и мерки](${absolute("/sizes")}): таблицы размеров и как снять мерки`);
  out.push(`- [Уход за изделиями](${absolute("/care")}): шерсть, кашемир, шёлк`);
  out.push(`- [Контакты](${absolute("/showroom")})`);
  out.push(`- [Пресс-кит](${absolute("/press")}): проверяемые факты о бренде, основательница, фото, контакт для СМИ`);
  out.push(`- [Публичная оферта](${absolute("/offer")}), [Политика обработки персональных данных](${absolute("/privacy")})`);
  out.push("");
  out.push("## Вещи");
  for (const p of products) {
    const sizes = [...new Set(p.variants.map((v) => v.size))].join("/");
    out.push(`- [${p.name}](${absolute(`/product/${p.slug}`)}): ${formatMoney(p.price)}${p.composition ? `, ${p.composition}` : ""}${sizes ? `, размеры ${sizes}` : ""}${p.category ? `, ${p.category.name.toLowerCase()}` : ""}`);
  }
  out.push("");
  out.push("## Машиночитаемые данные");
  out.push(`- [Карта сайта](${absolute("/sitemap.xml")}), [товарный фид YML](${absolute("/yml.xml")})`);
  if (!full) {
    out.push(`- [Полная версия для ИИ](${absolute("/llms-full.txt")}): факты, ответы на вопросы, описания вещей`);
    return out.join("\n") + "\n";
  }
  out.push("");
  out.push("# Полные тексты");
  out.push("");
  out.push("## Вопросы и ответы");
  for (const g of faq) {
    out.push(`### ${g.group}`);
    for (const f of g.items) out.push(`**${f.q}** ${f.a}`);
    out.push("");
  }
  out.push("## Описания вещей");
  for (const p of products) {
    out.push(`### ${p.name} (${p.sku})`);
    out.push(`Цена ${formatMoney(p.price)}. ${p.description ? line(p.description) : ""}`);
    if (p.composition) out.push(`Состав: ${p.composition}.`);
    if (p.madeIn) out.push(`Производство: ${p.madeIn}.`);
    if (p.care) out.push(`Уход: ${p.care}`);
    out.push(`Страница: ${absolute(`/product/${p.slug}`)}`);
    out.push("");
  }
  return out.join("\n") + "\n";
}
