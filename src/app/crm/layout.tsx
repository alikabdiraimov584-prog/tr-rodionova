import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { CrmNav } from "@/components/crm/nav";
import { CrmMobileNav } from "@/components/crm/mobile-nav";
import { can, type Section } from "@/lib/permissions";
import { ROLE } from "@/lib/labels";
import { logoutAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: { default: "CRM", template: "%s — CRM T.Rodionova" }, robots: { index: false } };

export default async function CrmLayout({ children }: LayoutProps<"/crm">) {
  const user = await requireStaff();
  const [openChats, newOrders, openTasks, pendingReviews, lowStock] = await Promise.all([
    db.conversation.count({ where: { status: "OPEN", OR: [{ assigneeId: user.id }, { assigneeId: null }] } }),
    db.order.count({ where: { status: { in: ["NEW", "PAID"] } } }),
    db.crmTask.count({ where: { status: "OPEN", OR: [{ assigneeId: user.id }, { assigneeId: null }] } }),
    db.review.count({ where: { isPublic: false } }),
    db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId" WHERE p.status = 'ACTIVE' AND v.stock - v.reserved <= 1`.then((r) => Number(r[0]?.n ?? 0)),
  ]);
  const groups: { title: string; items: { href: string; label: string; badge?: number; section: Section }[] }[] = [
    { title: "Работа", items: [
      { href: "/crm", label: "Главная", section: "dashboard" },
      { href: "/crm/support", label: "Поддержка", badge: openChats, section: "support" },
      { href: "/crm/orders", label: "Заказы", badge: newOrders, section: "orders" },
      { href: "/crm/tasks", label: "Задачи", badge: openTasks, section: "tasks" },
    ] },
    { title: "Клиенты", items: [
      { href: "/crm/customers", label: "Клиенты", section: "customers" },
      { href: "/crm/campaigns", label: "Рассылки", section: "campaigns" },
      { href: "/crm/stylist", label: "Стилист", section: "stylist" },
      { href: "/crm/loyalty", label: "Circle", section: "loyalty" },
      { href: "/crm/reviews", label: "Отзывы", badge: pendingReviews, section: "reviews" },
      { href: "/crm/giftcards", label: "Сертификаты", section: "giftcards" },
    ] },
    { title: "Товар", items: [
      { href: "/crm/products", label: "Товары", section: "products" },
      { href: "/crm/stock", label: "Склад", badge: lowStock, section: "stock" },
      { href: "/crm/content", label: "Лукбук и журнал", section: "content" },
      { href: "/crm/promos", label: "Промокоды", section: "promos" },
    ] },
    { title: "Управление", items: [
      { href: "/crm/analytics", label: "Аналитика", section: "analytics" },
      { href: "/crm/finance", label: "Финансы", section: "finance" },
      { href: "/crm/staff", label: "Сотрудники", section: "staff" },
      { href: "/crm/integrations", label: "Интеграции", section: "integrations" },
      { href: "/crm/settings", label: "Настройки", section: "settings" },
      { href: "/crm/audit", label: "Журнал", section: "audit" },
    ] },
  ];
  const visible = groups.map((g) => ({ ...g, items: g.items.filter((i) => can(user.role, i.section)) })).filter((g) => g.items.length);
  // 2FA и смена пароля доступны любому сотруднику: отдельная группа без проверки раздела
  visible.push({ title: "Аккаунт", items: [{ href: "/crm/security", label: "Безопасность входа", section: "dashboard" }] });
  const initials = `${user.firstName[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase();
  return (
    <div className="crm flex min-h-screen flex-col bg-ivory text-ink">
      <header className="sticky top-0 z-30 flex h-13 items-center gap-3 bg-[#1a1c1f] px-4 text-white md:gap-4">
        <CrmMobileNav groups={visible} />
        <Link href="/crm" className="text-[0.95rem] font-bold tracking-tight">T.Rodionova <span className="font-normal text-white/60">CRM</span></Link>
        <form action="/crm/customers" className="mx-auto hidden w-full max-w-xl md:block">
          <input name="q" placeholder="Поиск по клиентам, заказам, товарам…" className="w-full rounded-lg border-0 bg-[#2b2e33] px-3 py-1.5 text-sm text-white placeholder:text-white/50 outline-none focus:bg-[#34373d]" />
        </form>
        <details className="relative ml-auto">
          <summary className="-mr-2 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm hover:bg-white/10">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#3f6b2a] text-[0.7rem] font-bold">{initials}</span>
            <span className="hidden sm:inline">{user.firstName}</span>
          </summary>
          <div className="absolute right-0 mt-1 w-56 rounded-xl bg-white p-2 text-sm text-ink shadow-lg">
            <div className="px-3 py-2"><div className="font-semibold">{user.firstName} {user.lastName}</div><div className="text-xs text-muted">{ROLE[user.role]}</div></div>
            <Link href="/crm/security" className="block rounded-lg px-3 py-2.5 hover:bg-sand">Безопасность входа</Link>
            <Link href="/" className="block rounded-lg px-3 py-2.5 hover:bg-sand">Открыть сайт</Link>
            <form action={logoutAction}><button className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-sand">Выйти</button></form>
          </div>
        </details>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 p-3 lg:block">
          <CrmNav groups={visible} />
        </aside>
        <div className="min-w-0 flex-1">
          <main className="mx-auto max-w-[1400px] px-4 py-5 md:px-7 md:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
