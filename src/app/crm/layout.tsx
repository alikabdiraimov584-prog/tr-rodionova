import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { CrmNav } from "@/components/crm/nav";
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
  const all: { href: string; label: string; badge?: number; section: Section }[] = [
    { href: "/crm", label: "Дашборд", section: "dashboard" },
    { href: "/crm/support", label: "Поддержка", badge: openChats, section: "support" },
    { href: "/crm/orders", label: "Заказы", badge: newOrders, section: "orders" },
    { href: "/crm/customers", label: "Клиенты", section: "customers" },
    { href: "/crm/tasks", label: "Задачи", badge: openTasks, section: "tasks" },
    { href: "/crm/products", label: "Товары", section: "products" },
    { href: "/crm/stock", label: "Склад", badge: lowStock, section: "stock" },
    { href: "/crm/loyalty", label: "Лояльность", section: "loyalty" },
    { href: "/crm/promos", label: "Промокоды", section: "promos" },
    { href: "/crm/reviews", label: "Отзывы", badge: pendingReviews, section: "reviews" },
    { href: "/crm/finance", label: "Финансы", section: "finance" },
    { href: "/crm/staff", label: "Сотрудники", section: "staff" },
    { href: "/crm/settings", label: "Настройки", section: "settings" },
    { href: "/crm/audit", label: "Журнал", section: "audit" },
  ];
  const items = all.filter((i) => can(user.role, i.section));
  return (
    <div className="flex min-h-screen bg-ivory">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between bg-ink p-5 text-ivory lg:flex">
        <div>
          <Link href="/crm" className="block px-3">
            <span className="serif text-2xl">T.Rodionova</span>
            <span className="mt-1 block text-[0.55rem] uppercase tracking-[0.4em] text-champagne">CRM · Склад · Circle</span>
          </Link>
          <div className="mt-8"><CrmNav items={items} /></div>
        </div>
        <div className="space-y-3 px-3 text-xs text-ivory/60">
          <div>
            <div className="text-ivory">{user.firstName} {user.lastName}</div>
            <div>{ROLE[user.role]}</div>
          </div>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-ivory">Сайт</Link>
            <form action={logoutAction}><button className="hover:text-ivory">Выйти</button></form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
          <Link href="/crm" className="serif text-xl">T.R CRM</Link>
          <details className="relative">
            <summary className="cursor-pointer list-none text-[0.68rem] uppercase tracking-[0.18em]">Меню</summary>
            <div className="absolute right-0 z-40 mt-2 w-56 bg-ink p-3">
              <CrmNav items={items} />
            </div>
          </details>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
