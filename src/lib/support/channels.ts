import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
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
  /**
   * false — отправитель не подтверждён провайдером (например, письмо без SPF/DKIM):
   * такой контакт не привязывается к клиентке автоматически и не может отписать её от рассылок.
   */
  identityVerified?: boolean;
};

export type ChannelConfig = Record<string, string | undefined>;
export type SendResult = { ok: true; externalId?: string } | { ok: false; error: string };
/** Параметры отправки: ответ в переписке (тема с Re:, ссылка на исходное письмо), ссылка отписки для рассылок. */
export type SendOptions = { reply?: boolean; inReplyTo?: string | null; unsubscribeUrl?: string | null };

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

// ───────────── Email: отправка по SMTP (Яндекс 360, любой почтовый сервер) или через Postmark; входящие — IMAP-опрос или Postmark Inbound ─────────────

type MailHook = { From?: string; FromName?: string; FromFull?: { Email: string; Name?: string }; Subject?: string; TextBody?: string; StrippedTextReply?: string; MessageID?: string; Headers?: { Name: string; Value: string }[]; from?: string; subject?: string; text?: string };

/** Адрес From в письме легко подделать: считаем отправителя подтверждённым только при SPF или DKIM pass. */
export function mailAuthPassed(authResults: string) {
  const auth = authResults.toLowerCase();
  return /\b(spf|dkim)=pass\b/.test(auth) || /^pass\b/.test(auth);
}

function mailSenderVerified(b: MailHook) {
  const auth = (b.Headers ?? []).filter((h) => /^(authentication-results|received-spf)$/i.test(h.Name)).map((h) => h.Value).join(" ");
  return mailAuthPassed(auth);
}

/**
 * Текст ответа без процитированного письма: почтовые программы вставляют исходное сообщение после строки
 * «… написал(а):» / «On … wrote:» / «-----Original Message-----» или строками с «>». В inbox нужен только новый текст.
 */
export function stripQuotedReply(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  const cut = lines.findIndex((l, i) =>
    /^\s*>/.test(l) ||
    /^-{2,}\s*(Original Message|Исходное сообщение|Пересылаемое сообщение|Forwarded message)/i.test(l) ||
    /^(From|От|Sent|Отправлено):\s/.test(l) ||
    /^(On|В|Вт|Ср|Чт|Пт|Сб|Вс|Пн|сб|вс|пн|вт|ср|чт|пт)\b.*(wrote|написал(\(а\)|а|и)?):?\s*$/.test(l) ||
    (/(написал(\(а\)|а|и)?|wrote):\s*$/.test(l) && i > 0 && lines[i + 1] !== undefined),
  );
  const body = (cut >= 0 ? lines.slice(0, cut) : lines).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return body.replace(/\n(--|__)\s*\n[\s\S]*$/, "").trim() || text.trim();
}

/** Адрес и порт SMTP из настроек канала; 465 — TLS сразу, 587/25 — STARTTLS. */
export function smtpSettings(config: ChannelConfig) {
  const host = (config.smtpHost ?? "").trim();
  const port = Number(config.smtpPort) || 465;
  const user = (config.smtpUser ?? config.from ?? "").trim();
  const pass = (config.smtpPassword ?? "").trim();
  return { host, port, user, pass, secure: port === 465 };
}

export function smtpTransport(config: ChannelConfig) {
  const s = smtpSettings(config);
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: { user: s.user, pass: s.pass },
    requireTLS: !s.secure && !/^(localhost|127\.0\.0\.1)$/.test(s.host),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

function fromHeader(config: ChannelConfig) {
  const from = (config.from ?? "").trim();
  const name = (config.fromName ?? "").trim();
  return name ? { name, address: from } : from;
}

const email = {
  async parse(ctx: WebhookContext): Promise<ParseResult> {
    const b = JSON.parse(ctx.rawBody) as MailHook;
    const addr = (b.FromFull?.Email ?? b.From ?? b.from ?? "").replace(/.*<([^>]+)>.*/, "$1").trim().toLowerCase();
    const text = (b.StrippedTextReply || b.TextBody || b.text || "").trim();
    if (!addr || !text) return { messages: [] };
    return { messages: [{ contactExternalId: addr, email: addr, name: b.FromFull?.Name ?? b.FromName ?? null, text, subject: b.Subject ?? b.subject ?? null, messageExternalId: b.MessageID ? `mail_${b.MessageID}` : null, identityVerified: mailSenderVerified(b) }] };
  },
  async send(config: ChannelConfig, to: string, text: string, subject?: string | null, opts: SendOptions = {}): Promise<SendResult> {
    const from = (config.from ?? "").trim();
    const finalSubject = subject ? (opts.reply ? `Re: ${subject.replace(/^re:\s*/i, "")}` : subject) : "T.Rodionova";
    if (config.smtpHost) {
      const s = smtpSettings(config);
      if (!from || !s.user || !s.pass) return { ok: false, error: "Не заполнены адрес отправителя, логин или пароль приложения SMTP" };
      try {
        const info = await smtpTransport(config).sendMail({
          from: fromHeader(config),
          to,
          subject: finalSubject,
          text,
          ...(opts.inReplyTo ? { inReplyTo: opts.inReplyTo, references: opts.inReplyTo } : {}),
          ...(opts.unsubscribeUrl ? { list: { unsubscribe: { url: opts.unsubscribeUrl, comment: "Отписаться" } } } : {}),
        });
        const id = (info.messageId ?? "").replace(/^<|>$/g, "");
        return { ok: true, externalId: id ? `mail_${id}` : undefined };
      } catch (e) {
        return { ok: false, error: smtpError(e) };
      }
    }
    if (!config.postmarkToken || !from) return { ok: false, error: "Не настроена отправка почты: укажите SMTP-сервер и пароль приложения (или Postmark server token)" };
    const { status, json } = await postJson(
      "https://api.postmarkapp.com/email",
      { From: from, To: to, Subject: finalSubject, TextBody: text, ...(opts.unsubscribeUrl ? { Headers: [{ Name: "List-Unsubscribe", Value: `<${opts.unsubscribeUrl}>` }] } : {}) },
      { "X-Postmark-Server-Token": config.postmarkToken, Accept: "application/json" },
    );
    const r = json as { MessageID?: string; Message?: string };
    return status < 300 ? { ok: true, externalId: r.MessageID ? `mail_${r.MessageID}` : undefined } : { ok: false, error: r?.Message ?? `HTTP ${status}` };
  },
};

/** Понятная причина сбоя SMTP вместо кода библиотеки. */
export function smtpError(e: unknown) {
  const err = e as { code?: string; responseCode?: number; message?: string };
  if (err.responseCode === 535 || /auth/i.test(err.code ?? "")) return "SMTP не принял логин или пароль: нужен пароль приложения из Яндекс ID, а не пароль от ящика";
  if (err.code === "ESOCKET" || err.code === "ECONNECTION" || err.code === "ETIMEDOUT") return `Нет соединения с SMTP-сервером (${err.message ?? err.code})`;
  if (err.code === "EENVELOPE") return `Сервер отклонил адрес: ${err.message ?? ""}`.trim();
  return err.message ?? "Ошибка отправки";
}

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
  send: (config: ChannelConfig, to: string, text: string, subject?: string | null, opts?: SendOptions) => Promise<SendResult>;
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
    { key: "from", label: "Адрес отправителя", hint: "care@tr-rodionova.ru" },
    { key: "fromName", label: "Имя отправителя", hint: "T.Rodionova" },
    { key: "smtpHost", label: "SMTP-сервер", hint: "smtp.yandex.ru" },
    { key: "smtpPort", label: "SMTP-порт", hint: "465" },
    { key: "smtpUser", label: "Логин SMTP и IMAP (полный адрес)", hint: "care@tr-rodionova.ru" },
    { key: "smtpPassword", label: "Пароль приложения", secret: true, hint: "Яндекс ID → Безопасность → Пароли приложений → Почта" },
    { key: "imapHost", label: "IMAP-сервер (ответы клиенток в CRM)", hint: "imap.yandex.ru" },
    { key: "postmarkToken", label: "Postmark server token (только если вместо SMTP)", secret: true },
  ],
  SMS: [
    { key: "login", label: "smsc.ru: логин" },
    { key: "password", label: "smsc.ru: пароль", secret: true },
    { key: "sender", label: "Имя отправителя", hint: "TRodionova" },
  ],
};
