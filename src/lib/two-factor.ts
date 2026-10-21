import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { matchTotp } from "@/lib/totp";
import { isPendingTwoFactorClaims, PENDING_2FA_PURPOSE } from "@/lib/token-claims";

export const PENDING_2FA_COOKIE = "tr_2fa";
const PENDING_MIN = 5;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET не задан или короче 32 символов");
  return new TextEncoder().encode(s);
}

/** Токен «пароль верен, ждём код». Метка purpose не даёт выдать его за сессию и наоборот. */
export async function signPendingTwoFactor(userId: string, next: string | null) {
  return new SignJWT({ userId, next: next ?? "", purpose: PENDING_2FA_PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_MIN}m`)
    .sign(secret());
}

export async function readPendingTwoFactor(token: string | undefined): Promise<{ userId: string; next?: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return isPendingTwoFactorClaims(payload) ? { userId: payload.userId, next: payload.next } : null;
  } catch {
    return null;
  }
}

/** После проверки пароля сотрудника с включённой 2FA: короткая cookie «ожидает код». */
export async function startTwoFactor(userId: string, next: string | null) {
  const token = await signPendingTwoFactor(userId, next);
  const store = await cookies();
  store.set(PENDING_2FA_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: PENDING_MIN * 60, path: "/" });
}

/**
 * Проверка кода с защитой от повтора: код принимается в окне ±30 с, поэтому без отметки подсмотренный
 * или перехваченный код работал бы ещё до полутора минут. Использованный шаг пишется в RateLimit
 * (ключ уникален, второй insert падает); ежедневная очистка удаляет отметки старше суток.
 */
export async function acceptTotp(userId: string, totpSecret: string, input: string, time = Date.now()) {
  const step = matchTotp(totpSecret, input, time);
  if (step === null) return false;
  try {
    await db.rateLimit.create({ data: { key: `totp-used:${userId}:${step}`, count: 1 } });
    return true;
  } catch {
    return false;
  }
}
