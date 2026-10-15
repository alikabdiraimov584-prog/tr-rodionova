import type { Role } from "@/generated/prisma/enums";

/**
 * Для кого второй фактор обязателен. В production отключение через env запрещено:
 * случайный STAFF_2FA_REQUIRED=0 не должен снимать защиту с привилегированных ролей.
 * По умолчанию обязательна для ADMIN и MANAGER; "all" также включает SUPPORT.
 */
export function twoFactorRequired(role: Role | string | undefined | null): boolean {
  const mode = process.env.STAFF_2FA_REQUIRED ?? "1";
  if (process.env.NODE_ENV !== "production" && mode === "0") return false;
  if (role === "ADMIN" || role === "MANAGER") return true;
  if (mode === "all" && role === "SUPPORT") return true;
  return false;
}

/** Страницы CRM, доступные сотруднику без включённой 2FA: только настройка защиты. */
export function allowedWithoutTwoFactor(pathname: string) {
  return pathname === "/crm/security" || pathname.startsWith("/crm/security/");
}
