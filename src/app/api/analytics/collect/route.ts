import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { recordHit, VISITOR_COOKIE, SESSION_COOKIE_A, CONSENT_COOKIE } from "@/lib/web-analytics";

const YEAR = 365 * 24 * 3600;

export async function POST(req: NextRequest) {
  if (req.cookies.get(CONSENT_COOKIE)?.value !== "all") return new NextResponse(null, { status: 204 });
  let body: { path?: string; referrer?: string; utm?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const path = typeof body.path === "string" ? body.path : "/";
  if (path.startsWith("/crm") || path.startsWith("/api")) return new NextResponse(null, { status: 204 });
  const auth = await getSession();
  const utm = body.utm ?? {};
  const res = await recordHit(
    {
      path,
      referrer: typeof body.referrer === "string" ? body.referrer : null,
      utm: { source: utm.utm_source, medium: utm.utm_medium, campaign: utm.utm_campaign, content: utm.utm_content, term: utm.utm_term },
      ua: req.headers.get("user-agent") ?? "",
      host: req.headers.get("host")?.split(":")[0] ?? null,
      userId: auth?.userId ?? null,
      trackingLinkId: req.cookies.get("tr_link")?.value ?? null,
    },
    { visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, sessionId: req.cookies.get(SESSION_COOKIE_A)?.value ?? null },
  );
  const out = new NextResponse(null, { status: 204 });
  if (res) {
    const secure = process.env.NODE_ENV === "production";
    out.cookies.set(VISITOR_COOKIE, res.visitorId, { maxAge: YEAR, sameSite: "lax", secure, httpOnly: true, path: "/" });
    out.cookies.set(SESSION_COOKIE_A, res.sessionId, { maxAge: 30 * 60, sameSite: "lax", secure, httpOnly: true, path: "/" });
    if (req.cookies.get("tr_link")) out.cookies.delete("tr_link");
  }
  return out;
}
