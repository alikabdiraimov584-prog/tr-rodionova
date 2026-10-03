import { runDailyJobs } from "@/lib/jobs";

/**
 * Ежедневные задачи лояльности. Вызывается планировщиком (cron, Vercel Cron и т. п.):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDailyJobs(null);
  return Response.json({ ok: true, ...result });
}
