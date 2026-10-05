import { Suspense } from "react";
import { ShopHeader, ShopFooter } from "@/components/shop/header";
import { AccountNav } from "@/components/account/nav";
import { requireUser, isStaff } from "@/lib/auth";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Analytics } from "@/components/analytics";

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const user = await requireUser("/account");
  // у сотрудников нет клиентского кабинета: их рабочее место — CRM
  if (isStaff(user.role)) redirect("/crm");
  return (
    <>
      <ShopHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">
        <div className="grid gap-6 md:gap-8 md:grid-cols-[200px_1fr]">
          <aside className="min-w-0 space-y-4 border-b border-line pb-3 md:space-y-6 md:border-b-0 md:border-r md:pb-0 md:pr-6">
            <div>
              <div className="eyebrow">Кабинет</div>
              <div className="mt-1 text-base">{user.firstName} {user.lastName}</div>
              <div className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">{user.loyaltyTier?.name ?? "Atelier"} · {user.pointsBalance.toLocaleString("ru-RU")} баллов</div>
            </div>
            <AccountNav />
            <form action={logoutAction} className="hidden md:block"><button className="py-1 text-[0.68rem] uppercase tracking-[0.1em] text-muted hover:text-danger">Выйти</button></form>
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <ShopFooter />
      <Suspense fallback={null}><Analytics /></Suspense>
    </>
  );
}
