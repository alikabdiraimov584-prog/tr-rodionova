import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/enums";
import { isSessionClaims } from "@/lib/token-claims";

export const SESSION_COOKIE = "tr_session";
const CUSTOMER_SESSION_DAYS = 30;
const STAFF_SESSION_DAYS = 7;

export type SessionPayload = {
  userId: string;
  role: Role;
  /** версия сессии пользователя: при смене пароля или блокировке старые токены перестают действовать */
  sv: number;
  expiresAt: string;
  /** сессия выдана после второго фактора (или 2FA включена в этой сессии) */
  tf?: boolean;
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET не задан или короче 32 символов");
  return new TextEncoder().encode(s);
}

export function sessionDays(role: Role) {
  return role === "CUSTOMER" ? CUSTOMER_SESSION_DAYS : STAFF_SESSION_DAYS;
}

export async function encrypt(payload: SessionPayload, days: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret());
}

export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    // токен ожидания 2FA и любой другой токен на том же ключе сессией не считается
    return isSessionClaims(payload) ? (payload as unknown as SessionPayload) : null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, role: Role, sv: number, tf = false) {
  const days = sessionDays(role);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const token = await encrypt({ userId, role, sv, expiresAt: expiresAt.toISOString(), tf }, days);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function deleteSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return decrypt(store.get(SESSION_COOKIE)?.value);
}
