import type { Role } from "@/generated/prisma/enums";

/**
 * Ссылки витрины, которые зависят от того, кто смотрит сайт.
 * Гость — регистрация и вход; клиентка — её кабинет. Сотрудник видит витрину ровно как гость:
 * рабочие разделы на витрине не упоминаются и не ссылаются, в них заходят только прямым адресом.
 */
type Viewer = { role: Role } | null | undefined;

export function isStaffRole(role: Role | undefined | null) {
  return role === "SUPPORT" || role === "MANAGER" || role === "ADMIN";
}

/** Пункт «Кабинет / Войти» в шапке и мобильном меню. */
export function cabinetLink(user: Viewer): readonly [href: string, label: string] {
  if (!user || isStaffRole(user.role)) return ["/login", "Войти"];
  return ["/account", "Кабинет"];
}

/** Кнопка «Вступить в Circle». */
export function circleCta(user: Viewer, welcomePoints: number): { href: string; label: string } {
  if (user && !isStaffRole(user.role)) return { href: "/account", label: "Ваш кабинет Circle" };
  return { href: "/register", label: `Вступить и получить ${welcomePoints.toLocaleString("ru-RU")} баллов` };
}
