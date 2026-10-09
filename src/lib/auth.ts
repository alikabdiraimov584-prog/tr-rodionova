import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession, createSession, deleteSession } from "@/lib/session";
import type { Role } from "@/generated/prisma/enums";
import { can, homeFor, type Section } from "@/lib/permissions";
import { twoFactorRequired } from "@/lib/two-factor-policy";

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { loyaltyTier: true },
  });
  if (!user || !user.isActive) return null;
  // токен, выданный до смены пароля или блокировки, больше не действует
  if ((session.sv ?? 0) !== user.sessionVersion) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export function isStaff(role: Role | undefined | null): boolean {
  return role === "SUPPORT" || role === "MANAGER" || role === "ADMIN";
}

/**
 * Клиентка, если вошла именно она. Сотрудник на витрине — как гость: кабинет, избранное и мерки
 * относятся к клиентскому аккаунту, а в CRM ведёт только ссылка «CRM» в шапке.
 */
export async function getCurrentCustomer(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && !isStaff(user.role) ? user : null;
}

/** Любой сотрудник. Для конкретного раздела используйте requireSection. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/crm");
  if (!isStaff(user.role)) redirect("/account");
  return user;
}

/** Отметка второго фактора в текущей сессии сотрудника. */
export const twoFactorPassed = cache(async () => (await getSession())?.tf === true);

/** Сессия сотрудника без обязательного второго фактора: в CRM ей можно только настроить защиту. */
export async function twoFactorMissing(user: { role: Role }) {
  return twoFactorRequired(user.role) && !(await twoFactorPassed());
}

/**
 * Проверка доступа к разделу CRM: на страницах — редирект, в server actions — тоже редирект (POST не пройдёт).
 * Второй фактор проверяется и здесь, а не только по адресу в proxy: действие можно вызвать с любого адреса,
 * а сессия без кода (после восстановления пароля, до включения защиты) не должна ничего менять в CRM.
 */
export async function requireSection(section: Section): Promise<CurrentUser> {
  const user = await requireStaff();
  if (!can(user.role, section)) redirect(homeFor(user.role));
  if (await twoFactorMissing(user)) redirect("/crm/security?required=1");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  return requireSection("settings");
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

/** Фиктивный хеш: сравнение с ним занимает столько же времени, сколько с настоящим, и не выдаёт, есть ли email в базе. */
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8m4N3ZbQ8k1hQxYfD2kz1VY8XAv7Ue";
export async function verifyPasswordOrDummy(password: string, hash: string | null | undefined) {
  return bcrypt.compare(password, hash ?? DUMMY_HASH).then((ok) => ok && !!hash);
}

export async function loginAs(userId: string, role: Role, sessionVersion: number, twoFactorPassed = false) {
  await createSession(userId, role, sessionVersion, twoFactorPassed);
  // корзина, собранная до входа, переезжает в аккаунт
  try {
    const { mergeGuestCart } = await import("@/lib/guest-cart");
    await mergeGuestCart(userId);
  } catch {
    // слияние корзины не должно ломать вход
  }
}

/** Завершить все сессии пользователя (смена пароля, блокировка, сброс пароля). */
export async function revokeSessions(userId: string) {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

export async function logout() {
  await deleteSession();
}
