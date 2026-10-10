/**
 * Цели Яндекс Метрики из клиентского кода. Счётчик ставится сервером только после согласия на cookie, поэтому
 * без него вызов тихо ничего не делает. Идентификаторы целей совпадают с METRIKA_GOALS в lib/integrations/registry.ts.
 */
declare global {
  interface Window {
    /** Функция счётчика Яндекс Метрики; появляется после согласия на cookie и загрузки tag.js. */
    ym?: (...args: unknown[]) => void;
    /** Номер счётчика, который подставил сервер в init (см. components/third-party-tags.tsx). */
    __trMetrika?: number;
    dataLayer?: unknown[];
  }
}

export type MetrikaGoalId = "order" | "checkout" | "cart" | "waitlist" | "register";

export function trackGoal(goal: MetrikaGoalId, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const id = window.__trMetrika;
  if (id && typeof window.ym === "function") window.ym(id, "reachGoal", goal, params);
}
