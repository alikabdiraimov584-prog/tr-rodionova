"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand-marks";
import { Logo } from "@/components/ui";
import { isNetworkError, isStaleBuildError, reloadOnceForStaleBuild } from "@/lib/stale-build";

/** Внутренний сбой на витрине: покупательница видит страницу в стиле сайта, а не серый экран Next.js. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const stale = error instanceof Error && isStaleBuildError(error);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
  const [failedRecovery, setFailedRecovery] = useState<Error | null>(null);
  useEffect(() => {
    console.error(error);
    if (!stale) return;
    const timer = window.setTimeout(() => {
      if (!reloadOnceForStaleBuild()) setFailedRecovery(error);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [error, stale]);
  if (stale && failedRecovery !== error) {
    return (
      <div role="status" aria-label="Загрузка витрины" className="fixed inset-0 z-[100] grid place-items-center bg-white">
        <Wordmark className="w-[clamp(160px,28vw,225px)]" />
      </div>
    );
  }
  if (stale || (error instanceof Error && isNetworkError(error))) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <Logo />
        <h1 className="mt-10">Не удалось загрузить страницу</h1>
        <p className="mt-2 max-w-md text-sm text-muted">Попробуйте открыть страницу ещё раз.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="btn-primary">Повторить</button>
          <Link href="/" className="btn-outline">На главную</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-10">Что-то пошло не так</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        Страница не открылась из-за ошибки на нашей стороне. Попробуйте ещё раз через минуту; если не поможет, напишите нам: care@tr-rodionova.ru
        {digest && <span className="mt-2 block text-xs">Код ошибки: {digest}</span>}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={retry} className="btn-primary">Попробовать снова</button>
        <Link href="/catalog" className="btn-outline">Каталог</Link>
        <Link href="/" className="btn-outline">На главную</Link>
      </div>
    </div>
  );
}
