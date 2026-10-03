import type { Metadata } from "next";
import { ResetForm } from "@/components/password-forms";

export const metadata: Metadata = { title: "Новый пароль", robots: { index: false } };

export default async function ResetPage({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  return (
    <>
      <h1 className="text-xl">Новый пароль</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Минимум 8 символов. После сохранения остальные устройства выйдут из аккаунта.</p>
      <ResetForm token={token} />
    </>
  );
}
