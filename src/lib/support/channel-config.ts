import "server-only";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret, isEncrypted } from "@/lib/crypto";
import { CHANNEL_FIELDS, type ChannelConfig } from "@/lib/support/channels";
import type { Channel } from "@/generated/prisma/enums";

/**
 * Настройки каналов поддержки: секретные поля (токены, пароли приложений) хранятся в базе зашифрованными,
 * как и секреты интеграций. Старые незашифрованные значения читаются как есть и шифруются при следующем сохранении.
 */
function secretKeys(channel: Channel) {
  const fields = CHANNEL_FIELDS[channel as Exclude<Channel, "WEBSITE">] ?? [];
  return new Set(fields.filter((f) => f.secret).map((f) => f.key));
}

export function decodeChannelConfig(channel: Channel, raw: unknown): ChannelConfig {
  const secrets = secretKeys(channel);
  const out: ChannelConfig = {};
  for (const [k, v] of Object.entries((raw as Record<string, unknown>) ?? {})) {
    if (typeof v !== "string") continue;
    if (!secrets.has(k)) {
      out[k] = v;
      continue;
    }
    // секрет, зашифрованный другим AUTH_SECRET (перенос базы, смена ключа), не должен ронять все страницы CRM:
    // канал выглядит ненастроенным, а причина — в логе сервера
    try {
      out[k] = decryptSecret(v);
    } catch (e) {
      console.warn(`channel ${channel}: секрет ${k} не расшифрован (AUTH_SECRET изменился?)`, e instanceof Error ? e.message : e);
      out[k] = "";
    }
  }
  return out;
}

export function encodeChannelConfig(channel: Channel, config: Record<string, string>) {
  const secrets = secretKeys(channel);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) out[k] = secrets.has(k) && v && !isEncrypted(v) ? encryptSecret(v) : v;
  return out;
}

/** Канал с расшифрованной конфигурацией (только для серверного кода, в интерфейс не отдавать). */
export async function loadChannel(channel: Channel) {
  const row = await db.channelIntegration.findUnique({ where: { channel } });
  if (!row) return null;
  return { ...row, config: decodeChannelConfig(channel, row.config) };
}
