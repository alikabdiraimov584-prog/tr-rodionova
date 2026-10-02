import Link from "next/link";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { Logo } from "@/components/ui";

export async function ShopHeader() {
  const user = await getCurrentUser();
  const [cartCount, wishCount] = user
    ? await Promise.all([
        db.cartItem.aggregate({ where: { userId: user.id }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0),
        db.wishlistItem.count({ where: { userId: user.id } }),
      ])
    : [0, 0];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ivory/95 backdrop-blur">
      <div className="bg-ink py-2 text-center text-[0.62rem] uppercase tracking-[0.3em] text-ivory/80">
        T.Rodionova Circle — 2 000 баллов за регистрацию
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-4 md:px-8">
        <nav className="flex gap-5 text-[0.68rem] uppercase tracking-[0.2em]">
          <Link href="/catalog" className="hover:text-taupe-dark">Каталог</Link>
          <Link href="/catalog?new=1" className="hidden hover:text-taupe-dark sm:inline">Новинки</Link>
          <Link href="/circle" className="hidden hover:text-taupe-dark md:inline">Circle</Link>
        </nav>
        <div className="text-center">
          <Logo className="text-[1.7rem] md:text-3xl" />
          <div className="mt-1 text-[0.52rem] uppercase tracking-[0.42em] text-muted">Premium womenswear</div>
        </div>
        <nav className="flex justify-end gap-5 text-[0.68rem] uppercase tracking-[0.2em]">
          {user && isStaff(user.role) && (
            <Link href="/crm" className="hidden text-taupe-dark hover:text-ink sm:inline">CRM</Link>
          )}
          <Link href={user ? "/account" : "/login"} className="hover:text-taupe-dark">
            {user ? user.firstName : "Войти"}
          </Link>
          {user && (
            <Link href="/account/wishlist" className="hidden hover:text-taupe-dark sm:inline">
              Избранное{wishCount ? ` · ${wishCount}` : ""}
            </Link>
          )}
          <Link href="/cart" className="hover:text-taupe-dark">
            Корзина{cartCount ? ` · ${cartCount}` : ""}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function ShopFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-sand/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-4 md:px-8">
        <div>
          <Logo />
          <div className="eyebrow mt-2">Premium womenswear</div>
          <p className="mt-6 max-w-xs text-sm text-muted">A woman who chooses more. Шерсть, кашемир и шёлк — вещи, которые остаются.</p>
        </div>
        <div className="text-sm">
          <div className="eyebrow mb-4">Покупателям</div>
          <ul className="space-y-2 text-muted">
            <li><Link href="/catalog">Каталог</Link></li>
            <li><Link href="/circle">Программа Circle</Link></li>
            <li><Link href="/account">Личный кабинет</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <div className="eyebrow mb-4">Сервис</div>
          <ul className="space-y-2 text-muted">
            <li>Доставка по России и примерка курьером</li>
            <li>Возврат в течение 14 дней</li>
            <li>Персональный стилист для Privé</li>
          </ul>
        </div>
        <div className="text-sm">
          <div className="eyebrow mb-4">Шоурум</div>
          <p className="text-muted">Москва, Большая Никитская 14<br />ежедневно 11:00–21:00<br />+7 (495) 000-00-00<br />care@t-rodionova.ru</p>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-[0.62rem] uppercase tracking-[0.3em] text-muted">© {new Date().getFullYear()} T.Rodionova · Made in Europe</div>
    </footer>
  );
}
