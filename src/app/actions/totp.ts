"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff, loginAs } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { checkRate } from "@/lib/ratelimit";
import { generateTotpSecret, verifyTotp } from "@/lib/totp";
import { homeFor } from "@/lib/permissions";
import type { ActionState } from "@/lib/action-result";
import { PENDING_2FA_COOKIE as PENDING_COOKIE } from "@/lib/two-factor";

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

export async function verifyTwoFactorAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const store = await cookies();
  const token = store.get(PENDING_COOKIE)?.value;
  if (!token) return { error: "Сессия входа истекла, войдите заново" };
  let payload: { userId: string; next?: string };
  try {
    payload = (await jwtVerify(token, secret(), { algorithms: ["HS256"] })).payload as { userId: string; next?: string };
  } catch {
    return { error: "Сессия входа истекла, войдите заново" };
  }
  const rl = await checkRate(`2fa:${payload.userId}`, { limit: 6, windowSec: 300, lockSec: 900 });
  if (!rl.ok) return { error: "Слишком много попыток. Попробуйте через 15 минут." };
  const user = await db.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.isActive || !user.totpSecret) return { error: "Аккаунт недоступен" };
  if (!verifyTotp(user.totpSecret, String(formData.get("code") ?? ""))) return { error: "Неверный код" };
  store.delete(PENDING_COOKIE);
  await loginAs(user.id, user.role, user.sessionVersion, true);
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  await audit(user.id, "auth.login2fa", "User", user.id);
  const next = payload.next && payload.next.startsWith("/") && !payload.next.startsWith("//") ? payload.next : homeFor(user.role);
  redirect(next);
}

/** Шаг 1 включения: выдать секрет (пока не подтверждён кодом — не активен). */
export async function beginTotpSetupAction(): Promise<ActionState> {
  const me = await requireStaff();
  if (me.totpEnabledAt) return { error: "Двухфакторная защита уже включена" };
  const s = generateTotpSecret();
  await db.user.update({ where: { id: me.id }, data: { totpSecret: s, totpEnabledAt: null } });
  revalidatePath("/crm/security");
  return { ok: true, message: "Секрет создан — отсканируйте или введите его в приложении и подтвердите кодом" };
}

export async function confirmTotpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireStaff();
  if (!me.totpSecret) return { error: "Сначала создайте секрет" };
  if (!verifyTotp(me.totpSecret, String(formData.get("code") ?? ""))) return { error: "Код не подошёл. Проверьте время на телефоне и попробуйте снова." };
  await db.user.update({ where: { id: me.id }, data: { totpEnabledAt: new Date() } });
  await audit(me.id, "user.totpEnabled", "User", me.id);
  // текущая сессия получает отметку о втором факторе, иначе остальные разделы останутся закрытыми
  await loginAs(me.id, me.role, me.sessionVersion, true);
  revalidatePath("/crm", "layout");
  return { ok: true, message: "Двухфакторная защита включена" };
}

export async function disableTotpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireStaff();
  if (!me.totpSecret || !me.totpEnabledAt) return { error: "Защита не включена" };
  if (!verifyTotp(me.totpSecret, String(formData.get("code") ?? ""))) return { error: "Неверный код" };
  await db.user.update({ where: { id: me.id }, data: { totpSecret: null, totpEnabledAt: null, sessionVersion: { increment: 1 } } });
  await audit(me.id, "user.totpDisabled", "User", me.id);
  const fresh = await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { sessionVersion: true } });
  await loginAs(me.id, me.role, fresh.sessionVersion, false);
  revalidatePath("/crm", "layout");
  return { ok: true, message: "Двухфакторная защита отключена" };
}

/** Администратор сбрасывает 2FA сотруднику, потерявшему телефон. */
export async function adminResetTotpAction(formData: FormData) {
  const me = await requireStaff();
  if (me.role !== "ADMIN") throw new Error("Только администратор");
  const id = String(formData.get("id"));
  const r = await db.user.updateMany({ where: { id, role: { not: "CUSTOMER" } }, data: { totpSecret: null, totpEnabledAt: null, sessionVersion: { increment: 1 } } });
  if (r.count === 0) throw new Error("Сотрудник не найден");
  await audit(me.id, "staff.totpReset", "User", id);
  revalidatePath("/crm/staff");
}

/** Сессии, выданные до появления отметки о втором факторе: сотрудник с включённой 2FA обновляет её одной кнопкой. */
export async function refreshStaffSessionAction() {
  const me = await requireStaff();
  if (!me.totpSecret || !me.totpEnabledAt) return;
  await loginAs(me.id, me.role, me.sessionVersion, true);
  redirect(homeFor(me.role));
}
