import type { Role } from "@/generated/prisma/enums";

/**
 * Для кого второй фактор обязателен. По умолчанию — администраторы и менеджеры: у них доступ к заказам,
 * клиенткам и деньгам. STAFF_2FA_REQUIRED=all добавляет поддержку, STAFF_2FA_REQUIRED=0 отключает требование
 * (только для локального стенда и автотестов).
 */
export function twoFactorRequired(role: Role | string | undefined | null): boolean {
  const mode = process.env.STAFF_2FA_REQUIRED ?? "1";
  if (mode === "0") return false;
  if (role === "ADMIN" || role === "MANAGER") return true;
  if (mode === "all" && role === "SUPPORT") return true;
  return false;
}

/** Страницы CRM, доступные сотруднику без включённой 2FA: только настройка защиты. */
export function allowedWithoutTwoFactor(pathname: string) {
  return pathname === "/crm/security" || pathname.startsWith("/crm/security/");
}
