import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Channel } from "@/generated/prisma/enums";

/**
 * Адаптеры каналов. Каждый умеет:
 *  - parse: превратить вебхук провайдера в унифицированные входящие сообщения;
 *  - send: отправить ответ сотрудника обратно в канал.
 *
 * WhatsApp и Instagram поддерживают два провайдера:
 *  - "meta"   — официальные WhatsApp Cloud API / Instagram Messaging API;
 *  - "wazzup" — агрегатор Wazzup24 (популярен у российских брендов, когда прямой доступ к Meta API недоступен).
 */

export type Inbound = {
  contactExternalId: string;
  name?: string | null;
  username?: string | null;
  phone?: string | null;
  email?: string | null;
  text: string;
  messageExternalId?: string | null;
  subject?: string | null;
  attachments?: { type: string; url?: string; name?: string }[];
};

export type ChannelConfig = Record<string, string | undefined>;
export type SendResult = { ok: true; externalId?: string } | { ok: false; error: string };

export type ParseResult = { messages: Inbound[]; response?: Response };

export type WebhookContext = { config: ChannelConfig; secret: string; rawBody: string; headers: Headers; url: URL };

function safeEq(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function verifyMetaSignature(ctx: WebhookContext) {
  const appSecret = ctx.config.appSecret;
  if (!appSecret) return true; // подпись не настроена — защищает секрет в URL
  const sig = ctx.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", appSecret).update(ctx.rawBody).digest("hex");
  return safeEq(sig, expected);
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* пустой ответ */
  }
  return { status: res.status, json };
}

// ───────────── Telegram Bot API ─────────────

type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    caption?: string;
    contact?: { phone_number: string };
    photo?: unknown[];
    document?: { file_name?: string };
  };
};

const telegram = {
  async parse(ctx: WebhookContext): Promise<ParseResult> {
    const header = ctx.headers.get("x-telegram-bot-api-secret-token");
    if (header !== null && !safeEq(header, ctx.secret)) return { messages: [], response: new Response("forbidden", { status: 403 }) };
    const u = JSON.parse(ctx.rawBody) as TgUpdate;
    const m = u.message;
    if (!m || m.chat.type !== "private") return { messages: [] };
    const text = m.text ?? m.caption ?? (m.contact ? `📱 Поделилась номером: ${m.contact.phone_number}` : m.photo ? "📷 Фото" : m.document ? `📎 ${m.document.file_name ?? "Файл"}` : "");
    if (!text) return { messages: [] };
    return {
      messages: [
        {
          contactExternalId: String(m.chat.id),
          name: [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || null,
          username: m.from?.username ? `@${m.from.username}` : null,
          phone: m.contact?.phone_number ?? null,
          text,
          messageExternalId: `tg_${m.message_id}`,
        },
      ],
    };
  },
  async send(config: ChannelConfig, to: string, text: string): Promise<SendResult> {
    if (!config.botToken) return { ok: false, error: "Не задан токен бота" };
    const { json } = await postJson(`https://api.telegram.org/bot${config.botToken}/sendMessage`, { chat_id: to, text });
    const r = json as { ok?: boolean; description?: string; result?: { message_id: number } };
    return r?.ok ? { ok: true, externalId: `tg_${r.result?.message_id}` } : { ok: false, error: r?.description ?? "Ошибка Telegram" };
  },
};

// ───────────── WhatsApp ─────────────

type MetaWa = { entry?: { changes?: { value?: { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: { from: string; id: string; type: string; text?: { body: string } }[] } }[] }[] };
type WazzupHook = { messages?: { messageId: string; chatType: string; chatId: string; text?: string; isEcho?: boolean; type?: string; contact?: { name?: string; phone?: string; username?: string } }[] };

function parseWazzup(raw: string, chatTypes: string[]): Inbound[] {
  const body = JSON.parse(raw) as WazzupHook;
  return (body.messages ?? [])
    .filter((m) => !m.isEcho && chatTypes.includes(m.chatType))
    .map((m) => ({
      contactExternalId: m.chatId,
      name: m.contact?.name ?? null,
      username: m.contact?.username ?? null,
      phone: m.chatType === "whatsapp" ? m.chatId : m.contact?.phone ?? null,
      text: m.text || (m.type ? `[${m.type}]` : ""),
      messageExternalId: `wz_${m.messageId}`,
    }))
    .filter((m) => m.text);
}

async function sendWazzup(config: ChannelConfig, chatType: string, to: string, text: string): Promise<SendResult> {
  if (!config.apiKey || !config.channelId) return { ok: false, error: "Не заданы ключ API и channelId Wazzup" };
  const { status, json } = await postJson("https://api.wazzup24.com/v3/message", { channelId: config.channelId, chatType, chatId: to, text }, { Authorization: `Bearer ${config.apiKey}` });
  const r = json as { messageId?: string; error?: string; description?: string };
  return status < 300 ? { ok: true, externalId: r?.messageId ? `wz_${r.messageId}` : undefined } : { ok: false, error: r?.description ?? r?.error ?? `Wazzup: HTTP ${status}` };
}

function metaVerify(ctx: WebhookContext): Response | null {
  if (ctx.url.searchParams.get("hub.mode") !== "subscribe") return null;
  const token = ctx.url.searchParams.get("hub.verify_token") ?? "";
  const ok = !!ctx.config.verifyToken && safeEq(token, ctx.config.verifyToken);
  return ok ? new Response(ctx.url.searchParams.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 });
}

const whatsapp = {
  verify: metaVerify,
  async parse(ctx: WebhookContext): Promise<ParseResult> {
    if (ctx.config.provider === "wazzup") return { messages: parseWazzup(ctx.rawBody, ["whatsapp"]) };
    if (!verifyMetaSignature(ctx)) return { messages: [], response: new Response("bad signature", { status: 403 }) };
    const body = JSON.parse(ctx.rawBody) as MetaWa;
    const out: Inbound[] = [];
    for (const e of body.entry ?? [])
      for (const c of e.changes ?? []) {
        const names = new Map((c.value?.contacts ?? []).map((x) => [x.wa_id, x.profile?.name]));
        for (const m of c.value?.messages ?? []) {
          out.push({ contactExternalId: m.from, phone: m.from, name: names.get(m.from) ?? null, text: m.text?.body ?? `[${m.type}]`, messageExternalId: `wa_${m.id}` });
        }
      }
    return { messages: out };
  },
  async send(config: ChannelConfig, to: string, text: string): Promise<SendResult> {
    if (config.provider === "wazzup") return sendWazzup(config, "whatsapp", to, text);
    if (!config.accessToken || !config.phoneNumberId) return { ok: false, error: "Не заданы accessToken и phoneNumberId" };
    const { status, json } = await postJson(
      `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`,
      { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
      { Authorization: `Bearer ${config.accessToken}` },
    );
    const r = json as { messages?: { id: string }[]; error?: { message: string } };
    return status < 300 ? { ok: true, externalId: r.messages?.[0]?.id ? `wa_${r.messages[0].id}` : undefined } : { ok: false, error: r?.error?.message ?? `HTTP ${status}` };
  },
};

// ───────────── Instagram Direct ─────────────

type MetaIg = { entry?: { messaging?: { sender: { id: string }; message?: { mid: string; text?: string; is_echo?: boolean; attachments?: { type: string }[] } }[] }[] };

const instagram = {
  verify: metaVerify,
  async parse(ctx: WebhookContext): Promise<ParseResult> {
    if (ctx.config.provider === "wazzup") return { messages: parseWazzup(ctx.rawBody, ["instagram"]) };
    if (!verifyMetaSignature(ctx)) return { messages: [], response: new Response("bad signature", { status: 403 }) };
    const body = JSON.parse(ctx.rawBody) as MetaIg;
    const out: Inbound[] = [];
    for (const e of body.entry ?? [])
      for (const ev of e.messaging ?? []) {
        if (!ev.message || ev.message.is_echo) continue;
        out.push({ contactExternalId: ev.sender.id, text: ev.message.text ?? (ev.message.attachments?.length ? `[${ev.message.attachments[0].type}]` : ""), messageExternalId: `ig_${ev.message.mid}` });
      }
    return { messages: out.filter((m) => m.text) };
  },
  async send(config: ChannelConfig, to: string, text: string): Promise<SendResult> {
    if (config.provider === "wazzup") return sendWazzup(config, "instagram", to, text);
    if (!config.accessToken) return { ok: false, error: "Не задан accessToken" };
    const base = config.apiBase || "https://graph.facebook.com/v21.0";
    const { status, json } = await postJson(`${base}/me/messages`, { recipient: { id: to }, message: { text } }, { Authorization: `Bearer ${config.accessToken}` });
    const r = json as { message_id?: string; error?: { message: string } };
    return status < 300 ? { ok: true, externalId: r.message_id ? `ig_${r.message_id}` : undefined } : { ok: false, error: r?.error?.message ?? `HTTP ${status}` };
  },
};

// ───────────── ВКонтакте (Callback API) ─────────────

type VkHook = { type: string; group_id?: number; secret?: string; object?: { message?: { id: number; from_id: number; peer_id: number; text: string; attachments?: { type: string }[] } } };

const vk = {
  async parse(ctx: WebhookContext): Promise<ParseResult> {
    const body = JSON.parse(ctx.rawBody) as VkHook;
    if (ctx.config.secret && body.secret !== ctx.config.secret) return { messages: [], response: new Response("forbidden", { status: 403 }) };
    if (body.type === "confirmation") return { messages: [], response: new Response(ctx.config.confirmationCode ?? "") };
    const m = body.object?.message;
    if (body.type !== "message_new" || !m) return { messages: [], response: new Response("ok") };
    return {
      messages: [{ contactExternalId: String(m.peer_id), text: m.text || (m.attachments?.length ? `[${m.attachments[0].type}]` : ""), messageExternalId: `vk_${m.id}`, username: `id${m.from_id}` }].filter((x) => x.text),
      response: new Response("ok"),
    };
  },
  async send(config: ChannelConfig, to: string, text: string): Promise<SendResult> {
    if (!config.accessToken) return { ok: false, error: "Не задан токен сообщества" };
    const params = new URLSearchParams({ access_token: config.accessToken, v: "5.199", peer_id: to, random_id: String(Date.now()), message: text });
    const res = await fetch("https://api.vk.com/method/messages.send", { method: "POST", body: params, signal: AbortSignal.timeout(10_000) });
    const r = (await res.json()) as { response?: number; error?: { error_msg: string } };
    return r.response ? { ok: true, externalId: `vk_${r.response}` } : { ok: false, error: r.error?.error_msg ?? "Ошибка VK" };
  },
};

// ───────────── Email (входящие: Postmark Inbound / любой JSON-вебхук) ─────────────

type MailHook = { From?: string; FromName?: string; FromFull?: { Email: string; Name?: string }; Subject?: string; TextBody?: string; StrippedTextReply?: string; MessageID?: string; from?: string; subject?: string; text?: string };

const email = {
  async parse(ctx: WebhookContext): Promise<ParseResult> {
    const b = JSON.parse(ctx.rawBody) as MailHook;
    const addr = (b.FromFull?.Email ?? b.From ?? b.from ?? "").replace(/.*<([^>]+)>.*/, "$1").trim().toLowerCase();
    const text = (b.StrippedTextReply || b.TextBody || b.text || "").trim();
    if (!addr || !text) return { messages: [] };
    return { messages: [{ contactExternalId: addr, email: addr, name: b.FromFull?.Name ?? b.FromName ?? null, text, subject: b.Subject ?? b.subject ?? null, messageExternalId: b.MessageID ? `mail_${b.MessageID}` : null }] };
  },
  async send(config: ChannelConfig, to: string, text: string, subject?: string | null): Promise<SendResult> {
    if (!config.postmarkToken || !config.from) return { ok: false, error: "Не настроена отправка почты (Postmark)" };
    const { status, json } = await postJson(
      "https://api.postmarkapp.com/email",
      { From: config.from, To: to, Subject: subject ? `Re: ${subject.replace(/^re:\s*/i, "")}` : "T.Rodionova", TextBody: text },
      { "X-Postmark-Server-Token": config.postmarkToken, Accept: "application/json" },
    );
    const r = json as { MessageID?: string; Message?: string };
    return status < 300 ? { ok: true, externalId: r.MessageID ? `mail_${r.MessageID}` : undefined } : { ok: false, error: r?.Message ?? `HTTP ${status}` };
  },
};

// ───────────── SMS (smsc.ru, только исходящие) ─────────────

const sms = {
  async parse(): Promise<ParseResult> {
    return { messages: [] };
  },
  async send(config: ChannelConfig, to: string, text: string): Promise<SendResult> {
    if (!config.login || !config.password) return { ok: false, error: "Не заданы логин и пароль smsc.ru" };
    const params = new URLSearchParams({ login: config.login, psw: config.password, phones: to, mes: text, sender: config.sender ?? "", fmt: "3", charset: "utf-8" });
    const res = await fetch(`https://smsc.ru/sys/send.php?${params}`, { signal: AbortSignal.timeout(10_000) });
    const r = (await res.json()) as { id?: number; error?: string; error_code?: number };
    return r.id ? { ok: true, externalId: `sms_${r.id}` } : { ok: false, error: r.error ?? "Ошибка smsc.ru" };
  },
};

type Adapter = {
  parse: (ctx: WebhookContext) => Promise<ParseResult>;
  send: (config: ChannelConfig, to: string, text: string, subject?: string | null) => Promise<SendResult>;
  verify?: (ctx: WebhookContext) => Response | null;
};

export const ADAPTERS: Partial<Record<Channel, Adapter>> = {
  TELEGRAM: telegram,
  WHATSAPP: whatsapp,
  INSTAGRAM: instagram,
  VK: vk,
  EMAIL: email,
  SMS: sms,
};

/** Поля настройки каждого канала для админки. secret: true — не показываем значение после сохранения. */
export const CHANNEL_FIELDS: Record<Exclude<Channel, "WEBSITE">, { key: string; label: string; secret?: boolean; hint?: string }[]> = {
  TELEGRAM: [{ key: "botToken", label: "Токен бота (@BotFather)", secret: true }],
  WHATSAPP: [
    { key: "provider", label: "Провайдер", hint: "meta или wazzup" },
    { key: "accessToken", label: "Meta: access token", secret: true },
    { key: "phoneNumberId", label: "Meta: phone number ID" },
    { key: "verifyToken", label: "Meta: verify token" },
    { key: "appSecret", label: "Meta: app secret (подпись)", secret: true },
    { key: "apiKey", label: "Wazzup: API-ключ", secret: true },
    { key: "channelId", label: "Wazzup: channelId" },
  ],
  INSTAGRAM: [
    { key: "provider", label: "Провайдер", hint: "meta или wazzup" },
    { key: "accessToken", label: "Meta: page/IG access token", secret: true },
    { key: "verifyToken", label: "Meta: verify token" },
    { key: "appSecret", label: "Meta: app secret (подпись)", secret: true },
    { key: "apiKey", label: "Wazzup: API-ключ", secret: true },
    { key: "channelId", label: "Wazzup: channelId" },
  ],
  VK: [
    { key: "accessToken", label: "Ключ доступа сообщества", secret: true },
    { key: "confirmationCode", label: "Строка подтверждения Callback API" },
    { key: "secret", label: "Секретный ключ Callback API", secret: true },
  ],
  EMAIL: [
    { key: "from", label: "Адрес отправителя", hint: "care@t-rodionova.ru" },
    { key: "postmarkToken", label: "Postmark server token", secret: true },
  ],
  SMS: [
    { key: "login", label: "smsc.ru: логин" },
    { key: "password", label: "smsc.ru: пароль", secret: true },
    { key: "sender", label: "Имя отправителя", hint: "TRodionova" },
  ],
};
