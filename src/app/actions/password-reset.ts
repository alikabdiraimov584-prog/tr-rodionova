"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, isStaff, loginAs } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { checkRate, clearRate, clientIp } from "@/lib/ratelimit";
import { sendVia } from "@/lib/notifications";
import { getSetting } from "@/lib/settings";
import { sendAlert } from "@/lib/alerts";
import { startTwoFactor } from "@/lib/two-factor";
import { homeFor } from "@/lib/permissions";
import type { ActionState } from "@/lib/action-result";

const TTL_MIN = 60;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Запрос ссылки для восстановления. Ответ одинаковый для любого email, чтобы не раскрывать базу. */
export async function requestPasswordResetAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { error: "Введите email" };
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([
    checkRate(`reset:ip:${ip ?? "unknown"}`, { limit: 10, windowSec: 3600 }),
    checkRate(`reset:email:${email}`, { limit: 3, windowSec: 3600 }),
  ]);
  const neutral = { ok: true, message: "Если такой аккаунт есть, письмо со ссылкой уже отправлено. Ссылка действует 60 минут. Если письмо не пришло за 10 минут, проверьте папку «Спам» или напишите в службу заботы." };
  if (!byIp.ok || !byEmail.ok) return neutral;
  // почта не подключена: честно сказать об этом до поиска аккаунта (ответ одинаковый для всех адресов)
  const mail = await db.channelIntegration.findUnique({ where: { channel: "EMAIL" }, select: { enabled: true } });
  if (!mail?.enabled && process.env.NODE_ENV === "production") return { error: "Восстановление по почте временно недоступно. Напишите в службу заботы, и мы поможем войти." };
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return neutral;
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL_MIN * 60_000) } });
  const base = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const brand = await getSetting("brand");
  const link = `${base}/reset/${token}`;
  const text = `${user.firstName}, здравствуйте.\n\nВы запросили восстановление пароля на сайте ${brand.name}. Перейдите по ссылке, она действует ${TTL_MIN} минут:\n${link}\n\nЕсли это были не вы, просто не открывайте ссылку — пароль останется прежним.\n\n— ${brand.name}\n${brand.email}`;
  const r = await sendVia("EMAIL", user.email, text, "Восстановление пароля");
  await db.notification.create({ data: { userId: user.id, event: "PASSWORD_RESET", channel: "EMAIL", address: user.email, subject: "Восстановление пароля", text: "ссылка для сброса пароля", status: r.status, error: r.error ?? null } });
  await audit(user.id, "auth.resetRequested", "User", user.id, { delivered: r.status });
  if (r.status === "FAILED") {
    // письмо не ушло: не тратить лимит человека на несостоявшуюся попытку и поднять тревогу администраторам
    await clearRate(`reset:email:${email}`);
    await sendAlert(`Не отправилось письмо для восстановления пароля (${user.email}): ${r.error ?? "ошибка отправки"}. Проверьте CRM → Настройки → Каналы → Email.`, { key: "mail:password-reset" });
  }
  if (r.status !== "SENT" && process.env.NODE_ENV !== "production") {
    // на стенде почта не подключена: показываем ссылку прямо на странице
    return { ok: true, message: `Почта не подключена. Ссылка для сброса (только на стенде): ${link}` };
  }
  return neutral;
}

const ResetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Пароль — минимум 8 символов").max(200),
});

export async function resetPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ResetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: hash(parsed.data.token) }});
  if (!row || row.usedAt || row.expiresAt < new Date()) return { error: "Ссылка недействительна или устарела. Запросите новую." };
  const user = await db.user.findUnique({ where: { id: row.userId } });
  if (!user || !user.isActive) return { error: "Аккаунт недоступен" };
  const updated = await db.$transaction(async (tx) => {
    await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    // все старые сессии завершаются
    return tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password), sessionVersion: { increment: 1 } } });
  });
  await audit(user.id, "auth.passwordReset", "User", user.id);
  // сотрудник с включённой 2FA: доступ к почте не должен обходить второй фактор — как при обычном входе
  if (isStaff(user.role) && user.totpSecret && user.totpEnabledAt) {
    await startTwoFactor(user.id, homeFor(user.role));
    redirect("/login/2fa");
  }
  await loginAs(user.id, user.role, updated.sessionVersion);
  redirect(user.role === "CUSTOMER" ? "/account?reset=1" : homeFor(user.role));
}
