"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/brand-marks";
import { Logo } from "@/components/ui";
import { browserErrorLabel, isNetworkError, isStaleBuildError, reloadOnceForStaleBuild } from "@/lib/stale-build";

/** Внутренний сбой на витрине: покупательница видит страницу в стиле сайта, а не серый экран Next.js. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleBuildError(error);
  const attempted = useRef<Error | null>(null);
  const [failedRecovery, setFailedRecovery] = useState<Error | null>(null);
  useEffect(() => {
    console.error(error);
    if (stale && attempted.current !== error) {
      attempted.current = error;
      if (!reloadOnceForStaleBuild()) setFailedRecovery(error);
    }
  }, [error, stale]);
  if (stale && failedRecovery !== error) {
    return (
      <div role="status" aria-label="Загрузка витрины" className="fixed inset-0 z-[100] grid place-items-center bg-white">
        <Wordmark className="w-[clamp(160px,28vw,225px)]" />
      </div>
    );
  }
  if (stale || isNetworkError(error)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <Logo />
        <h1 className="mt-10">Связь прервалась</h1>
        <p className="mt-2 max-w-md text-sm text-muted">Страница не успела загрузиться: пропал интернет или сайт как раз обновлялся. Проверьте связь и нажмите «Повторить».</p>
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
        {/* код сервера — для поиска в журнале; у ошибки браузера кода нет, поэтому показываем её тип: по скриншоту видно, что сломалось */}
        <span className="mt-2 block text-xs opacity-70">{error.digest ? `Код ошибки: ${error.digest}` : `Код ошибки: браузер — ${browserErrorLabel(error)}`}</span>
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">Попробовать снова</button>
        <Link href="/catalog" className="btn-outline">Каталог</Link>
        <Link href="/" className="btn-outline">На главную</Link>
      </div>
    </div>
  );
}
