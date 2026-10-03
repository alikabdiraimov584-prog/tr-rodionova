import type { Metadata } from "next";
import { ForgotForm } from "@/components/password-forms";

export const metadata: Metadata = { title: "Восстановление пароля", robots: { index: false } };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-xl">Восстановление пароля</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Пришлём на email ссылку, по которой можно задать новый пароль.</p>
      <ForgotForm />
    </>
  );
}
