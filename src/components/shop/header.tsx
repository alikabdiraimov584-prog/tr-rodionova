import { publicPhone } from "@/lib/seo";
import Link from "next/link";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { cabinetLink } from "@/lib/role-links";
import { getGuestToken, guestCartCount } from "@/lib/guest-cart";
import { getSettingOrDefault } from "@/lib/settings";
import { db } from "@/lib/db";
import { Logo } from "@/components/ui";
import { BrandLockup } from "@/components/brand-marks";
import { SiteMenu } from "@/components/shop/mobile-menu";
import { IconBag, IconUser } from "@/components/shop/icons";

/**
 * Шапка витрины для маленькой коллекции: слева «Меню», «Коллекция» и «О бренде», по центру логотип,
 * справа кабинет и корзина. Без каталога, поиска и разделов.
 */
export async function ShopHeader() {
  const user = await getCurrentUser();
  const customer = user && !isStaff(user.role) ? user : null; // счётчик корзины: у сотрудника на витрине гостевая корзина
  const cabinet = cabinetLink(user);
  const cartCount = await (customer ? db.cartItem.aggregate({ where: { userId: customer.id }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0) : getGuestToken().then(guestCartCount));
  const count = cartCount || 0;
  const icon = "flex h-11 w-11 items-center justify-center transition-colors hover:opacity-60";
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ivory">
      <div className="mx-auto grid h-14 max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center px-2 md:h-16 md:px-5">
        <div className="flex items-center gap-1 md:gap-6">
          <SiteMenu account={cabinet} cartCount={count} />
          <Link href="/#collection" className="nav-link hidden md:inline">Коллекция</Link>
          <Link href="/about" className="nav-link hidden lg:inline">О бренде</Link>
        </div>
        <Logo className="px-2 py-3" />
        <nav aria-label="Покупки" className="flex items-center justify-end">
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

/** Подвал: логотип, несколько ссылок для покупательниц, контакты и документы. Реквизиты целиком — на странице «Информация о продавце». */
export async function ShopFooter() {
  const [brand, seller] = await Promise.all([getSettingOrDefault("brand"), getSettingOrDefault("seller")]);
  const links: [string, string][] = [
    ["/about", "О бренде"],
    ["/delivery", "Доставка и возврат"],
    ["/sizes", "Размеры"],
    ["/care", "Уход"],
    ["/faq", "Вопросы и ответы"],
    ["/journal", "Журнал"],
  ];
  const legal: [string, string][] = [
    ["/offer", "Оферта"],
    ["/privacy", "Политика конфиденциальности"],
    ["/seller", "Информация о продавце"],
  ];
  return (
    <footer className="mt-32 border-t border-line md:mt-48">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-8 px-4 py-14 text-center md:px-10 md:py-20">
        <BrandLockup className="h-auto w-[190px] text-ink md:w-[230px]" />
        <nav aria-label="Покупательницам" className="flex flex-wrap justify-center gap-x-7 gap-y-2 text-[0.9rem]">
          {links.map(([href, label]) => <Link key={href} href={href} className="py-1 text-muted transition-colors hover:text-ink">{label}</Link>)}
        </nav>
        <p className="text-[0.9rem] text-muted">
          <a href={`mailto:${brand.email}`} className="hover:text-ink">{brand.email}</a>
          {publicPhone(brand.phone) && <> · <span className="whitespace-nowrap">{publicPhone(brand.phone)}</span></>}
          {seller.hours && <> · {seller.hours}</>}
        </p>
        <nav aria-label="Документы" className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-[0.75rem] text-muted">
          {legal.map(([href, label]) => <Link key={href} href={href} className="hover:text-ink">{label}</Link>)}
          <span>© {new Date().getFullYear()} {brand.name}</span>
        </nav>
      </div>
    </footer>
  );
}
