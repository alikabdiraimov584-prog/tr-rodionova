import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { allowedWithoutTwoFactor, twoFactorRequired } from "@/lib/two-factor-policy";

const SESSION_COOKIE = "tr_session";

async function readSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return payload as { userId: string; role: "CUSTOMER" | "SUPPORT" | "MANAGER" | "ADMIN"; tf?: boolean };
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
    // платёжные страницы касс: форма оформления до загрузки скриптов уходит обычным POST, и редирект на оплату
    // проверяется этим правилом (ЮKassa, CloudPayments orders.cloudpayments.ru, Долями)
    "form-action 'self' https://yoomoney.ru https://*.yookassa.ru https://*.cloudpayments.ru https://dolyame.ru https://*.dolyame.ru",
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
      // обязательная 2FA: администратор и менеджер без второго фактора видят только страницу его настройки
      if (twoFactorRequired(session.role) && session.tf !== true && !allowedWithoutTwoFactor(pathname)) {
        return withCsp(NextResponse.redirect(new URL("/crm/security?required=1", req.url)));
      }
    }
    // /checkout открыт гостям: корзина в cookie, аккаунт создаётся при оформлении
    if (pathname.startsWith("/account")) {
      if (!session) return withCsp(NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, req.url)));
      // у сотрудника нет клиентского кабинета: предлагаем войти под клиентским аккаунтом, а не уводим в CRM
      if (session.role !== "CUSTOMER") return withCsp(NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}&as=customer`, req.url)));
    }
    // уже вошедшие не видят форму входа; регистрация закрыта только для клиенток (у них аккаунт уже есть),
    // сотрудник может завести отдельный клиентский аккаунт, не попадая в CRM
    // вошедшая клиентка не видит формы входа и регистрации; сотрудник может войти под клиентским аккаунтом
    if (session && session.role === "CUSTOMER" && (pathname === "/login" || pathname === "/register")) {
      return withCsp(NextResponse.redirect(new URL("/account", req.url)));
    }
  }
  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  // всё, кроме статики: CSP нужен каждой странице, проверка входа — только нужным путям
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|images/|uploads/|robots.txt|sitemap.xml).*)"],
};
