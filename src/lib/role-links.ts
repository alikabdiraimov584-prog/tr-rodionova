import type { Role } from "@/generated/prisma/enums";

/**
 * Ссылки витрины, которые зависят от того, кто смотрит сайт.
 * Гость — регистрация и вход; клиентка — её кабинет; сотрудник — CRM (а в Circle он может
 * зарегистрировать отдельный клиентский аккаунт, поэтому «Вступить» для него ведёт на регистрацию, а не в CRM).
 */
type Viewer = { role: Role } | null | undefined;

export function isStaffRole(role: Role | undefined | null) {
  return role === "SUPPORT" || role === "MANAGER" || role === "ADMIN";
}

/** Пункт «Кабинет / Войти / CRM» в шапке и мобильном меню. */
export function cabinetLink(user: Viewer): readonly [href: string, label: string] {
  if (!user) return ["/login", "Войти"];
  if (isStaffRole(user.role)) return ["/crm", "CRM"];
  return ["/account", "Кабинет"];
}

/** Кнопка «Вступить в Circle». */
export function circleCta(user: Viewer, welcomePoints: number): { href: string; label: string } {
  if (user && !isStaffRole(user.role)) return { href: "/account", label: "Ваш кабинет Circle" };
  return { href: "/register", label: `Вступить и получить ${welcomePoints.toLocaleString("ru-RU")} баллов` };
}
