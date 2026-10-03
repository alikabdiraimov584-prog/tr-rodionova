import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { ADAPTERS } from "@/lib/support/channels";
import { ingestInbound } from "@/lib/support/inbox";
import type { Channel } from "@/generated/prisma/enums";

/**
 * Единая точка входа вебхуков всех каналов:
 *   /api/webhooks/telegram/<secret>, /api/webhooks/whatsapp/<secret>, …
 * secret генерируется для каждого канала и виден администратору в «Настройки → Каналы».
 */

const CHANNELS: Record<string, Channel> = { telegram: "TELEGRAM", whatsapp: "WHATSAPP", instagram: "INSTAGRAM", vk: "VK", email: "EMAIL" };

async function resolve(params: Promise<{ channel: string; secret: string }>) {
  const { channel: slug, secret } = await params;
  const channel = CHANNELS[slug];
  if (!channel) return null;
  const integration = await db.channelIntegration.findUnique({ where: { channel } });
  if (!integration) return null;
  const a = Buffer.from(secret);
  const b = Buffer.from(integration.webhookSecret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { channel, integration };
}

export async function GET(request: Request, ctx: RouteContext<"/api/webhooks/[channel]/[secret]">) {
  const r = await resolve(ctx.params);
  if (!r) return new Response("not found", { status: 404 });
  const adapter = ADAPTERS[r.channel];
  const res = adapter?.verify?.({ config: r.integration.config as Record<string, string>, secret: r.integration.webhookSecret, rawBody: "", headers: request.headers, url: new URL(request.url) });
  return res ?? new Response("ok");
}

export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/[channel]/[secret]">) {
  const r = await resolve(ctx.params);
  if (!r) return new Response("not found", { status: 404 });
  if (!r.integration.enabled) return new Response("disabled", { status: 200 });
  const adapter = ADAPTERS[r.channel];
  if (!adapter) return new Response("unsupported", { status: 400 });
  const rawBody = await request.text();
  try {
    const { messages, response } = await adapter.parse({ config: r.integration.config as Record<string, string>, secret: r.integration.webhookSecret, rawBody, headers: request.headers, url: new URL(request.url) });
    for (const m of messages) await ingestInbound(r.channel, m);
    await db.channelIntegration.update({ where: { id: r.integration.id }, data: { lastEventAt: new Date(), ...(messages.length ? { lastError: null } : {}) } });
    return response ?? new Response("ok");
  } catch (e) {
    const error = e instanceof Error ? e.message : "parse error";
    await db.channelIntegration.update({ where: { id: r.integration.id }, data: { lastError: error } });
    // 200, чтобы провайдер не заваливал повторами битым запросом; ошибка видна в админке
    return new Response("ok");
  }
}
