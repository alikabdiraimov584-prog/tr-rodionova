import "server-only";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { byKey } from "@/lib/integrations/registry";

export type IntegrationState = { key: string; enabled: boolean; config: Record<string, string>; lastCheckAt: Date | null; lastCheckOk: boolean | null; lastError: string | null };

function decode(key: string, raw: Record<string, string>) {
  const def = byKey.get(key);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const secret = def?.fields.find((f) => f.key === k)?.secret;
    if (!secret || typeof v !== "string") {
      out[k] = String(v ?? "");
      continue;
    }
    // секрет под другим AUTH_SECRET (перенос базы, смена ключа) — интеграция выглядит ненастроенной, CRM не падает
    try {
      out[k] = decryptSecret(v);
    } catch (e) {
      console.warn(`integration ${key}: секрет ${k} не расшифрован (AUTH_SECRET изменился?)`, e instanceof Error ? e.message : e);
      out[k] = "";
    }
  }
  return out;
}

/** Расшифрованная конфигурация интеграции (только для серверного кода). */
export async function getIntegration(key: string): Promise<IntegrationState | null> {
  const row = await db.integration.findUnique({ where: { key } });
  if (!row) return null;
  return { key, enabled: row.enabled, config: decode(key, (row.config as Record<string, string>) ?? {}), lastCheckAt: row.lastCheckAt, lastCheckOk: row.lastCheckOk, lastError: row.lastError };
}

/** Включённая интеграция с конфигурацией, иначе null. */
export async function activeIntegration(key: string) {
  const i = await getIntegration(key);
  return i?.enabled ? i : null;
}

/** Сохранить поля: секреты шифруются; пустое значение секрета не трогает сохранённое. */
export async function saveIntegration(key: string, input: Record<string, string>, clear: string[], enabled: boolean) {
  const def = byKey.get(key);
  if (!def) throw new Error("Неизвестная интеграция");
  const row = await db.integration.findUnique({ where: { key } });
  const config = { ...((row?.config as Record<string, string>) ?? {}) };
  for (const f of def.fields) {
    const v = (input[f.key] ?? "").trim();
    if (clear.includes(f.key)) {
      delete config[f.key];
      continue;
    }
    if (v) config[f.key] = f.secret ? encryptSecret(v) : v;
    else if (!f.secret) delete config[f.key];
  }
  await db.integration.upsert({ where: { key }, update: { config, enabled }, create: { key, config, enabled } });
  return Object.keys(config);
}

export async function recordCheck(key: string, ok: boolean, error?: string | null) {
  await db.integration.upsert({
    where: { key },
    update: { lastCheckAt: new Date(), lastCheckOk: ok, lastError: error ?? null },
    create: { key, lastCheckAt: new Date(), lastCheckOk: ok, lastError: error ?? null },
  });
}

/** Для интерфейса: какие поля заполнены, без значений секретов. */
export async function listIntegrationStates() {
  const rows = await db.integration.findMany();
  const map = new Map<string, { enabled: boolean; filled: Record<string, string | true>; lastCheckAt: Date | null; lastCheckOk: boolean | null; lastError: string | null }>();
  for (const r of rows) {
    const def = byKey.get(r.key);
    const cfg = (r.config as Record<string, string>) ?? {};
    const filled: Record<string, string | true> = {};
    for (const [k, v] of Object.entries(cfg)) {
      const secret = def?.fields.find((f) => f.key === k)?.secret;
      filled[k] = secret ? true : String(v);
    }
    map.set(r.key, { enabled: r.enabled, filled, lastCheckAt: r.lastCheckAt, lastCheckOk: r.lastCheckOk, lastError: r.lastError });
  }
  return map;
}
