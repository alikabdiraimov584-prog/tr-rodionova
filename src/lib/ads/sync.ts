import "server-only";
import { directConfig, mskDate, syncCampaigns, syncDailyStats } from "@/lib/ads/direct";
import { runOptimizer } from "@/lib/ads/optimizer";
import { metrikaGoalNumber } from "@/lib/metrika-api";

/**
 * Ежедневная (и по кнопке) синхронизация с Директом: зеркало кампаний, статистика за последние дни,
 * затем оптимизатор. Вчерашние и позавчерашние цифры перезаписываются: Директ уточняет статистику до двух суток.
 */
export async function syncAds(opts: { days?: number; optimize?: boolean } = {}) {
  const cfg = await directConfig();
  if (!cfg) return { skipped: "интеграция выключена" };
  const days = opts.days ?? 7;
  const now = new Date();
  const campaigns = await syncCampaigns(cfg);
  const goal = await metrikaGoalNumber("order");
  const statRows = await syncDailyStats(cfg, mskDate(new Date(now.getTime() - (days - 1) * 86_400_000)), mskDate(now), goal);
  const opt = opts.optimize === false ? null : await runOptimizer(cfg, { apply: cfg.autopilot });
  return { campaigns: campaigns.total, statRows, goal: goal ?? "нет", applied: opt?.recommendations.filter((r) => r.appliedAt).length ?? 0, recommendations: opt?.recommendations.length ?? 0, ...(opt?.errors.length ? { errors: opt.errors } : {}) };
}
