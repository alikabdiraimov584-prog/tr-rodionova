import type { Metadata } from "next";
import Link from "next/link";
import { TwoFactorForm } from "@/components/two-factor-form";

export const metadata: Metadata = { title: "Подтверждение входа", robots: { index: false } };

export default function TwoFactorPage() {
  return (
    <>
      <h1 className="text-xl">Подтверждение входа</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Введите шестизначный код из приложения-аутентификатора. Код действует 30 секунд.</p>
      <TwoFactorForm />
      <p className="mt-6 text-center text-xs text-muted">Потеряли доступ к приложению? Попросите администратора сбросить защиту. <Link href="/login" className="underline">Назад</Link></p>
    </>
  );
}
