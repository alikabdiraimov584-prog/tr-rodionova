import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { EventType, TrafficChannel } from "@/generated/prisma/enums";

export const VISITOR_COOKIE = "tr_vid";
export const SESSION_COOKIE_A = "tr_sid";
export const CONSENT_COOKIE = "tr_consent";
const SESSION_TTL_MIN = 30;

const SEARCH = /(^|\.)(google|yandex|ya|bing|duckduckgo|mail|rambler|yahoo)\./i;
const SOCIAL = /(^|\.)(instagram|facebook|fb|vk|vkontakte|t|telegram|pinterest|tiktok|youtube|threads|dzen|ok|whatsapp|wa)\.(com|ru|me|org)$/i;
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse|headless|curl|wget|python-requests/i;

export type Utm = { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null; term?: string | null };

export function classify(referrerHost: string | null, utm: Utm, ownHost: string | null): { channel: TrafficChannel; source: string | null } {
  const medium = (utm.medium ?? "").toLowerCase();
  const source = (utm.source ?? "").toLowerCase() || null;
  if (source) {
    if (/cpc|ppc|paid|ads|display|banner|target/.test(medium)) return { channel: "PAID", source };
    if (/email|newsletter|mail/.test(medium)) return { channel: "EMAIL", source };
    if (/social|smm|stories|bio|post|messenger|chat/.test(medium) || /instagram|telegram|vk|tiktok|pinterest|youtube|whatsapp|threads/.test(source)) return { channel: "SOCIAL", source };
    if (/organic|seo/.test(medium)) return { channel: "ORGANIC", source };
    if (/referral|partner|blogger|influencer/.test(medium)) return { channel: "REFERRAL", source };
    return { channel: "INTERNAL", source };
  }
  if (!referrerHost || (ownHost && referrerHost === ownHost)) return { channel: "DIRECT", source: null };
  if (SEARCH.test(referrerHost)) return { channel: "ORGANIC", source: referrerHost.replace(/^www\./, "") };
  if (SOCIAL.test(referrerHost)) return { channel: "SOCIAL", source: referrerHost.replace(/^(www|m|l)\./, "") };
  return { channel: "REFERRAL", source: referrerHost.replace(/^www\./, "") };
}

export function parseUA(ua: string) {
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobile|iphone|android/i.test(ua) ? "mobile" : "desktop";
  const browser = /yabrowser/i.test(ua) ? "Yandex" : /edg\//i.test(ua) ? "Edge" : /opr\//i.test(ua) ? "Opera" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : /firefox/i.test(ua) ? "Firefox" : "Другой";
  const os = /iphone|ipad|ios/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "Другая";
  return { device, browser, os, bot: BOT.test(ua) };
}

export function pathToEvent(path: string): { type: EventType; slug?: string } {
  const m = path.match(/^\/product\/([^/?#]+)/);
  if (m) return { type: "PRODUCT_VIEW", slug: m[1] };
  if (path.startsWith("/checkout")) return { type: "CHECKOUT_START" };
  return { type: "PAGEVIEW" };
}

export type Hit = { path: string; referrer: string | null; utm: Utm; ua: string; host: string | null; userId: string | null; trackingLinkId?: string | null };

/** Регистрирует просмотр. Возвращает id сессии и флаг, нужно ли выставить cookie. */
export async function recordHit(hit: Hit, cookie: { visitorId: string | null; sessionId: string | null }) {
  const ua = parseUA(hit.ua);
  if (ua.bot) return null;
  const now = new Date();
  let session = cookie.sessionId ? await db.visitorSession.findUnique({ where: { id: cookie.sessionId } }) : null;
  // без согласия на долгоживущий cookie идентификатор посетителя живёт только в рамках визита
  const visitorId = cookie.visitorId ?? session?.visitorId ?? crypto.randomUUID();
  const expired = session && now.getTime() - session.lastSeenAt.getTime() > SESSION_TTL_MIN * 60_000;
  // новая UTM-метка в середине сессии = новый визит (новая кампания)
  const newCampaign = session && hit.utm.source && (session.source !== hit.utm.source.toLowerCase() || (hit.utm.campaign ?? null) !== (session.campaign ?? null));
  if (!session || expired || newCampaign || session.visitorId !== visitorId) {
    let referrerHost: string | null = null;
    try {
      referrerHost = hit.referrer ? new URL(hit.referrer).hostname.toLowerCase() : null;
    } catch {
      referrerHost = null;
    }
    const { channel, source } = classify(referrerHost, hit.utm, hit.host);
    session = await db.visitorSession.create({
      data: {
        visitorId,
        userId: hit.userId,
        landingPath: hit.path.slice(0, 300),
        referrer: hit.referrer?.slice(0, 500) ?? null,
        referrerHost: referrerHost && hit.host !== referrerHost ? referrerHost : null,
        channel,
        source,
        medium: hit.utm.medium?.toLowerCase().slice(0, 100) ?? null,
        campaign: hit.utm.campaign?.slice(0, 150) ?? null,
        content: hit.utm.content?.slice(0, 150) ?? null,
        term: hit.utm.term?.slice(0, 150) ?? null,
        trackingLinkId: hit.trackingLinkId ?? null,
        device: ua.device,
        browser: ua.browser,
        os: ua.os,
      },
    });
    if (hit.userId) await attributeFirstTouch(hit.userId, session.id);
  }
  const ev = pathToEvent(hit.path);
  const product = ev.slug ? await db.product.findUnique({ where: { slug: ev.slug }, select: { id: true } }) : null;
  await db.$transaction([
    db.visitorSession.update({ where: { id: session.id }, data: { lastSeenAt: now, pageviews: { increment: 1 }, ...(hit.userId && !session.userId ? { userId: hit.userId } : {}) } }),
    db.analyticsEvent.create({ data: { sessionId: session.id, type: ev.type, path: hit.path.slice(0, 300), productId: product?.id ?? null } }),
  ]);
  if (hit.userId && !session.userId) await attributeFirstTouch(hit.userId, session.id);
  return { visitorId, sessionId: session.id };
}

/** Первое касание: источник первой известной сессии клиента (не перезаписывается). */
export async function attributeFirstTouch(userId: string, sessionId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { firstChannel: true } });
  if (!u || u.firstChannel) return;
  const first = await db.visitorSession.findFirst({ where: { OR: [{ userId }, { id: sessionId }] }, orderBy: { startedAt: "asc" } });
  if (!first) return;
  await db.user.update({ where: { id: userId }, data: { firstChannel: first.channel, firstSource: first.source, firstMedium: first.medium, firstCampaign: first.campaign } });
}

/** Текущая сессия аналитики из cookie (для server actions). */
export async function currentSession() {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE_A)?.value;
  if (!sid) return null;
  return db.visitorSession.findUnique({ where: { id: sid } });
}

export async function trackEvent(type: EventType, data: { productId?: string | null; orderId?: string | null; value?: number | null; userId?: string | null } = {}) {
  const session = await currentSession();
  if (!session) return null;
  await db.analyticsEvent.create({ data: { sessionId: session.id, type, productId: data.productId ?? null, orderId: data.orderId ?? null, value: data.value ?? null } });
  if (data.userId && !session.userId) {
    await db.visitorSession.update({ where: { id: session.id }, data: { userId: data.userId } });
    await attributeFirstTouch(data.userId, session.id);
  }
  return session;
}
