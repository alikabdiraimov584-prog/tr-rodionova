import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { siteFaq } from "@/lib/faq";
import { formatMoney } from "@/lib/money";
import { absolute, siteUrl } from "@/lib/seo";
import { BRAND_FACTS } from "@/lib/brand-facts";

/**
 * llms.txt (llmstxt.org): сжатое описание сайта для ИИ-систем — что это за бренд, где главные страницы, какие вещи
 * и статьи есть. llms-full.txt — то же плюс полные тексты: факты о бренде, ответы на вопросы, описания вещей, статьи.
 * Строится на запрос из базы, поэтому всегда совпадает с сайтом.
 */
const FACTS = BRAND_FACTS;

async function data() {
  const now = new Date();
  const [brand, seller, delivery, loyalty, products, articles, looks, tiers, faq] = await Promise.all([
    getSetting("brand"),
    getSetting("seller"),
    getSetting("delivery"),
    getSetting("loyalty"),
    db.product.findMany({ where: { status: "ACTIVE", isPreloved: false }, orderBy: { createdAt: "desc" }, include: { category: true, variants: true } }),
    db.article.findMany({ where: { publishedAt: { not: null, lte: now } }, orderBy: { publishedAt: "desc" } }),
    db.look.findMany({ where: { isPublished: true }, orderBy: { order: "asc" } }),
    db.loyaltyTier.findMany({ orderBy: { threshold: "asc" } }),
    siteFaq(),
  ]);
  return { brand, seller, delivery, loyalty, products, articles, looks, tiers, faq };
}

const line = (t: string) => t.replace(/\s+/g, " ").trim();

export async function llmsText(full: boolean) {
  const { brand, seller, delivery, loyalty, products, articles, looks, tiers, faq } = await data();
  const base = siteUrl();
  const out: string[] = [];
  out.push(`# ${brand.name}`);
  out.push("");
  out.push(`> ${line(brand.description || brand.tagline)} Год основания: ${brand.foundedYear || "2019"}${brand.founder ? `; основательница и дизайнер: ${brand.founder}` : ""}; город: ${brand.city || "Москва"}. Сайт: ${base}.`);
  out.push("");
  out.push("Коротко о бренде:");
  for (const f of FACTS) out.push(`- ${f}`);
  out.push(`- Доставка бесплатна от ${formatMoney(delivery.freeFrom)}; курьер с примеркой в Москве и Санкт-Петербурге ${formatMoney(delivery.courier)}, СДЭК по России ${formatMoney(delivery.cdek)}. Возврат 14 дней.`);
  out.push(`- Программа Circle: ${loyalty.welcomePoints.toLocaleString("ru-RU")} баллов за регистрацию, 1 балл = 1 ₽; уровни ${tiers.map((t) => `${t.name} ${t.cashbackPct}%`).join(", ")}.`);
  if (seller.showroom) out.push(`- Шоурум: ${seller.showroom}${seller.hours ? `, ${seller.hours}` : ""}.`);
  out.push(`- Связь: ${brand.email}, ${brand.phone}${brand.telegram ? `, ${brand.telegram}` : ""}.`);
  out.push("");
  out.push("## Главные страницы");
  out.push(`- [Каталог](${absolute("/catalog")}): все вещи текущей коллекции с ценами, составом и размерами`);
  out.push(`- [О бренде](${absolute("/about")}): история, принципы, ткани и производство`);
  out.push(`- [Вопросы и ответы](${absolute("/faq")}): доставка, примерка, возврат, размеры, уход, Circle`);
  out.push(`- [Доставка и возврат](${absolute("/delivery")}): сроки, стоимость, условия возврата`);
  out.push(`- [Размеры и мерки](${absolute("/sizes")}): таблицы размеров и как снять мерки`);
  out.push(`- [Уход за изделиями](${absolute("/care")}): шерсть, кашемир, шёлк`);
  out.push(`- [Программа Circle](${absolute("/circle")}): баллы и уровни`);
  out.push(`- [Журнал](${absolute("/journal")}): статьи о тканях, уходе, размерах и образах`);
  out.push(`- [Лукбук](${absolute("/lookbook")}): готовые образы`);
  out.push(`- [Шоурум и контакты](${absolute("/showroom")})`);
  out.push(`- [Пресс-кит](${absolute("/press")}): проверяемые факты о бренде, основательница, фото, контакт для СМИ`);
  out.push(`- [Публичная оферта](${absolute("/offer")}), [Политика обработки персональных данных](${absolute("/privacy")})`);
  out.push("");
  out.push("## Вещи");
  for (const p of products) {
    const sizes = [...new Set(p.variants.map((v) => v.size))].join("/");
    out.push(`- [${p.name}](${absolute(`/product/${p.slug}`)}): ${formatMoney(p.price)}${p.composition ? `, ${p.composition}` : ""}${sizes ? `, размеры ${sizes}` : ""}${p.category ? `, ${p.category.name.toLowerCase()}` : ""}`);
  }
  out.push("");
  out.push("## Статьи журнала");
  for (const a of articles) out.push(`- [${a.title}](${absolute(`/journal/${a.slug}`)})${a.excerpt ? `: ${line(a.excerpt)}` : ""}`);
  if (looks.length) {
    out.push("");
    out.push("## Образы");
    for (const l of looks) out.push(`- [${l.title}](${absolute(`/lookbook/${l.slug}`)})${l.description ? `: ${line(l.description)}` : ""}`);
  }
  out.push("");
  out.push("## Машиночитаемые данные");
  out.push(`- [Карта сайта](${absolute("/sitemap.xml")}), [RSS журнала](${absolute("/journal/feed.xml")}), [товарный фид YML](${absolute("/yml.xml")})`);
  if (!full) {
    out.push(`- [Полная версия для ИИ](${absolute("/llms-full.txt")}): факты, ответы на вопросы, описания вещей и тексты статей`);
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
  out.push("## Статьи");
  for (const a of articles) {
    out.push(`### ${a.title}`);
    out.push(`Опубликовано ${a.publishedAt?.toISOString().slice(0, 10)}. ${absolute(`/journal/${a.slug}`)}`);
    out.push("");
    out.push(a.body.trim());
    out.push("");
  }
  return out.join("\n") + "\n";
}
