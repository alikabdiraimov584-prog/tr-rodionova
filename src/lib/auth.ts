import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession, createSession, deleteSession } from "@/lib/session";
import type { Role } from "@/generated/prisma/enums";
import { can, homeFor, type Section } from "@/lib/permissions";

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { loyaltyTier: true },
  });
  if (!user || !user.isActive) return null;
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

/** Любой сотрудник. Для конкретного раздела используйте requireSection. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/crm");
  if (!isStaff(user.role)) redirect("/account");
  return user;
}

/** Проверка доступа к разделу CRM: на страницах — редирект, в server actions — тоже редирект (POST не пройдёт). */
export async function requireSection(section: Section): Promise<CurrentUser> {
  const user = await requireStaff();
  if (!can(user.role, section)) redirect(homeFor(user.role));
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  return requireSection("settings");
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function loginAs(userId: string, role: Role) {
  await createSession(userId, role);
}

export async function logout() {
  await deleteSession();
}
