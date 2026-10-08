import "server-only";
import { db } from "@/lib/db";

const CRON_KEY = "cronRuns";

/** Запомнить успешный запуск задачи планировщика (daily, hourly, mail, backup, warm). */
export async function recordCronRun(job: string, at = new Date()) {
  const row = await db.setting.findUnique({ where: { key: CRON_KEY } });
  const value = { ...((row?.value as Record<string, string> | null) ?? {}), [job]: at.toISOString() };
  await db.setting.upsert({ where: { key: CRON_KEY }, update: { value }, create: { key: CRON_KEY, value } });
}

/** Когда задачи планировщика последний раз отработали (для /api/health). */
export async function cronRuns() {
  const row = await db.setting.findUnique({ where: { key: CRON_KEY } });
  const v = (row?.value as Record<string, string> | null) ?? {};
  return { dailyAt: v.daily ?? null, hourlyAt: v.hourly ?? null, mailAt: v.mail ?? null };
}
