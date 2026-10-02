import { ShopHeader, ShopFooter } from "@/components/shop/header";
import { AccountNav } from "@/components/account/nav";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics";

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const user = await requireUser("/account");
  return (
    <>
      <ShopHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-8">
        <div className="grid gap-10 md:grid-cols-[200px_1fr]">
          <aside className="space-y-8">
            <div>
              <div className="eyebrow">Личный кабинет</div>
              <div className="serif mt-1 text-2xl">{user.firstName}</div>
            </div>
            <AccountNav />
            <form action={logoutAction}>
              <button className="text-[0.68rem] uppercase tracking-[0.18em] text-muted hover:text-danger">Выйти</button>
            </form>
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <ShopFooter />
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
    </>
  );
}
