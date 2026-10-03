"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";

const CONSENT = "tr_consent";
const listeners = new Set<() => void>();

function readConsent() {
  return document.cookie.match(/(?:^|; )tr_consent=([^;]*)/)?.[1] ?? null;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function setConsent(v: "all" | "necessary") {
  document.cookie = `${CONSENT}=${v}; max-age=${180 * 24 * 3600}; path=/; samesite=lax`;
  listeners.forEach((l) => l());
}

/** Собственный счётчик: отправляет просмотры на /api/analytics/collect только после согласия на cookie. */
export function Analytics() {
  const path = usePathname();
  const params = useSearchParams();
  // на сервере согласие неизвестно ("pending"), баннер не рендерится до гидратации — без расхождений разметки
  const consent = useSyncExternalStore(subscribe, readConsent, () => "pending");

  useEffect(() => {
    if (consent !== "all") return;
    const utm: Record<string, string> = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const v = params.get(k);
      if (v) utm[k] = v;
    }
    const body = JSON.stringify({ path, referrer: document.referrer || null, utm });
    const url = "/api/analytics/collect";
    if (!navigator.sendBeacon || !navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) {
      fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  }, [path, params, consent]);

  if (consent !== null) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ivory/95 px-4 py-4 text-xs backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-muted">
          Мы используем необходимые cookie для работы сайта и, с вашего согласия, собственную аналитику посещений — без передачи данных третьим лицам.{" "}
          <Link href="/privacy#section-14" className="underline">Подробнее</Link>
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setConsent("necessary")}>Только необходимые</button>
          <button type="button" className="btn-primary btn-sm" onClick={() => setConsent("all")}>Принять</button>
        </div>
      </div>
    </div>
  );
}
