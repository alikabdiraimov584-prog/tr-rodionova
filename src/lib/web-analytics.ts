import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { EventType, TrafficChannel } from "@/generated/prisma/enums";

export const VISITOR_COOKIE = "tr_vid";
export const SESSION_COOKIE_A = "tr_sid";
export const CONSENT_COOKIE = "tr_consent";
const SESSION_TTL_MIN = 30;
const HIT_REPLAY_MS = 60_000;

const SEARCH = /(^|\.)(google|yandex|ya|bing|duckduckgo|mail|rambler|yahoo)\./i;
// ИИ-ассистенты и нейропоиск: по рефереру видно, что покупательница пришла из ответа ИИ (GEO-канал)
const AI = /(^|\.)(alice\.yandex\.ru|chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|gigachat\.ru|giga\.chat|copilot\.microsoft\.com|gemini\.google\.com|claude\.ai|you\.com|mistral\.ai|chat\.deepseek\.com|deepseek\.com|grok\.com|x\.ai|poe\.com)$/i;
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
  if (AI.test(referrerHost)) return { channel: "AI", source: referrerHost.replace(/^(www|chat)\./, "") };
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

export type Hit = { path: string; eventId?: string; referrer: string | null; utm: Utm; ua: string; host: string | null; userId: string | null; trackingLinkId?: string | null };

/** Регистрирует просмотр и возвращает идентификаторы для cookie. */
export async function recordHit(hit: Hit, cookie: { visitorId: string | null; sessionId: string | null }) {
  const ua = parseUA(hit.ua);
  if (ua.bot) return null;
  const path = hit.path.slice(0, 300);
  const ev = pathToEvent(hit.path);
  let result;
  try {
    result = await db.$transaction(async (tx) => {
      const now = new Date();
      let session = cookie.sessionId ? await tx.visitorSession.findUnique({ where: { id: cookie.sessionId } }) : null;
      // без согласия на долгоживущий cookie идентификатор посетителя живёт только в рамках визита
      const visitorId = cookie.visitorId ?? session?.visitorId ?? crypto.randomUUID();
      const expired = session && now.getTime() - session.lastSeenAt.getTime() > SESSION_TTL_MIN * 60_000;
      // новая UTM-метка в середине сессии = новый визит (новая кампания)
      const newCampaign = !!(session && hit.utm.source && (session.source !== hit.utm.source.toLowerCase() || (hit.utm.campaign ?? null) !== (session.campaign ?? null)));
      const isNew = !session || expired || newCampaign || session.visitorId !== visitorId;
      if (isNew || !session) {
        let referrerHost: string | null = null;
        try {
          referrerHost = hit.referrer ? new URL(hit.referrer).hostname.toLowerCase() : null;
        } catch {
          referrerHost = null;
        }
        const { channel, source } = classify(referrerHost, hit.utm, hit.host);
        session = await tx.visitorSession.create({
          data: {
            visitorId,
            userId: hit.userId,
            landingPath: path,
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
      }
      const product = ev.slug ? await tx.product.findUnique({ where: { slug: ev.slug }, select: { id: true } }) : null;
      // При повторе id вставка откатывает и возможное создание визита, и увеличение счётчика.
      await tx.analyticsEvent.create({ data: { id: hit.eventId, sessionId: session.id, type: ev.type, path, productId: product?.id ?? null } });
      await tx.visitorSession.update({
        where: { id: session.id },
        data: { lastSeenAt: now, pageviews: { increment: 1 }, ...(hit.userId && !session.userId ? { userId: hit.userId } : {}) },
      });
      return { visitorId, sessionId: session.id, attribute: isNew || !session.userId };
    });
  } catch (error) {
    if (!hit.eventId || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const recorded = await db.analyticsEvent.findUnique({
      where: { id: hit.eventId },
      select: { path: true, type: true, createdAt: true, session: { select: { id: true, visitorId: true } } },
    });
    if (recorded?.path !== path || recorded.type !== ev.type) return null;
    if (Date.now() - recorded.createdAt.getTime() > HIT_REPLAY_MS) return null;
    if (cookie.sessionId && cookie.sessionId !== recorded.session.id) return null;
    return { visitorId: recorded.session.visitorId, sessionId: recorded.session.id };
  }
  if (hit.userId && result.attribute) await attributeFirstTouch(hit.userId, result.sessionId);
  return { visitorId: result.visitorId, sessionId: result.sessionId };
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
