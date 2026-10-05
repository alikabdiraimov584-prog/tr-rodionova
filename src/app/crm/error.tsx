"use client";

import Link from "next/link";
import { useEffect } from "react";
import { isStaleBuildError, reloadOnceForStaleBuild } from "@/lib/stale-build";

/** Сбой внутри CRM: остаёмся в рабочем интерфейсе, даём повторить и показываем код для разбора в журнале. */
export default function CrmError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleBuildError(error);
  useEffect(() => {
    console.error(error);
    if (stale) reloadOnceForStaleBuild();
  }, [error, stale]);
  if (stale) {
    return (
      <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
        <div className="eyebrow">Обновление</div>
        <h1 className="mt-2 text-xl">CRM обновилась</h1>
        <p className="mt-2 text-sm text-muted">Эта вкладка была открыта до обновления. Страница перезагружается; если не перезагрузилась сама, нажмите кнопку и повторите действие.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="btn-primary btn-sm">Перезагрузить</button>
        </div>
      </div>
    );
  }
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
      <div className="eyebrow">Ошибка</div>
      <h1 className="mt-2 text-xl">Раздел не открылся</h1>
      <p className="mt-2 text-sm text-muted">
        Произошла ошибка на сервере. Повторите действие; если ошибка повторяется, сообщите разработчику код ниже.
        {error.digest ? <span className="mt-2 block text-xs">Код: {error.digest}</span> : <span className="mt-2 block text-xs">Код: нет (ошибка в браузере: {error.name || "Error"}{error.message ? `, ${error.message.slice(0, 120)}` : ""})</span>}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary btn-sm">Повторить</button>
        <button type="button" onClick={() => window.location.reload()} className="btn-outline btn-sm">Перезагрузить</button>
        <Link href="/crm" className="btn-outline btn-sm">В CRM</Link>
      </div>
    </div>
  );
}
