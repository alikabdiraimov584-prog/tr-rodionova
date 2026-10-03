import "server-only";
import { cookies } from "next/headers";
import { SignJWT } from "jose";

export const PENDING_2FA_COOKIE = "tr_2fa";
const PENDING_MIN = 5;

/** После проверки пароля сотрудника с включённой 2FA: короткая cookie «ожидает код». */
export async function startTwoFactor(userId: string, next: string | null) {
  const token = await new SignJWT({ userId, next: next ?? "" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_MIN}m`)
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET ?? ""));
  const store = await cookies();
  store.set(PENDING_2FA_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: PENDING_MIN * 60, path: "/" });
}
