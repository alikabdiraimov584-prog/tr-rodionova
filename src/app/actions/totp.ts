"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff, requireSection, loginAs } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { checkRate, clearRate } from "@/lib/ratelimit";
import { generateTotpSecret, verifyTotp } from "@/lib/totp";
import { encryptSecret } from "@/lib/crypto";
import { homeFor } from "@/lib/permissions";
import type { ActionState } from "@/lib/action-result";
import { PENDING_2FA_COOKIE as PENDING_COOKIE } from "@/lib/two-factor";
import { safeNext } from "@/lib/safe-redirect";

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
  const next = safeNext(payload.next, homeFor(user.role));
  redirect(next);
}

/** Шаг 1 включения: выдать секрет (пока не подтверждён кодом — не активен). */
export async function beginTotpSetupAction(): Promise<ActionState> {
  const me = await requireStaff();
  if (me.totpEnabledAt) return { error: "Двухфакторная защита уже включена" };
  const s = generateTotpSecret();
  await db.user.update({ where: { id: me.id }, data: { totpSecret: encryptSecret(s), totpEnabledAt: null } });
  revalidatePath("/crm/security");
  return { ok: true, message: "Секрет создан — отсканируйте или введите его в приложении и подтвердите кодом" };
}

export async function confirmTotpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireStaff();
  if (!me.totpSecret) return { error: "Сначала создайте секрет" };
  const rate = await checkRate(`totp-setup:${me.id}`, { limit: 6, windowSec: 300, lockSec: 900 });
  if (!rate.ok) return { error: "Слишком много попыток. Попробуйте через 15 минут." };
  if (!verifyTotp(me.totpSecret, String(formData.get("code") ?? ""))) return { error: "Код не подошёл. Проверьте время на телефоне и попробуйте снова." };
  // Compare-and-set: do not enable a secret that changed while the submitted code was being verified.
  const activated = await db.user.updateMany({
    where: { id: me.id, totpSecret: me.totpSecret, totpEnabledAt: null, sessionVersion: me.sessionVersion },
    data: { totpEnabledAt: new Date() },
  });
  if (activated.count !== 1) return { error: "Секрет изменился. Начните настройку двухфакторной защиты заново." };
  await clearRate(`totp-setup:${me.id}`);
  await audit(me.id, "user.totpEnabled", "User", me.id);
  // текущая сессия получает отметку о втором факторе, иначе остальные разделы останутся закрытыми
  await loginAs(me.id, me.role, me.sessionVersion, true);
  revalidatePath("/crm", "layout");
  return { ok: true, message: "Двухфакторная защита включена" };
}

export async function disableTotpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireStaff();
  if (!me.totpSecret || !me.totpEnabledAt) return { error: "Защита не включена" };
  const rate = await checkRate(`totp-disable:${me.id}`, { limit: 6, windowSec: 300, lockSec: 900 });
  if (!rate.ok) return { error: "Слишком много попыток. Попробуйте через 15 минут." };
  if (!verifyTotp(me.totpSecret, String(formData.get("code") ?? ""))) return { error: "Неверный код" };
  // Compare-and-set and bump the session version only if the verified secret is still current.
  const disabled = await db.user.updateMany({
    where: { id: me.id, totpSecret: me.totpSecret, totpEnabledAt: me.totpEnabledAt, sessionVersion: me.sessionVersion },
    data: { totpSecret: null, totpEnabledAt: null, sessionVersion: { increment: 1 } },
  });
  if (disabled.count !== 1) return { error: "Настройки безопасности изменились. Обновите страницу и попробуйте снова." };
  await clearRate(`totp-disable:${me.id}`);
  await audit(me.id, "user.totpDisabled", "User", me.id);
  const fresh = await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { sessionVersion: true } });
  await loginAs(me.id, me.role, fresh.sessionVersion, false);
  revalidatePath("/crm", "layout");
  return { ok: true, message: "Двухфакторная защита отключена" };
}

/** Администратор сбрасывает 2FA сотруднику, потерявшему телефон. */
export async function adminResetTotpAction(formData: FormData) {
  // Сброс чужого второго фактора требует полноценной CRM-сессии с пройденной 2FA.
  const me = await requireSection("staff");
  if (me.role !== "ADMIN") throw new Error("Только администратор");
  const id = String(formData.get("id"));
  const r = await db.user.updateMany({ where: { id, role: { not: "CUSTOMER" } }, data: { totpSecret: null, totpEnabledAt: null, sessionVersion: { increment: 1 } } });
  if (r.count === 0) throw new Error("Сотрудник не найден");
  await audit(me.id, "staff.totpReset", "User", id);
  revalidatePath("/crm/staff");
}

/** Сессия без отметки о втором факторе (выдана до обновления CRM или после сброса пароля): подтверждается кодом из приложения, не кнопкой. */
export async function refreshStaffSessionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireStaff();
  if (!me.totpSecret || !me.totpEnabledAt) return { error: "Защита не включена" };
  const rl = await checkRate(`2fa:${me.id}`, { limit: 6, windowSec: 300, lockSec: 900 });
  if (!rl.ok) return { error: "Слишком много попыток. Попробуйте через 15 минут." };
  if (!verifyTotp(me.totpSecret, String(formData.get("code") ?? ""))) return { error: "Неверный код" };
  await loginAs(me.id, me.role, me.sessionVersion, true);
  await audit(me.id, "auth.login2fa", "User", me.id, { refresh: true });
  redirect(homeFor(me.role));
}
