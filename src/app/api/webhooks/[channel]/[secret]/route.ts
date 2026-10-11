import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { ADAPTERS } from "@/lib/support/channels";
import { decodeChannelConfig } from "@/lib/support/channel-config";
import { ingestInbound } from "@/lib/support/inbox";
import type { Channel } from "@/generated/prisma/enums";

/**
 * Единая точка входа вебхуков всех каналов:
 *   /api/webhooks/telegram/<secret>, /api/webhooks/whatsapp/<secret>, …
 * secret генерируется для каждого канала и виден администратору в «Настройки → Каналы».
 */

const CHANNELS: Record<string, Channel> = { telegram: "TELEGRAM", whatsapp: "WHATSAPP", instagram: "INSTAGRAM", vk: "VK", email: "EMAIL" };

/** Читаем поток с жёстким пределом памяти; content-length не обязателен и может быть подделан. */
async function readBoundedBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
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
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

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
  const res = adapter?.verify?.({ config: decodeChannelConfig(r.channel, r.integration.config), secret: r.integration.webhookSecret, rawBody: "", headers: request.headers, url: new URL(request.url) });
  return res ?? new Response("ok");
}

export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/[channel]/[secret]">) {
  const r = await resolve(ctx.params);
  if (!r) return new Response("not found", { status: 404 });
  if (!r.integration.enabled) return new Response("disabled", { status: 200 });
  const adapter = ADAPTERS[r.channel];
  if (!adapter) return new Response("unsupported", { status: 400 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  const MAX_BODY_BYTES = 1024 * 1024;
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return new Response("payload too large", { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  const rawBody = await readBoundedBody(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return new Response("payload too large or invalid UTF-8", { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const { messages, response } = await adapter.parse({ config: decodeChannelConfig(r.channel, r.integration.config), secret: r.integration.webhookSecret, rawBody, headers: request.headers, url: new URL(request.url) });
    for (const m of messages) await ingestInbound(r.channel, m);
    await db.channelIntegration.update({ where: { id: r.integration.id }, data: { lastEventAt: new Date(), ...(messages.length ? { lastError: null } : {}) } });
    return response ?? new Response("ok");
  } catch {
    // Third-party parsers may include payload fragments or credentials in exception messages.
    // Keep a generic diagnostic in the CRM rather than persisting untrusted request data.
    await db.channelIntegration.update({ where: { id: r.integration.id }, data: { lastError: "Webhook processing failed; inspect provider configuration and retry" } });
    // 200, чтобы провайдер не заваливал повторами битым запросом; ошибка видна в админке
    return new Response("ok");
  }
}
