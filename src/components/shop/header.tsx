import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { cabinetLink } from "@/lib/role-links";
import { getGuestToken, guestCartCount } from "@/lib/guest-cart";
import { getSettingOrDefault } from "@/lib/settings";
import { db } from "@/lib/db";
import { Logo } from "@/components/ui";
import { SiteMenu } from "@/components/shop/mobile-menu";
import { IconBag, IconHeart, IconSearch, IconUser } from "@/components/shop/icons";

/**
 * Шапка витрины по образцу ACTE: слева «Меню» (всё навигационное — в выезжающей панели) и «Новинки»,
 * по центру логотип, справа поиск, избранное, аккаунт и корзина. Никаких лент категорий и объявлений.
 */
export async function ShopHeader() {
  const user = await getCurrentUser();
  const cabinet = cabinetLink(user);
  const [cartCount, categories] = await Promise.all([
    user ? db.cartItem.aggregate({ where: { userId: user.id }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0) : getGuestToken().then(guestCartCount),
    shopCategories(),
  ]);
  const count = cartCount || 0;
  const icon = "flex h-11 w-11 items-center justify-center hover:opacity-60 transition-opacity";
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ivory">
      <div className="mx-auto grid h-14 max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center px-2 md:h-16 md:px-5">
        <div className="flex items-center gap-1 md:gap-6">
          <SiteMenu categories={categories.map((c) => [`/catalog?category=${c.slug}`, c.name] as const)} account={cabinet} cartCount={count} />
          <Link href="/catalog?new=1" className="nav-link hidden md:inline">Новинки</Link>
          <Link href="/catalog" className="nav-link hidden lg:inline">Каталог</Link>
        </div>
        <Logo className="px-2 py-3" />
        <nav aria-label="Покупки" className="flex items-center justify-end">
          <Link href="/catalog?q=" aria-label="Поиск" className={icon}><IconSearch /></Link>
          <Link href="/account/wishlist" aria-label="Избранное" className={`${icon} hidden sm:flex`}><IconHeart /></Link>
          <Link href={cabinet[0]} aria-label={cabinet[1]} className={`${icon} hidden sm:flex`}><IconUser /></Link>
          <Link href="/cart" aria-label={`Корзина, товаров: ${count}`} className={`${icon} relative`}>
            <IconBag />
            {count > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[0.6rem] leading-none text-ivory">{count}</span>}
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Категории, в которых есть вещи в продаже: для меню и колонки «Каталог» в подвале. */
function shopCategories() {
  return db.category.findMany({ orderBy: { order: "asc" }, where: { products: { some: { status: "ACTIVE" } } }, select: { slug: true, name: true } });
}

/**
 * Подвал: короткие списки ссылок, на телефоне — раскрывающиеся. Ссылки на категории здесь обычные серверные,
 * поэтому поисковики находят каталог с любой страницы (панель меню рисуется только после нажатия).
 * Реквизиты продавца обязательны по закону.
 */
export async function ShopFooter() {
  const [brand, seller, categories] = await Promise.all([getSettingOrDefault("brand"), getSettingOrDefault("seller"), shopCategories()]);
  const cols: [string, [string, string][]][] = [
    ["Каталог", [["/catalog?new=1", "Новинки"], ...categories.map((c) => [`/catalog?category=${c.slug}`, c.name] as [string, string]), ["/preloved", "Pre-loved"]]],
    ["Покупателям", [["/delivery", "Доставка и возврат"], ["/sizes", "Размеры"], ["/care", "Уход"], ["/faq", "Вопросы и ответы"], ["/gift", "Подарочные сертификаты"]]],
    ["Бренд", [["/about", "О бренде"], ["/collections", "Коллекции"], ["/lookbook", "Лукбук"], ["/journal", "Журнал"], ["/showroom", "Шоурум"], ["/press", "Для прессы"]]],
    ["Circle", [["/circle", "Программа лояльности"], ["/account", "Личный кабинет"], ["/account/stylist", "Персональный стилист"]]],
    ["Документы", [["/offer", "Оферта"], ["/privacy", "Политика конфиденциальности"], ["/privacy#consent", "Согласие на обработку данных"]]],
  ];
  const head = "text-[0.72rem] uppercase tracking-[0.12em]";
  const list = (links: [string, string][]) => (
    <ul className="space-y-0.5 pb-4 text-[0.82rem] md:pb-0">
      {links.map(([href, label]) => <li key={href}><Link href={href} className="inline-block py-1.5 text-muted hover:text-ink">{label}</Link></li>)}
    </ul>
  );
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-[1600px] gap-x-8 px-4 py-6 md:grid-cols-3 md:gap-y-10 md:px-5 md:py-12 xl:grid-cols-6">
        {cols.map(([title, links]) => (
          <div key={title} className="border-b border-line md:border-0">
            {/* компьютер и планшет: списки открыты всегда */}
            <div className="hidden md:block">
              <div className={`pb-3 ${head}`}>{title}</div>
              {list(links)}
            </div>
            {/* телефон: раскрываются по нажатию */}
            <details className="group md:hidden">
              <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between ${head}`}>
                {title}<span className="text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              {list(links)}
            </details>
          </div>
        ))}
        <div className="pt-6 text-[0.82rem] md:pt-0">
          <div className={`pb-3 ${head}`}>Связь</div>
          <p className="text-muted">
            <a href={`mailto:${brand.email}`} className="break-words hover:text-ink">{brand.email}</a><br />
            <span className="whitespace-nowrap">{brand.phone}</span><br />
            {seller.hours}
          </p>
          {seller.showroom && <p className="mt-3 text-muted">{seller.showroom}</p>}
        </div>
      </div>
      <div className="border-t border-line px-4 py-5 text-center text-[0.68rem] text-muted md:px-5">
        © {new Date().getFullYear()} {brand.name}
        {seller.name && <span className="mt-1 block">Продавец: {seller.name}{seller.inn && `, ИНН ${seller.inn}`}{seller.ogrn && `, ОГРНИП/ОГРН ${seller.ogrn}`}{seller.address && `, ${seller.address}`}</span>}
      </div>
    </footer>
  );
}
