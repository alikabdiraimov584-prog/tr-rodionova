import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { checkRate, clientIp } from "@/lib/ratelimit";
import { recordHit, VISITOR_COOKIE, SESSION_COOKIE_A, CONSENT_COOKIE } from "@/lib/web-analytics";

const YEAR = 365 * 24 * 3600;
const MAX_BODY_BYTES = 16 * 1024;

async function readBoundedBody(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function urlParts(value: string) {
  try {
    const url = new URL(value, "https://analytics.invalid");
    return { pathname: url.pathname, referrer: url.origin === "https://analytics.invalid" ? null : `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = await clientIp();
  const rate = await checkRate(`analytics:${ip ?? "unknown"}`, { limit: 120, windowSec: 60, lockSec: 60 });
  if (!rate.ok) return new NextResponse(null, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec), "Cache-Control": "no-store" } });
  // Собственная обезличенная статистика ведётся всегда (законный интерес, IP не хранится).
  // Согласие «all» включает только долгоживущий cookie посетителя (повторные визиты) и внешние счётчики.
  const consentAll = req.cookies.get(CONSENT_COOKIE)?.value === "all";
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return new NextResponse(null, { status: 413, headers: { "Cache-Control": "no-store" } });
  let body: { path?: string; referrer?: string; utm?: Record<string, string> };
  try {
    const raw = await readBoundedBody(req, MAX_BODY_BYTES);
    if (raw === null) return new NextResponse(null, { status: 413, headers: { "Cache-Control": "no-store" } });
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return new NextResponse(null, { status: 400 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const rawPath = typeof body.path === "string" ? body.path.slice(0, 2048) : "/";
  const parsedPath = urlParts(rawPath);
  const path = (parsedPath?.pathname ?? "/").slice(0, 512);
  // Reset links carry bearer tokens in the path; never store them in analytics or referrer records.
  if (path.startsWith("/crm") || path.startsWith("/api") || /^\/reset(?:\/|$)/.test(path)) return new NextResponse(null, { status: 204 });
  const rawReferrer = typeof body.referrer === "string" ? body.referrer.slice(0, 2048) : "";
  const parsedReferrer = rawReferrer ? urlParts(rawReferrer) : null;
  const safeReferrer = parsedReferrer && !/^\/reset(?:\/|$)/.test(parsedReferrer.pathname) ? parsedReferrer.referrer : null;
  const auth = await getSession();
  const utm = body.utm ?? {};
  const res = await recordHit(
    {
      path,
      referrer: safeReferrer,
      utm: { source: utm.utm_source, medium: utm.utm_medium, campaign: utm.utm_campaign, content: utm.utm_content, term: utm.utm_term },
      ua: req.headers.get("user-agent") ?? "",
      host: req.headers.get("host")?.split(":")[0] ?? null,
      userId: auth?.userId ?? null,
      trackingLinkId: req.cookies.get("tr_link")?.value ?? null,
    },
    { visitorId: consentAll ? (req.cookies.get(VISITOR_COOKIE)?.value ?? null) : null, sessionId: req.cookies.get(SESSION_COOKIE_A)?.value ?? null },
  );
  const out = new NextResponse(null, { status: 204 });
  if (res) {
    const secure = process.env.NODE_ENV === "production";
    if (consentAll) out.cookies.set(VISITOR_COOKIE, res.visitorId, { maxAge: YEAR, sameSite: "lax", secure, httpOnly: true, path: "/" });
    else if (req.cookies.get(VISITOR_COOKIE)) out.cookies.delete(VISITOR_COOKIE);
    out.cookies.set(SESSION_COOKIE_A, res.sessionId, { maxAge: 30 * 60, sameSite: "lax", secure, httpOnly: true, path: "/" });
    if (req.cookies.get("tr_link")) out.cookies.delete("tr_link");
  }
  return out;
}
