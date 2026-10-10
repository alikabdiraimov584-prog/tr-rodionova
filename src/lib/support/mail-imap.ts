import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { db } from "@/lib/db";
import { loadChannel } from "@/lib/support/channel-config";
import { mailAuthPassed, stripQuotedReply, type ChannelConfig, type Inbound } from "@/lib/support/channels";
import { ingestInbound } from "@/lib/support/inbox";

/**
 * Входящие письма в единый inbox без внешних сервисов: раз в пять минут планировщик читает непрочитанные письма
 * ящика (IMAP, обычно imap.yandex.ru) и заводит их как сообщения поддержки. Прочитанным письмо помечается только
 * после успешной записи, поэтому сбой базы не теряет письмо — оно попадёт в следующий опрос.
 * Автоответы, уведомления о недоставке и свои же письма пропускаются.
 */
export function imapSettings(config: ChannelConfig) {
  const smtpHost = (config.smtpHost ?? "").trim();
  const host = (config.imapHost ?? "").trim() || (/yandex/i.test(smtpHost) ? "imap.yandex.ru" : smtpHost.replace(/^smtp\./, "imap."));
  const user = (config.smtpUser ?? config.from ?? "").trim();
  const pass = (config.smtpPassword ?? "").trim();
  return { host, port: 993, user, pass };
}

function headerText(parsed: ParsedMail, name: string) {
  const h = parsed.headers.get(name) as unknown;
  if (!h) return "";
  if (Array.isArray(h)) return h.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  return typeof h === "string" ? h : (h as { text?: string }).text ?? JSON.stringify(h);
}

/** Письмо, на которое не нужно заводить обращение: автоответ, отчёт о недоставке, рассылка, своё же письмо. */
export function isAutomatedMail(parsed: ParsedMail, ownAddresses: string[]) {
  const from = parsed.from?.value?.[0]?.address?.toLowerCase() ?? "";
  if (!from || ownAddresses.includes(from)) return true;
  if (/^(mailer-daemon|postmaster|no-?reply|noreply|do-?not-?reply|bounce)/i.test(from)) return true;
  const auto = headerText(parsed, "auto-submitted").toLowerCase();
  if (auto && auto !== "no") return true;
  const precedence = headerText(parsed, "precedence").toLowerCase();
  if (/bulk|auto_reply|junk|list/.test(precedence)) return true;
  if (headerText(parsed, "x-autoreply") || headerText(parsed, "x-autorespond") || headerText(parsed, "list-id")) return true;
  const type = (parsed.headers.get("content-type") as { value?: string } | undefined)?.value ?? "";
  if (/multipart\/report/i.test(type)) return true;
  return false;
}

export function inboundFromMail(parsed: ParsedMail): Inbound | null {
  const addr = parsed.from?.value?.[0]?.address?.toLowerCase() ?? "";
  const raw = (parsed.text ?? "").trim() || (parsed.html ? String(parsed.html).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");
  const text = stripQuotedReply(raw);
  if (!addr || !text) return null;
  const auth = headerText(parsed, "authentication-results") + " " + headerText(parsed, "received-spf");
  const id = (parsed.messageId ?? "").replace(/^<|>$/g, "");
  return {
    contactExternalId: addr,
    email: addr,
    name: parsed.from?.value?.[0]?.name || null,
    text,
    subject: parsed.subject ?? null,
    messageExternalId: id ? `mail_${id}` : null,
    attachments: parsed.attachments?.length ? parsed.attachments.map((a) => ({ type: a.contentType, name: a.filename })) : undefined,
    identityVerified: mailAuthPassed(auth),
  };
}

export type PollResult = { configured: boolean; fetched: number; ingested: number; skipped: number; error?: string };

/** Прочитать новые письма ящика и завести обращения. Ошибка записывается в карточку канала и не роняет планировщик. */
export async function pollMailbox(): Promise<PollResult> {
  const channel = await loadChannel("EMAIL");
  if (!channel?.enabled || !channel.config.smtpHost) return { configured: false, fetched: 0, ingested: 0, skipped: 0 };
  const s = imapSettings(channel.config);
  if (!s.host || !s.user || !s.pass) return { configured: false, fetched: 0, ingested: 0, skipped: 0, error: "IMAP не настроен" };
  const own = [channel.config.from, channel.config.smtpUser].map((x) => (x ?? "").trim().toLowerCase()).filter(Boolean);
  const client = new ImapFlow({ host: s.host, port: s.port, secure: true, auth: { user: s.user, pass: s.pass }, logger: false, socketTimeout: 60_000, connectionTimeout: 15_000 });
  const result: PollResult = { configured: true, fetched: 0, ingested: 0, skipped: 0 };
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 14 * 86_400_000);
      const uids = (await client.search({ seen: false, since }, { uid: true })) || [];
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
        if (!msg || !msg.source) continue;
        result.fetched++;
        const parsed = await simpleParser(msg.source);
        const seen = async () => client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        if (isAutomatedMail(parsed, own)) {
          result.skipped++;
          await seen();
          continue;
        }
        const inbound = inboundFromMail(parsed);
        if (!inbound) {
          result.skipped++;
          await seen();
          continue;
        }
        await ingestInbound("EMAIL", inbound);
        result.ingested++;
        await seen();
      }
    } finally {
      lock.release();
    }
    await client.logout();
    await db.channelIntegration.update({ where: { id: channel.id }, data: { lastEventAt: result.ingested ? new Date() : undefined, lastError: null } });
  } catch (e) {
    result.error = imapError(e, s.host);
    await db.channelIntegration.update({ where: { id: channel.id }, data: { lastError: result.error } }).catch(() => null);
    try { await client.logout(); } catch { /* соединение уже закрыто */ }
  }
  return result;
}

/**
 * Понятная причина отказа IMAP: ImapFlow кладёт ответ сервера не в message («Command failed»), а в responseText
 * и serverResponseCode. У Яндекса «LOGIN invalid credentials or IMAP is disabled» значит либо пароль не приложения,
 * либо в настройках ящика выключен IMAP (mail.yandex.ru → Все настройки → Почтовые программы).
 */
function imapError(e: unknown, host: string) {
  const err = e as { message?: string; responseText?: string; serverResponseCode?: string } | null;
  const text = [err?.serverResponseCode, err?.responseText].filter(Boolean).join(" ") || err?.message || "ошибка";
  if (/AUTHENTICATIONFAILED|invalid credentials|IMAP is disabled|auth|login/i.test(text)) {
    return `IMAP ${host} не принял вход (${text}): либо в ящике выключен IMAP — mail.yandex.ru → Все настройки → Почтовые программы → «С сервера imap.yandex.ru по протоколу IMAP», либо введён не пароль приложения`;
  }
  return `IMAP ${host}: ${text}`;
}

/** Проверка IMAP для кнопки в CRM: вход и состояние папки «Входящие». */
export async function checkMailbox(config: ChannelConfig): Promise<{ ok: true; info: string } | { ok: false; error: string }> {
  const s = imapSettings(config);
  if (!s.host || !s.user || !s.pass) return { ok: false, error: "IMAP не настроен: нужны сервер, логин и пароль приложения" };
  const client = new ImapFlow({ host: s.host, port: s.port, secure: true, auth: { user: s.user, pass: s.pass }, logger: false, connectionTimeout: 15_000 });
  try {
    await client.connect();
    const status = await client.status("INBOX", { messages: true, unseen: true });
    await client.logout();
    const st = status || { messages: 0, unseen: 0 };
    return { ok: true, info: `IMAP ${s.host}: вход выполнен, писем во «Входящих» ${st.messages ?? 0}, непрочитанных ${st.unseen ?? 0}` };
  } catch (e) {
    return { ok: false, error: imapError(e, s.host) };
  }
}
