import "server-only";
import { activeIntegration } from "@/lib/integrations/store";
import { METRIKA_GOALS } from "@/lib/integrations/registry";

/**
 * Management API Яндекс Метрики: номера целей сайта по их идентификаторам (order, product_view, …).
 * Нужны Директу: цель заказа для стратегий и отчётов, цель просмотра вещи для ретаргетинга.
 * Токен и номер счётчика берутся из интеграции «Яндекс Метрика» в CRM.
 */

export type MetrikaGoal = { id: number; name: string; type: string; is_retargeting?: number; conditions?: { type: string; url: string }[] };

export type MetrikaAccess = { counter: number; token: string | null };

export async function metrikaAccess(): Promise<MetrikaAccess | null> {
  const m = await activeIntegration("metrika");
  const counter = Number((m?.config.counterId ?? "").replace(/\D/g, ""));
  if (!m || !counter) return null;
  return { counter, token: (m.config.token ?? "").trim() || null };
}

async function api<T>(token: string, url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { ...init, headers: { Authorization: `OAuth ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(15_000) });
  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    body = {} as T;
  }
  return { status: res.status, body };
}

/** Цели счётчика: ключ — идентификатор цели сайта (условие «exact»), значение — номер цели в Метрике. */
export async function metrikaGoalIds(access: MetrikaAccess & { token: string }): Promise<{ ids: Partial<Record<(typeof METRIKA_GOALS)[number]["id"], number>>; goals: MetrikaGoal[] }> {
  const r = await api<{ goals?: MetrikaGoal[]; message?: string }>(access.token, `https://api-metrika.yandex.net/management/v1/counter/${access.counter}/goals`);
  if (r.status !== 200) throw new Error(`Метрика ответила ${r.status}: ${r.body.message ?? "нет связи"}`);
  const ids: Partial<Record<(typeof METRIKA_GOALS)[number]["id"], number>> = {};
  const known = new Set<string>(METRIKA_GOALS.map((g) => g.id));
  for (const g of r.body.goals ?? []) {
    for (const c of g.conditions ?? []) {
      if (c.type === "exact" && known.has(c.url)) ids[c.url as keyof typeof ids] = g.id;
    }
  }
  return { ids, goals: r.body.goals ?? [] };
}

/**
 * Директ видит только цели с флагом «ретаргетинг». Включает флаг у целей сайта, где он выключен.
 * Возвращает список исправленных целей; ошибки отдельных целей не прерывают остальные.
 */
export async function ensureRetargetingFlag(access: MetrikaAccess & { token: string }, goals: MetrikaGoal[]) {
  const fixed: string[] = [];
  const known = new Set<string>(METRIKA_GOALS.map((g) => g.id));
  for (const g of goals) {
    const url = g.conditions?.find((c) => c.type === "exact" && known.has(c.url))?.url;
    if (!url || g.is_retargeting === 1) continue;
    const r = await api<{ message?: string }>(access.token, `https://api-metrika.yandex.net/management/v1/counter/${access.counter}/goal/${g.id}`, { method: "PUT", body: JSON.stringify({ goal: { ...g, is_retargeting: 1 } }) });
    if (r.status === 200) fixed.push(url);
  }
  return fixed;
}

/** Номер одной цели сайта в Метрике или null, если токена нет или цель ещё не создана. */
export async function metrikaGoalNumber(goal: (typeof METRIKA_GOALS)[number]["id"]): Promise<number | null> {
  const access = await metrikaAccess();
  if (!access?.token) return null;
  try {
    return (await metrikaGoalIds({ ...access, token: access.token })).ids[goal] ?? null;
  } catch {
    return null;
  }
}
