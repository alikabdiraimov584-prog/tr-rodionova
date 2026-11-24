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
  const cartCount = await (customer ? db.cartItem.aggregate({ where: { userId: customer.id, variant: { archivedAt: null } }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0) : getGuestToken().then(guestCartCount));
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
  const groups = [
    { title: "Бренд", links: [["/#collection", "Коллекция"], ["/about", "О бренде"], ["/journal", "Журнал"]] },
    { title: "Покупательницам", links: [["/delivery", "Доставка и возврат"], ["/sizes", "Размеры"], ["/care", "Уход"], ["/faq", "Вопросы и ответы"]] },
  ];
  const legal = [["/offer", "Оферта"], ["/privacy", "Политика конфиденциальности"], ["/seller", "Информация о продавце"]];
  const phone = publicPhone(brand.phone);
  const linkStyle = "inline-flex min-h-11 max-w-full items-center py-1 leading-snug hover:underline underline-offset-4 focus-visible:outline-2";
  const heading = "mb-3 text-xs font-semibold tracking-wide text-muted";
  return (
    <footer className="mt-16 border-t border-line bg-ivory text-ink sm:mt-24 lg:mt-32">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-x-8 gap-y-7 py-9 sm:grid-cols-3 sm:py-12 lg:grid-cols-[1.2fr_0.8fr_1fr_1.2fr] lg:py-16">
          <div className="border-b border-line pb-6 sm:col-span-3 lg:col-span-1 lg:border-0 lg:pb-0">
            <Link href="/" aria-label={`${brand.name} — на главную`} className="inline-flex min-h-11 max-w-full items-center">
              <BrandLockup className="h-auto w-44 max-w-full xl:w-56" />
            </Link>
          </div>
          {groups.map(({ title, links }) => (
            <nav key={title} aria-label={title} className="min-w-0">
              <h2 className={heading}>{title}</h2>
              <ul>{links.map(([href, label]) => <li key={href}><Link href={href} className={linkStyle}>{label}</Link></li>)}</ul>
            </nav>
          ))}
          <section aria-labelledby="footer-contact" className="min-w-0">
            <h2 id="footer-contact" className={heading}>Контакты</h2>
            {brand.email && <div><a href={`mailto:${brand.email}`} className={linkStyle}><span className="[overflow-wrap:anywhere]">{brand.email}</span></a></div>}
            {phone && <div><a href={`tel:${phone.replace(/[^+0-9]/g, "")}`} className={linkStyle}>{phone}</a></div>}
            {seller.hours && <p className="mt-2 text-sm leading-relaxed text-muted">{seller.hours}</p>}
          </section>
        </div>
        <div className="flex flex-col gap-3 border-t border-line py-5 text-sm text-muted lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Документы" className="flex flex-col items-start sm:flex-row sm:flex-wrap sm:gap-x-6">
            {legal.map(([href, label]) => <Link key={href} href={href} className={linkStyle}>{label}</Link>)}
          </nav>
          <p>© {new Date().getFullYear()} {brand.name}</p>
        </div>
      </div>
    </footer>
  );
}
