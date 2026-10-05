import { runDailyJobs, runHourlyJobs } from "@/lib/jobs";

/**
 * Планировщик. Вызывается с Bearer CRON_SECRET:
 *   ежедневно   GET /api/cron            — баллы, уровни, рассылки, сверки, очистка
 *   ежечасно    GET /api/cron?job=hourly — напоминания об оплате, снятие резерва через 24 ч
 *   ежедневно   GET /api/cron?job=backup — загрузка ночного дампа базы в S3 (ключи в CRM → Интеграции)
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const job = new URL(request.url).searchParams.get("job");
  const result = job === "hourly" ? await runHourlyJobs() : job === "backup" ? await (await import("@/lib/backups")).uploadLatestBackup() : await runDailyJobs(null);
  return Response.json({ ok: true, ...result });
}
