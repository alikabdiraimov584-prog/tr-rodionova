import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSettingOrDefault } from "@/lib/settings";
import { db } from "@/lib/db";
import { Logo } from "@/components/ui";

const NAV = [
  ["/catalog", "Женщинам"],
  ["/collections", "Коллекции"],
  ["/lookbook", "Лукбук"],
  ["/journal", "Журнал"],
  ["/showroom", "Шоурум"],
] as const;

export async function ShopHeader() {
  const user = await getCurrentUser();
  const [cartCount, categories] = await Promise.all([
    user ? db.cartItem.aggregate({ where: { userId: user.id }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0) : 0,
    db.category.findMany({ orderBy: { order: "asc" }, where: { products: { some: { status: "ACTIVE" } } } }),
  ]);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ivory">
      <div className="bg-ink py-1.5 text-center text-[0.62rem] uppercase tracking-[0.14em] text-ivory">
        Бесплатная доставка от 15 000 ₽ · Примерка курьером в Москве и Петербурге · <Link href="/circle" className="underline underline-offset-2">Circle: 2 000 баллов за регистрацию</Link>
      </div>
      <div className="mx-auto grid max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3.5 md:px-6">
        <nav className="flex gap-5 text-[0.68rem] uppercase tracking-[0.1em]">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="hover:underline underline-offset-4">{label}</Link>
          ))}
        </nav>
        <Logo />
        <nav className="flex justify-end gap-5 text-[0.68rem] uppercase tracking-[0.1em]">
          <Link href="/catalog?q=" className="hidden sm:inline hover:underline underline-offset-4">Поиск</Link>
          <Link href={user ? "/account" : "/login"} className="hover:underline underline-offset-4">{user ? "Кабинет" : "Войти"}</Link>
          <Link href="/cart" className="hover:underline underline-offset-4">Корзина {cartCount || 0}</Link>
        </nav>
      </div>
      <div className="hidden border-t border-line md:block">
        <div className="mx-auto flex max-w-[1440px] gap-5 overflow-x-auto px-6 py-2.5 text-[0.68rem] uppercase tracking-[0.08em] text-muted">
          <Link href="/catalog?new=1" className="whitespace-nowrap hover:text-ink">Новое</Link>
          {categories.map((c) => (
            <Link key={c.id} href={`/catalog?category=${c.slug}`} className="whitespace-nowrap hover:text-ink">{c.name}</Link>
          ))}
          <Link href="/preloved" className="whitespace-nowrap hover:text-ink">Pre-loved</Link>
          <Link href="/gift" className="whitespace-nowrap hover:text-ink">Сертификаты</Link>
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
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-12 md:grid-cols-5 md:px-6">
        {cols.map(([title, links]) => (
          <div key={title} className="text-[0.72rem]">
            <div className="eyebrow mb-3">{title}</div>
            <ul className="space-y-1.5">
              {links.map(([href, label]) => <li key={href}><Link href={href} className="text-ink/80 hover:text-ink">{label}</Link></li>)}
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
