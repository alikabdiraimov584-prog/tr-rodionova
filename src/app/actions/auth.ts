"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPasswordOrDummy, loginAs, logout } from "@/lib/auth";
import { checkRate, clearRate, clientIp } from "@/lib/ratelimit";
import { startTwoFactor } from "@/lib/two-factor";
import { twoFactorRequired } from "@/lib/two-factor-policy";
import { isStaff } from "@/lib/auth";
import { addPoints, recalcTier } from "@/lib/loyalty";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/action-result";
import { homeFor } from "@/lib/permissions";
import { recordConsent } from "@/lib/consent";
import { trackEvent } from "@/lib/web-analytics";
import { sendVia } from "@/lib/notifications";
import { createHash, randomInt } from "node:crypto";

function safeNext(next: FormDataEntryValue | null, fallback: string) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : fallback;
}

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Неверный email"),
  password: z.string().min(1, "Введите пароль"),
});

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = LoginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const ip = await clientIp();
  const ipKey = `login:ip:${ip ?? "unknown"}`;
  const emailKey = `login:email:${parsed.data.email}`;
  const [byIp, byEmail] = await Promise.all([checkRate(ipKey, { limit: 30, windowSec: 600, lockSec: 900 }), checkRate(emailKey, { limit: 8, windowSec: 600, lockSec: 900 })]);
  if (!byIp.ok || !byEmail.ok) return { error: "Слишком много попыток входа. Попробуйте через 15 минут." };
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // пароль сверяется даже для несуществующего email — время ответа не выдаёт, есть ли аккаунт
  if (!(await verifyPasswordOrDummy(parsed.data.password, user?.passwordHash)) || !user) {
    return { error: "Неверный email или пароль" };
  }
  if (!user.isActive) return { error: "Аккаунт отключён. Обратитесь к администратору." };
  await clearRate(emailKey);
  if (isStaff(user.role) && user.totpSecret && user.totpEnabledAt) {
    // второй фактор: сессия выдаётся только после кода из приложения
    await startTwoFactor(user.id, safeNext(formData.get("next"), homeFor(user.role)));
    redirect("/login/2fa");
  }
  await loginAs(user.id, user.role, user.sessionVersion);
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  await audit(user.id, "auth.login", "User", user.id);
  // сотруднику, для которого второй фактор обязателен, сразу показываем его настройку (адрес в строке будет точным)
  if (isStaff(user.role) && twoFactorRequired(user.role)) redirect("/crm/security?required=1");
  redirect(safeNext(formData.get("next"), homeFor(user.role)));
}

const RegisterSchema = z.object({
  firstName: z.string().trim().min(1, "Введите имя").max(60),
  lastName: z.string().trim().max(60).optional(),
  email: z.string().trim().toLowerCase().email("Неверный email"),
  phone: z.string().trim().min(10, "Введите телефон").max(20),
  password: z.string().min(8, "Пароль — минимум 8 символов"),
  birthday: z.string().optional(),
  ref: z.string().trim().optional(),
  consent: z.literal("on", { message: "Нужно согласие на обработку персональных данных" }),
  offer: z.literal("on", { message: "Нужно принять условия оферты и правила программы Circle" }),
  marketingConsent: z.string().optional(),
});

export async function registerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = RegisterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const ip = await clientIp();
  const rl = await checkRate(`register:ip:${ip ?? "unknown"}`, { limit: 10, windowSec: 3600, lockSec: 3600 });
  if (!rl.ok) return { error: "Слишком много регистраций с этого адреса. Попробуйте позже." };
  if (await db.user.findUnique({ where: { email: d.email } })) return { error: "Не удалось создать аккаунт с этим email. Если вы уже регистрировались — войдите." };
  const referrer = d.ref ? await db.user.findUnique({ where: { referralCode: d.ref } }) : null;
  const s = await getSetting("loyalty");
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: d.email,
        phone: d.phone,
        firstName: d.firstName,
        lastName: d.lastName || null,
        birthday: d.birthday ? new Date(d.birthday) : null,
        passwordHash: await hashPassword(d.password),
        referredById: referrer?.id ?? null,
        source: referrer ? "Реферальная ссылка" : "Сайт",
        marketingConsent: formData.get("marketingConsent") === "on",
      },
    });
    await recordConsent(tx, u.id, "PERSONAL_DATA", true);
    await recordConsent(tx, u.id, "OFFER", true);
    if (formData.get("marketingConsent") === "on") await recordConsent(tx, u.id, "MARKETING", true);
    await recalcTier(tx, u.id);
    await addPoints(tx, u.id, "EARN_WELCOME", s.welcomePoints, { comment: "Добро пожаловать в T.Rodionova Circle" });
    await audit(u.id, "auth.register", "User", u.id, { referrer: referrer?.id ?? null }, tx);
    return u;
  });
  await loginAs(user.id, user.role, user.sessionVersion);
  await trackEvent("REGISTER", { userId: user.id });
  redirect(safeNext(formData.get("next"), "/account?welcome=1"));
}

export async function logoutAction() {
  await logout();
  redirect("/");
}


const CODE_TTL_MIN = 10;
const codeHash = (email: string, code: string) => createHash("sha256").update(`${email}:${code}:${process.env.AUTH_SECRET ?? ""}`).digest("hex");

/** Шаг 1 входа по коду: письмо с 6-значным кодом. Ответ одинаковый, есть аккаунт или нет. */
export async function requestLoginCodeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Неверный email" };
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([checkRate(`code:ip:${ip ?? "unknown"}`, { limit: 20, windowSec: 600, lockSec: 900 }), checkRate(`code:email:${email}`, { limit: 5, windowSec: 600, lockSec: 900 })]);
  if (!byIp.ok || !byEmail.ok) return { error: "Слишком много запросов. Попробуйте через 15 минут." };
  const channel = await db.channelIntegration.findUnique({ where: { channel: "EMAIL" }, select: { enabled: true } });
  if (!channel?.enabled) return { error: "Вход по коду пока недоступен: войдите по паролю или восстановите его." };
  const user = await db.user.findUnique({ where: { email }, select: { id: true, isActive: true, firstName: true } });
  if (user?.isActive) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.loginCode.create({ data: { email, codeHash: codeHash(email, code), expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000) } });
    const brand = await getSetting("brand");
    await sendVia("EMAIL", email, `${user.firstName}, здравствуйте.\n\nКод для входа на сайт ${brand.name}: ${code}\nДействует ${CODE_TTL_MIN} минут. Если вы не запрашивали вход, просто не используйте код.`, `Код входа: ${code}`);
  }
  return { ok: true, message: "Если аккаунт с этим e-mail существует, код отправлен на почту" };
}

/** Шаг 2: проверка кода, не более 5 попыток на код. */
export async function verifyLoginCodeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { error: "Введите 6 цифр из письма" };
  const rec = await db.loginCode.findFirst({ where: { email, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!rec || rec.attempts >= 5) return { error: "Код устарел. Запросите новый." };
  if (rec.codeHash !== codeHash(email, code)) {
    await db.loginCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    return { error: "Неверный код" };
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return { error: "Аккаунт не найден" };
  await db.loginCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  if (isStaff(user.role)) return { error: "Сотрудники входят по паролю и коду из приложения" };
  await loginAs(user.id, user.role, user.sessionVersion);
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  await audit(user.id, "auth.login", "User", user.id, { via: "code" });
  redirect(safeNext(formData.get("next"), "/account"));
}
