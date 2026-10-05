"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Сбой внутри CRM: остаёмся в рабочем интерфейсе, даём повторить и показываем код для разбора в журнале. */
export default function CrmError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
      <div className="eyebrow">Ошибка</div>
      <h1 className="mt-2 text-xl">Раздел не открылся</h1>
      <p className="mt-2 text-sm text-muted">
        Произошла ошибка на сервере. Повторите действие; если ошибка повторяется, сообщите разработчику код ниже.
        {error.digest && <span className="mt-2 block text-xs">Код: {error.digest}</span>}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary btn-sm">Повторить</button>
        <Link href="/crm" className="btn-outline btn-sm">В CRM</Link>
      </div>
    </div>
  );
}
