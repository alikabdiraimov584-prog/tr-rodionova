"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
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
  // сторонние счётчики (Метрика, GA) ставятся сервером только после согласия — перерисовываем страницу.
  // Кроме оформления заказа: перезагрузка стёрла бы введённые данные, счётчики подключатся на следующей странице
  if (v === "all" && !window.location.pathname.startsWith("/checkout")) window.location.reload();
}

/** Собственный счётчик: отправляет просмотры на /api/analytics/collect только после согласия на cookie. */
export function Analytics() {
  const path = usePathname();
  const params = useSearchParams();
  // на сервере согласие неизвестно ("pending"), баннер не рендерится до гидратации — без расхождений разметки
  const consent = useSyncExternalStore(subscribe, readConsent, () => "pending");
  const banner = useRef<HTMLDivElement>(null);

  // высота, которую баннер закрывает снизу, — в переменную --consent-h: на неё поднимаются кнопка первого экрана
  // и панель покупки, и на неё же растёт отступ внизу страницы. После ответа переменная убирается.
  const visible = consent === null;
  useEffect(() => {
    const el = banner.current;
    if (!visible || !el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--consent-h", `${Math.max(0, Math.ceil(window.innerHeight - el.getBoundingClientRect().top))}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--consent-h");
    };
  }, [visible]);

  useEffect(() => {
    if (consent === "pending") return;
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

  if (!visible) return null;
  return (
    <div ref={banner} role="region" aria-label="Согласие на cookie" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ivory px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-[0.75rem] leading-snug md:inset-x-auto md:bottom-5 md:left-5 md:max-w-sm md:border md:p-5 md:shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
      <p className="text-muted">
        Ведём обезличенную статистику посещений. С вашего согласия запоминаем браузер между визитами и подключаем Яндекс Метрику.{" "}
        <Link href="/privacy#section-14" className="text-ink underline underline-offset-2">Подробнее</Link>
      </p>
      <div className="mt-2.5 flex gap-2">
        <button type="button" className="btn-outline btn-sm flex-1 !min-h-10 whitespace-nowrap !px-2 normal-case tracking-normal" onClick={() => setConsent("necessary")}>Только необходимые</button>
        <button type="button" className="btn-primary btn-sm flex-1 !min-h-10 whitespace-nowrap !px-2 normal-case tracking-normal" onClick={() => setConsent("all")}>Принять</button>
      </div>
    </div>
  );
}
