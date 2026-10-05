"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/ui";

/** Внутренний сбой на витрине: покупательница видит страницу в стиле сайта, а не серый экран Next.js. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-10 text-2xl">Что-то пошло не так</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        Страница не открылась из-за ошибки на нашей стороне. Попробуйте ещё раз через минуту; если не поможет, напишите нам: care@tr-rodionova.ru
        {error.digest && <span className="mt-2 block text-xs opacity-70">Код ошибки: {error.digest}</span>}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">Попробовать снова</button>
        <Link href="/catalog" className="btn-outline">Каталог</Link>
        <Link href="/" className="btn-outline">На главную</Link>
      </div>
    </div>
  );
}
