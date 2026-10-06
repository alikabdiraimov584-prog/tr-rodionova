import type { Metadata } from "next";
import { db } from "@/lib/db";
import { RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const ref = typeof sp.ref === "string" ? sp.ref : undefined;
  const referrer = ref ? await db.user.findUnique({ where: { referralCode: ref }, select: { firstName: true } }) : null;
  return (
    <>
      <h1>Регистрация</h1>
      <p className="mb-8 mt-2 text-sm text-muted">2 000 приветственных баллов — сразу после регистрации</p>
      <RegisterForm next={next} refCode={referrer ? ref : undefined} referrerName={referrer?.firstName} />
    </>
  );
}
