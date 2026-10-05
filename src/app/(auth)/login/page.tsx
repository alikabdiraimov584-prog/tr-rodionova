import type { Metadata } from "next";
import { LoginForm, CodeLoginForm } from "@/components/auth-forms";
import { db } from "@/lib/db";
import Link from "next/link";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const email = typeof sp.email === "string" ? sp.email : undefined;
  const codeLogin = !!(await db.channelIntegration.findUnique({ where: { channel: "EMAIL" }, select: { enabled: true } }).catch(() => null))?.enabled;
  const session = await getSession();
  const staffSession = !!session && session.role !== "CUSTOMER";
  return (
    <>
      <h1 className="text-xl">Вход</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Личный кабинет и программа T.Rodionova Circle</p>
      {staffSession && (
        <div className="mb-6 border border-line bg-sand p-4 text-sm">
          Вы вошли как сотрудник: ваше рабочее место — <Link href="/crm" className="underline">CRM</Link>. Кабинет клиентки, избранное и мерки относятся к клиентскому аккаунту: войдите под ним ниже, вход в CRM при этом завершится.
        </div>
      )}
      {codeLogin && (
        <details className="mb-6 border border-line bg-white p-4" open={!!email}>
          <summary className="cursor-pointer text-sm">Войти по коду из письма, без пароля</summary>
          <div className="mt-4"><CodeLoginForm next={next} email={email} /></div>
        </details>
      )}
      <LoginForm next={next} />
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-10 border border-dashed border-line p-4 text-xs text-muted">
          <div className="eyebrow mb-2">Демо-доступы</div>
          admin@tr-rodionova.ru / admin12345<br />manager@tr-rodionova.ru / manager12345<br />anna@example.com / anna12345
        </div>
      )}
    </>
  );
}
