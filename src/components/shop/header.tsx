import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { cabinetLink } from "@/lib/role-links";
import { getGuestToken, guestCartCount } from "@/lib/guest-cart";
import { getSettingOrDefault } from "@/lib/settings";
import { db } from "@/lib/db";
import { Logo } from "@/components/ui";
import { MobileMenu } from "@/components/shop/mobile-menu";

const NAV = [
  ["/catalog", "Женщинам"],
  ["/collections", "Коллекции"],
  ["/lookbook", "Лукбук"],
  ["/journal", "Журнал"],
  ["/showroom", "Шоурум"],
] as const;

export async function ShopHeader() {
  const user = await getCurrentUser();
  const cabinet = cabinetLink(user);
  const [cartCount, categories] = await Promise.all([
    user ? db.cartItem.aggregate({ where: { userId: user.id }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0) : getGuestToken().then(guestCartCount),
    db.category.findMany({ orderBy: { order: "asc" }, where: { products: { some: { status: "ACTIVE" } } } }),
  ]);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ivory">
      <div className="bg-ink px-3 py-1.5 text-center text-[0.62rem] uppercase tracking-[0.14em] text-ivory">
        Бесплатная доставка от 15 000 ₽ <span className="hidden sm:inline">· Примерка курьером в Москве и Петербурге </span>· <Link href="/circle" className="inline-block py-1 underline underline-offset-2">Circle: 2 000 баллов за регистрацию</Link>
      </div>
      <div className="mx-auto grid max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-1.5 md:grid-cols-[1fr_auto_1fr] md:gap-4 md:px-6 md:py-2">
        <MobileMenu nav={NAV} categories={categories.map((c) => [`/catalog?category=${c.slug}`, c.name] as const)} account={cabinet} cartCount={cartCount || 0} />
        <nav className="hidden gap-3 text-[0.68rem] uppercase tracking-[0.1em] md:flex lg:gap-5">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="py-2.5 hover:underline underline-offset-4">{label}</Link>
          ))}
        </nav>
        <div className="flex justify-center md:justify-start"><Logo className="py-3" /></div>
        <nav className="flex items-center justify-end gap-3 text-[0.68rem] uppercase tracking-[0.1em] lg:gap-5">
          <Link href="/catalog?q=" className="hidden py-2.5 lg:inline hover:underline underline-offset-4">Поиск</Link>
          <Link href={cabinet[0]} className="hidden py-2.5 sm:inline hover:underline underline-offset-4">{cabinet[1]}</Link>
          <Link href="/cart" className="-mr-2 inline-flex min-h-11 items-center px-2 whitespace-nowrap hover:underline underline-offset-4 md:mr-0 md:px-0">Корзина {cartCount || 0}</Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="scroll-row mx-auto flex max-w-[1440px] gap-5 overflow-x-auto px-4 py-1 text-[0.68rem] uppercase tracking-[0.08em] text-muted md:px-6">
          <Link href="/catalog?new=1" className="shrink-0 py-2 whitespace-nowrap hover:text-ink">Новое</Link>
          {categories.map((c) => (
            <Link key={c.id} href={`/catalog?category=${c.slug}`} className="shrink-0 py-2 whitespace-nowrap hover:text-ink">{c.name}</Link>
          ))}
          <Link href="/preloved" className="shrink-0 py-2 whitespace-nowrap hover:text-ink">Pre-loved</Link>
          <Link href="/gift" className="shrink-0 py-2 pr-4 whitespace-nowrap hover:text-ink">Сертификаты</Link>
        </div>
      </div>
    </header>
  );
}

export async function ShopFooter() {
  const [brand, seller] = await Promise.all([getSettingOrDefault("brand"), getSettingOrDefault("seller")]);
  const cols: [string, [string, string][]][] = [
    ["Покупателям", [["/delivery", "Доставка и возврат"], ["/sizes", "Размеры и мерки"], ["/care", "Уход за изделиями"], ["/gift", "Подарочные сертификаты"], ["/preloved", "Выкуп и pre-loved"]]],
    ["Бренд", [["/about", "О бренде"], ["/collections", "Коллекции"], ["/lookbook", "Лукбук"], ["/journal", "Журнал"], ["/showroom", "Шоурум и контакты"]]],
    ["Circle", [["/circle", "Программа лояльности"], ["/account", "Личный кабинет"], ["/account/stylist", "Персональный стилист"], ["/register", "Вступить"]]],
    ["Документы", [["/offer", "Публичная оферта"], ["/privacy", "Политика конфиденциальности"], ["/privacy#consent", "Согласие на обработку данных"]]],
  ];
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto grid grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:grid-cols-3 md:grid-cols-5 md:px-6 max-w-[1440px]">
        {cols.map(([title, links]) => (
          <div key={title} className="text-[0.72rem]">
            <div className="eyebrow mb-3">{title}</div>
            <ul className="space-y-1">
              {links.map(([href, label]) => <li key={href}><Link href={href} className="inline-block py-1 text-ink/80 hover:text-ink">{label}</Link></li>)}
            </ul>
          </div>
        ))}
        <div className="text-[0.72rem]">
          <div className="eyebrow mb-3">Связь</div>
          <p className="text-ink/80">{brand.email}<br />{brand.phone}<br />{seller.hours}</p>
          {seller.showroom && <p className="mt-3 text-ink/80">{seller.showroom}</p>}
        </div>
      </div>
      <div className="border-t border-line px-4 py-4 text-center text-[0.62rem] uppercase tracking-[0.14em] text-muted">
        © {new Date().getFullYear()} {brand.name} · Шерсть · Кашемир · Шёлк · Сшито в Европе
        {seller.name && (
          <div className="mt-2 normal-case tracking-normal">
            Продавец: {seller.name}{seller.inn && `, ИНН ${seller.inn}`}{seller.ogrn && `, ОГРНИП/ОГРН ${seller.ogrn}`}{seller.address && `, ${seller.address}`}
          </div>
        )}
      </div>
    </footer>
  );
}
