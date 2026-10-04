import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "tr_session";

async function readSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return payload as { userId: string; role: "CUSTOMER" | "SUPPORT" | "MANAGER" | "ADMIN" };
  } catch {
    return null;
  }
}

/**
 * Content-Security-Policy с nonce на каждый запрос: Next.js подставляет nonce в свои inline-скрипты,
 * наши JSON-LD берут его из заголовка x-nonce. Стили — 'unsafe-inline' из-за inline style у компонентов.
 */
function csp(nonce: string, dev: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://mc.yandex.ru https://www.googletagmanager.com${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://mc.yandex.ru https://mc.yandex.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    "frame-src https://mc.yandex.ru https://mc.yandex.com",
    "frame-ancestors 'none'",
    "form-action 'self' https://yoomoney.ru https://*.yookassa.ru",
    "base-uri 'self'",
    "object-src 'none'",
    // по http (локальный стенд) апгрейд ломал бы запросы к самому себе
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // апгрейд http→https только когда сайт действительно обслуживается по https (APP_URL)
  const policy = csp(nonce, !(process.env.APP_URL ?? "").startsWith("https://"));
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);
  const withCsp = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", policy);
    return res;
  };

  const needsAuth = pathname.startsWith("/crm") || pathname.startsWith("/account") || pathname === "/login" || pathname === "/register";
  if (needsAuth) {
    const session = await readSession(req);
    if (pathname.startsWith("/crm")) {
      if (!session) return withCsp(NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, req.url)));
      if (session.role === "CUSTOMER") return withCsp(NextResponse.redirect(new URL("/account", req.url)));
    }
    // /checkout открыт гостям: корзина в cookie, аккаунт создаётся при оформлении
    if (pathname.startsWith("/account")) {
      if (!session) return withCsp(NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, req.url)));
    }
    if ((pathname === "/login" || pathname === "/register") && session) {
      const home = session.role === "CUSTOMER" ? "/account" : session.role === "SUPPORT" ? "/crm/support" : "/crm";
      return withCsp(NextResponse.redirect(new URL(home, req.url)));
    }
  }
  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  // всё, кроме статики: CSP нужен каждой странице, проверка входа — только нужным путям
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|images/|uploads/|robots.txt|sitemap.xml).*)"],
};
