import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * Защита от перебора на базе таблицы RateLimit (работает при нескольких инстансах).
 * limit попыток за window секунд; при превышении ключ блокируется на lock секунд.
 */
export async function checkRate(key: string, opts: { limit: number; windowSec: number; lockSec?: number }) {
  const now = new Date();
  const lockSec = opts.lockSec ?? opts.windowSec;
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (row?.lockedUntil && row.lockedUntil > now) return { ok: false as const, retryAfterSec: Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000) };
  const inWindow = row && now.getTime() - row.windowStart.getTime() < opts.windowSec * 1000;
  const count = (inWindow ? row.count : 0) + 1;
  if (count > opts.limit) {
    await db.rateLimit.upsert({ where: { key }, update: { count, lockedUntil: new Date(now.getTime() + lockSec * 1000) }, create: { key, count, lockedUntil: new Date(now.getTime() + lockSec * 1000) } });
    return { ok: false as const, retryAfterSec: lockSec };
  }
  await db.rateLimit.upsert({
    where: { key },
    update: inWindow ? { count } : { count: 1, windowStart: now, lockedUntil: null },
    create: { key, count: 1, windowStart: now },
  });
  return { ok: true as const };
}

/** Сбросить счётчик после успешного входа. */
export async function clearRate(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}

/** IP клиента: последний адрес в X-Forwarded-For добавлен доверенным прокси, остальные мог подставить клиент. */
export async function clientIp() {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    return parts[parts.length - 1] ?? null;
  }
  return h.get("x-real-ip") ?? null;
}

/** Удалить устаревшие счётчики (вызывается ежедневной задачей). */
export async function purgeRateLimits() {
  const border = new Date(Date.now() - 86_400_000);
  const r = await db.rateLimit.deleteMany({ where: { windowStart: { lt: border }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] } });
  return r.count;
}
