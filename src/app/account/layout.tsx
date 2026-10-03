import { Suspense } from "react";
import { ShopHeader, ShopFooter } from "@/components/shop/header";
import { AccountNav } from "@/components/account/nav";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { Analytics } from "@/components/analytics";

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const user = await requireUser("/account");
  return (
    <>
      <ShopHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">
        <div className="grid gap-8 md:grid-cols-[200px_1fr]">
          <aside className="space-y-6 border-b border-line pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-6">
            <div>
              <div className="eyebrow">Кабинет</div>
              <div className="mt-1 text-base">{user.firstName} {user.lastName}</div>
              <div className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">{user.loyaltyTier?.name ?? "Atelier"} · {user.pointsBalance.toLocaleString("ru-RU")} баллов</div>
            </div>
            <AccountNav />
            <form action={logoutAction}><button className="text-[0.68rem] uppercase tracking-[0.1em] text-muted hover:text-danger">Выйти</button></form>
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <ShopFooter />
      <Suspense fallback={null}><Analytics /></Suspense>
    </>
  );
}
