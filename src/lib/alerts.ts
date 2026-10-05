import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { activeIntegration, recordCheck } from "@/lib/integrations/store";

/**
 * Тревоги владельцу в Telegram: сбой автообновления, неудачный дамп базы, устаревшая копия в S3, упавшие ночные задачи.
 * Бот и chat id задаются в CRM → Интеграции → «Тревоги в Telegram». Одна и та же тревога не повторяется чаще,
 * чем раз в REPEAT_HOURS, чтобы ночной сбой не превращался в поток сообщений.
 */
const STATE_KEY = "alertState";
const REPEAT_HOURS = 6;
const PREFIX = "⚠️ tr-rodionova.ru: ";

type AlertState = Record<string, string>; // ключ тревоги → время последней отправки

export async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!r.ok || !data.ok) throw new Error(data.description ?? `Telegram ответил ${r.status}`);
}

/** Проверка из CRM: отправляет пробное сообщение по введённым полям. */
export async function testTelegramAlerts(config: Record<string, string>) {
  if (!config.botToken || !config.chatId) return { ok: false as const, error: "Укажите токен бота и chat id" };
  try {
    await sendTelegramMessage(config.botToken, config.chatId, "Проверка связи: сюда будут приходить тревоги с сайта T.Rodionova (сбой обновления, бэкапов, ночных задач).");
    return { ok: true as const, info: "Пробное сообщение отправлено — проверьте Telegram" };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Telegram недоступен" };
  }
}

/**
 * Отправить тревогу. key — идентификатор повторяющейся проблемы (по умолчанию хэш текста);
 * force — отправить, даже если такая уже уходила недавно.
 */
export async function sendAlert(text: string, opts: { key?: string; force?: boolean } = {}): Promise<{ sent: boolean; reason?: string }> {
  const i = await activeIntegration("telegram_alerts");
  if (!i || !i.config.botToken || !i.config.chatId) return { sent: false, reason: "Telegram не настроен" };
  const key = opts.key ?? createHash("sha1").update(text).digest("hex").slice(0, 12);
  const row = await db.setting.findUnique({ where: { key: STATE_KEY } });
  const state = ((row?.value as AlertState | null) ?? {}) as AlertState;
  const last = state[key] ? Date.parse(state[key]) : 0;
  if (!opts.force && Date.now() - last < REPEAT_HOURS * 3_600_000) return { sent: false, reason: "такая тревога уже отправлялась недавно" };
  try {
    await sendTelegramMessage(i.config.botToken, i.config.chatId, PREFIX + text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ошибка отправки";
    await recordCheck("telegram_alerts", false, msg);
    return { sent: false, reason: msg };
  }
  // храним не больше 50 последних ключей
  const next: AlertState = Object.fromEntries(Object.entries({ ...state, [key]: new Date().toISOString() }).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 50));
  await db.setting.upsert({ where: { key: STATE_KEY }, update: { value: next }, create: { key: STATE_KEY, value: next } });
  return { sent: true };
}
