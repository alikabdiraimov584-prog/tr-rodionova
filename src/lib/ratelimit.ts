import "server-only";
import { headers } from "next/headers";
import { isIP } from "node:net";
import { db } from "@/lib/db";

/**
 * Защита от перебора на базе таблицы RateLimit (работает при нескольких инстансах).
 * Advisory lock сериализует конкурентные проверки одного ключа до конца транзакции.
 */
export async function checkRate(key: string, opts: { limit: number; windowSec: number; lockSec?: number }) {
  const lockSec = opts.lockSec ?? opts.windowSec;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const now = new Date();
    const row = await tx.rateLimit.findUnique({ where: { key } });
    if (row?.lockedUntil && row.lockedUntil > now) {
      return { ok: false as const, retryAfterSec: Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000) };
    }
    const inWindow = !!row && now.getTime() - row.windowStart.getTime() < opts.windowSec * 1000;
    const count = (inWindow ? row!.count : 0) + 1;
    if (count > opts.limit) {
      const lockedUntil = new Date(now.getTime() + lockSec * 1000);
      await tx.rateLimit.upsert({
        where: { key },
        update: { count, lockedUntil, ...(inWindow ? {} : { windowStart: now }) },
        create: { key, count, windowStart: now, lockedUntil },
      });
      return { ok: false as const, retryAfterSec: lockSec };
    }
    await tx.rateLimit.upsert({
      where: { key },
      update: inWindow ? { count } : { count, windowStart: now, lockedUntil: null },
      create: { key, count, windowStart: now },
    });
    return { ok: true as const };
  });
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
    const candidate = parts[parts.length - 1] ?? "";
    return isIP(candidate) ? candidate : null;
  }
  const realIp = h.get("x-real-ip")?.trim() ?? "";
  return isIP(realIp) ? realIp : null;
}

/** Удалить устаревшие счётчики (вызывается ежедневной задачей). */
export async function purgeRateLimits() {
  const border = new Date(Date.now() - 86_400_000);
  const r = await db.rateLimit.deleteMany({ where: { windowStart: { lt: border }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] } });
  return r.count;
}
