import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "tr_session";

async function readSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET ?? ""), { algorithms: ["HS256"] });
    return payload as { userId: string; role: "CUSTOMER" | "MANAGER" | "ADMIN" };
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await readSession(req);

  if (pathname.startsWith("/crm")) {
    if (!session) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, req.url));
    if (session.role === "CUSTOMER") return NextResponse.redirect(new URL("/account", req.url));
  }
  if (pathname.startsWith("/account") || pathname.startsWith("/checkout")) {
    if (!session) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, req.url));
  }
  if ((pathname === "/login" || pathname === "/register") && session) {
    return NextResponse.redirect(new URL(session.role === "CUSTOMER" ? "/account" : "/crm", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/crm/:path*", "/account/:path*", "/checkout/:path*", "/login", "/register"],
};
