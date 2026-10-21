/**
 * Сессия и «ожидает код 2FA» подписаны одним AUTH_SECRET, поэтому тип токена проверяется по содержимому:
 * иначе токен ожидания второго фактора (выдаётся сразу после пароля) можно подставить в cookie сессии
 * и войти без кода. Модуль без server-only: его использует и proxy.
 */

export const PENDING_2FA_PURPOSE = "2fa-pending";

const ROLES = new Set(["CUSTOMER", "SUPPORT", "MANAGER", "ADMIN"]);

export function isSessionClaims(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    p.purpose === undefined &&
    typeof p.userId === "string" &&
    p.userId.length > 0 &&
    typeof p.role === "string" &&
    ROLES.has(p.role) &&
    typeof p.sv === "number" &&
    Number.isInteger(p.sv)
  );
}

export function isPendingTwoFactorClaims(payload: unknown): payload is { userId: string; next?: string; purpose: typeof PENDING_2FA_PURPOSE } {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return p.purpose === PENDING_2FA_PURPOSE && typeof p.userId === "string" && p.userId.length > 0 && (p.next === undefined || typeof p.next === "string");
}
