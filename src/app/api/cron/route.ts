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
  const job = new URL(request.url).searchParams.get("job") ?? "daily";
  try {
    let result: Record<string, unknown>;
    if (job === "hourly") result = await runHourlyJobs();
    else if (job === "backup") {
      const backups = await import("@/lib/backups");
      result = { ...(await backups.uploadLatestBackup()), ...(await backups.checkBackupHealth()) };
    } else result = await runDailyJobs(null);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`cron ${job} failed:`, e);
    await (await import("@/lib/alerts")).sendAlert(`задача планировщика «${job}» упала: ${msg}`, { key: `cron-${job}` }).catch(() => null);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
