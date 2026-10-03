import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Короткая трекинговая ссылка: /go/stories-aw26 → /catalog?utm_source=instagram&utm_medium=stories&utm_campaign=aw26 */
export async function GET(req: NextRequest, ctx: RouteContext<"/go/[slug]">) {
  const { slug } = await ctx.params;
  const link = await db.trackingLink.findUnique({ where: { slug } });
  if (!link || !link.isActive) return NextResponse.redirect(new URL("/", req.url));
  await db.trackingLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });
  const url = new URL(link.targetPath, req.url);
  url.searchParams.set("utm_source", link.source);
  url.searchParams.set("utm_medium", link.medium);
  if (link.campaign) url.searchParams.set("utm_campaign", link.campaign);
  if (link.content) url.searchParams.set("utm_content", link.content);
  const res = NextResponse.redirect(url);
  res.cookies.set("tr_link", link.id, { maxAge: 600, sameSite: "lax", path: "/" });
  return res;
}
