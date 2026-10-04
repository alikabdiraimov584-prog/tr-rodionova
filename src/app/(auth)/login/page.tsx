import type { Metadata } from "next";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <>
      <h1 className="text-xl">Вход</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Личный кабинет и программа T.Rodionova Circle</p>
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
