import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { publicPhone } from "@/lib/seo";
import { loadChannel } from "@/lib/support/channel-config";

export type BrandIssue = { text: string; href: string; action: string };

/** Дешевле этой суммы вещь в продаже почти наверняка осталась после пробной оплаты (копейки). */
const SUSPICIOUS_PRICE = 10_000;

/**
 * Что на витрине выглядит недоделанным или опасно для продаж: цена после пробной оплаты, ошибка в адресе почты бренда,
 * телефон-заглушка, вещи без фото, выключенная почта для писем покупательницам. Показывается на главной CRM,
 * пока не исправлено, — проверки дешёвые, по данным самой базы.
 */
export async function brandIssues(): Promise<BrandIssue[]> {
  const [brand, seller, cheap, noPhotos, email] = await Promise.all([
    getSetting("brand"),
    getSetting("seller"),
    db.product.findMany({
      where: { status: "ACTIVE", OR: [{ price: { lt: SUSPICIOUS_PRICE } }, { variants: { some: { price: { lt: SUSPICIOUS_PRICE } } } }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({ where: { status: "ACTIVE", images: { none: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadChannel("EMAIL"),
  ]);
  const issues: BrandIssue[] = [];
  for (const p of cheap) {
    issues.push({ text: `«${p.name}» продаётся дешевле 100 ₽ — похоже, цена осталась после пробной оплаты`, href: `/crm/products/${p.id}`, action: "Исправить цену" });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(brand.email)) {
    issues.push({ text: `Почта бренда «${brand.email}» записана с ошибкой — клиентки и ИИ-поисковики видят её на сайте`, href: "/crm/settings", action: "Исправить почту" });
  }
  if (!publicPhone(brand.phone)) {
    issues.push({ text: "Телефон бренда не указан (стоит заглушка): на сайте, в оферте и письмах телефона нет", href: "/crm/settings", action: "Указать телефон" });
  }
  if (noPhotos.length) {
    issues.push({ text: `Без фото в продаже: ${noPhotos.slice(0, 6).map((p) => `«${p.name}»`).join(", ")}${noPhotos.length > 6 ? ` и ещё ${noPhotos.length - 6}` : ""}`, href: "/crm/products", action: "Открыть товары" });
  }
  if (!email?.enabled) {
    issues.push({ text: "Почта не подключена: покупательницы не получают писем о заказе, оплате, доставке и сертификатах", href: "/crm/settings/channels", action: "Подключить почту" });
  }
  if (!seller.rknNumber) {
    issues.push({ text: "В политике конфиденциальности нет номера в реестре операторов персональных данных Роскомнадзора", href: "/crm/settings", action: "Указать номер" });
  }
  return issues;
}
