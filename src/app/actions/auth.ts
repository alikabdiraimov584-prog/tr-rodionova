"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPasswordOrDummy, loginAs, logout } from "@/lib/auth";
import { checkRate, clearRate, clientIp } from "@/lib/ratelimit";
import { addPoints, recalcTier } from "@/lib/loyalty";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/action-result";
import { homeFor } from "@/lib/permissions";
import { recordConsent } from "@/lib/consent";
import { trackEvent } from "@/lib/web-analytics";

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
  await loginAs(user.id, user.role, user.sessionVersion);
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  await audit(user.id, "auth.login", "User", user.id);
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
