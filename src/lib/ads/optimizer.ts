import "server-only";
import { db } from "@/lib/db";
import { MIN_WEEKLY_RUB, PROVIDER, adStats, addNegativeKeywords, listAds, mskDate, resumeCampaigns, searchQueries, setWeeklyBudget, suspendAds, suspendCampaigns, switchToPayForConversion, type DirectConfig } from "@/lib/ads/direct";
import { metrikaGoalNumber } from "@/lib/metrika-api";
import { dayUtc, ordersByUtm } from "@/lib/ads/reports";

/**
 * Оптимизатор рекламы: раз в сутки (и по кнопке в CRM) читает статистику и действует как директолог.
 *  — A/B-тест текстов: в каждой группе два объявления; проигравшее по CTR при достаточной выборке останавливается.
 *  — Бюджеты: кампания, которая тратит больше трёх целевых CPA без заказов, урезается на 30 %, больше шести — ставится на паузу;
 *    кампания с CAC ниже 70 % цели и ≥3 заказами получает +25 % (не выше 1,5 планового бюджета).
 *  — Минус-слова: нецелевые поисковые запросы (выкройки, детское, маркетплейсы и т. п.) добавляются в минус-фразы.
 *  — Стратегия: при ≥10 конверсиях за 30 дней рекомендуется оплата за конверсии.
 * Уровни: auto — автопилот применяет сам; approve — ждёт кнопки в CRM; info — только подсказка.
 */

export type AdsAction =
  | { type: "pauseCampaign"; campaignId: number }
  | { type: "resumeCampaign"; campaignId: number }
  | { type: "setBudget"; campaignId: number; weeklyRub: number }
  | { type: "pauseAd"; campaignId: number; adId: number }
  | { type: "addNegatives"; campaignId: number; words: string[] }
  | { type: "switchToCpa"; campaignId: number; cpaRub: number };

export type Recommendation = { id: string; level: "auto" | "approve" | "info"; campaign: string; title: string; why: string; action?: AdsAction; appliedAt?: string; result?: string };
export type AbVariant = { adId: number; title: string; impressions: number; clicks: number; ctr: number; conversions: number; state: string };
export type AbTest = { campaign: string; adGroupId: number; variants: AbVariant[]; verdict: string };
/** Что уже меняли: бюджеты и паузы не трогаются 7 дней после изменения, минус-фразы не добавляются повторно. */
export type HistoryItem = { at: string; type: AdsAction["type"]; campaignId: number; words?: string[] };
export type OptimizerState = { ranAt: string; autopilot: boolean; days: number; recommendations: Recommendation[]; tests: AbTest[]; errors: string[]; history?: HistoryItem[] };

const KEY = "ads.optimizer";
const DAYS = 14;
/** Пауза между изменениями бюджета или остановкой одной кампании: окно статистики 14 дней, без паузы правило срабатывало бы каждую ночь. */
const COOLDOWN_DAYS = 7;
const STOP = /бесплатн|выкройк|сшить|крючк|спиц|вязан|детск|для девоч|новорожд|мужск|б\/у|\bбу\b|авито|юла|wildberries|вайлдберр|\bвб\b|ozon|озон|ламода|lamoda|\bфото|картинк|оптом|\bопт\b|секонд|аренд|прокат|ваканси|дешев|дешёв|недорог|распродаж|скидк|купальник|спортивн|пряж|с чем носить|как носить|что такое|википеди/i;

export async function loadOptimizerState(): Promise<OptimizerState | null> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  return (row?.value as OptimizerState | null) ?? null;
}

async function saveState(state: OptimizerState) {
  await db.setting.upsert({ where: { key: KEY }, update: { value: state }, create: { key: KEY, value: state } });
}

const rub = (kopecks: number) => `${Math.round(kopecks / 100).toLocaleString("ru-RU")} ₽`;
const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36);
};

const orderGoalId = () => metrikaGoalNumber("order");

/** Выполнить действие в кабинете; текст результата попадает в рекомендацию и журнал. */
export async function applyAction(cfg: DirectConfig, action: AdsAction): Promise<string> {
  switch (action.type) {
    case "pauseCampaign":
      await suspendCampaigns(cfg, [action.campaignId]);
      await db.adCampaign.updateMany({ where: { provider: PROVIDER, externalId: String(action.campaignId) }, data: { state: "SUSPENDED" } });
      return "кампания остановлена";
    case "resumeCampaign":
      await resumeCampaigns(cfg, [action.campaignId]);
      await db.adCampaign.updateMany({ where: { provider: PROVIDER, externalId: String(action.campaignId) }, data: { state: "ON" } });
      return "кампания запущена";
    case "setBudget":
      await setWeeklyBudget(cfg, action.campaignId, action.weeklyRub);
      return `недельный бюджет ${action.weeklyRub.toLocaleString("ru-RU")} ₽`;
    case "pauseAd":
      await suspendAds(cfg, [action.adId]);
      return `объявление ${action.adId} остановлено`;
    case "addNegatives": {
      const n = await addNegativeKeywords(cfg, action.campaignId, action.words);
      return `добавлено минус-фраз: ${n}`;
    }
    case "switchToCpa": {
      const goal = await orderGoalId();
      if (!goal) throw new Error("В Метрике не найдена цель «order»: нужен OAuth-токен в интеграции Метрики");
      await switchToPayForConversion(cfg, action.campaignId, goal, action.cpaRub);
      await db.adCampaign.updateMany({ where: { provider: PROVIDER, externalId: String(action.campaignId) }, data: { strategy: "PAY_FOR_CONVERSION" } });
      return `стратегия «оплата за конверсии», ${action.cpaRub.toLocaleString("ru-RU")} ₽ за заказ`;
    }
  }
}

function remember(state: OptimizerState, action: AdsAction) {
  state.history = [...(state.history ?? []), { at: new Date().toISOString(), type: action.type, campaignId: action.campaignId, ...(action.type === "addNegatives" ? { words: action.words } : {}) }];
}

/** Применить рекомендацию из сохранённого состояния по её идентификатору (кнопка в CRM). */
export async function applyRecommendation(cfg: DirectConfig, id: string) {
  const state = await loadOptimizerState();
  const rec = state?.recommendations.find((r) => r.id === id);
  if (!state || !rec?.action) throw new Error("Рекомендация устарела: обновите статистику");
  if (rec.appliedAt) return rec.result ?? "уже применено";
  const result = await applyAction(cfg, rec.action);
  rec.appliedAt = new Date().toISOString();
  rec.result = result;
  remember(state, rec.action);
  await saveState(state);
  return result;
}

/** Ручные действия из CRM (пауза, запуск, бюджет) тоже уходят в историю, чтобы оптимизатор выдержал паузу после них. */
export async function rememberManualAction(action: AdsAction) {
  const state = (await loadOptimizerState()) ?? { ranAt: new Date(0).toISOString(), autopilot: false, days: DAYS, recommendations: [], tests: [], errors: [] };
  remember(state, action);
  await saveState(state);
}

export async function runOptimizer(cfg: DirectConfig, opts: { apply: boolean }): Promise<OptimizerState> {
  const previous = await loadOptimizerState();
  const state: OptimizerState = { ranAt: new Date().toISOString(), autopilot: opts.apply, days: DAYS, recommendations: [], tests: [], errors: [], history: (previous?.history ?? []).filter((h) => Date.now() - new Date(h.at).getTime() < 2 * DAYS * 86_400_000) };
  const cooled = (campaignId: number) => (state.history ?? []).some((h) => h.campaignId === campaignId && ["setBudget", "pauseCampaign", "resumeCampaign", "switchToCpa"].includes(h.type) && Date.now() - new Date(h.at).getTime() < COOLDOWN_DAYS * 86_400_000);
  const alreadyNegative = (campaignId: number, word: string) => (state.history ?? []).some((h) => h.campaignId === campaignId && h.type === "addNegatives" && h.words?.includes(word));
  const campaigns = await db.adCampaign.findMany({ where: { provider: PROVIDER, managed: true, state: { notIn: ["DELETED", "ARCHIVED"] } } });
  if (!campaigns.length) {
    await saveState(state);
    return state;
  }
  const now = new Date();
  const to = mskDate(now);
  const from = mskDate(new Date(now.getTime() - (DAYS - 1) * 86_400_000));
  const from30 = mskDate(new Date(now.getTime() - 29 * 86_400_000));
  const period = { from: dayUtc(from), to: new Date(dayUtc(to).getTime() + 86_400_000) };
  const utms = campaigns.map((c) => c.utmCampaign).filter((u): u is string => !!u);
  const [stats, stats30, orders, goal] = await Promise.all([
    db.adStat.groupBy({ by: ["campaignId"], where: { provider: PROVIDER, date: { gte: period.from, lt: period.to } }, _sum: { impressions: true, clicks: true, cost: true, conversions: true } }),
    db.adStat.groupBy({ by: ["campaignId"], where: { provider: PROVIDER, date: { gte: dayUtc(from30), lt: period.to } }, _sum: { conversions: true, cost: true } }),
    ordersByUtm(period, utms),
    orderGoalId(),
  ]);
  const st = new Map(stats.map((s) => [s.campaignId, s._sum]));
  const st30 = new Map(stats30.map((s) => [s.campaignId, s._sum]));
  const recs = state.recommendations;
  const push = (r: Omit<Recommendation, "id">) => {
    const id = `${r.action?.type ?? "info"}-${r.action?.campaignId ?? ""}-${hash(r.title + JSON.stringify(r.action ?? {}))}`;
    // уже применённое вчера не предлагать второй раз в тот же день
    const prev = previous?.recommendations.find((p) => p.id === id && p.appliedAt && Date.now() - new Date(p.appliedAt).getTime() < 6 * 86_400_000);
    if (prev) recs.push(prev);
    else recs.push({ id, ...r });
  };

  const active = campaigns.filter((c) => c.state === "ON");
  for (const c of campaigns) {
    const s = st.get(c.externalId);
    const spend = s?.cost ?? 0;
    const clicks = s?.clicks ?? 0;
    const impressions = s?.impressions ?? 0;
    const conv = s?.conversions ?? 0;
    const o = (c.utmCampaign && orders.get(c.utmCampaign)) || { orders: 0, revenue: 0 };
    const target = c.targetCpa || cfg.targetCpa || 0;
    const weeklyRub = c.weeklyBudget ? c.weeklyBudget / 100 : null;
    const plannedRub = c.plannedWeekly ? c.plannedWeekly / 100 : weeklyRub;
    const id = Number(c.externalId);
    if (c.state !== "ON") continue;
    const cooling = cooled(id);
    // жжёт без заказов
    if (cooling && target && ((spend >= 3 * target && conv === 0 && o.orders === 0) || (o.orders >= 3 && spend / o.orders <= 0.7 * target))) {
      push({ level: "info", campaign: c.name, title: "Бюджет менялся меньше недели назад", why: `Ждём ${COOLDOWN_DAYS} дней после изменения, чтобы оценить эффект, затем снова решим по бюджету.` });
    } else if (target && spend >= 6 * target && conv === 0 && o.orders === 0) {
      push({ level: c.kind === "brand_search" ? "approve" : "auto", campaign: c.name, title: "Остановить кампанию", why: `За ${DAYS} дней потрачено ${rub(spend)} (${Math.round(spend / target)} целевых CPA), заказов нет.`, action: { type: "pauseCampaign", campaignId: id } });
    } else if (target && spend >= 3 * target && conv === 0 && o.orders === 0 && weeklyRub && weeklyRub > MIN_WEEKLY_RUB) {
      const next = Math.max(MIN_WEEKLY_RUB, Math.round((weeklyRub * 0.7) / 10) * 10);
      push({ level: "auto", campaign: c.name, title: `Снизить недельный бюджет до ${next.toLocaleString("ru-RU")} ₽`, why: `За ${DAYS} дней потрачено ${rub(spend)} при цели ${rub(target)} за заказ, заказов нет.`, action: { type: "setBudget", campaignId: id, weeklyRub: next } });
    }
    // масштабировать прибыльную
    if (!cooling && target && o.orders >= 3 && spend / o.orders <= 0.7 * target && weeklyRub && plannedRub && weeklyRub < plannedRub * 1.5) {
      const next = Math.min(Math.round((plannedRub * 1.5) / 10) * 10, Math.round((weeklyRub * 1.25) / 10) * 10);
      if (next > weeklyRub) push({ level: "auto", campaign: c.name, title: `Поднять недельный бюджет до ${next.toLocaleString("ru-RU")} ₽`, why: `${o.orders} заказов за ${DAYS} дней, CAC ${rub(spend / o.orders)} при цели ${rub(target)}.`, action: { type: "setBudget", campaignId: id, weeklyRub: next } });
    }
    // переход на оплату за конверсии
    const conv30 = st30.get(c.externalId)?.conversions ?? 0;
    const cost30 = st30.get(c.externalId)?.cost ?? 0;
    if (goal && conv30 >= 10 && c.strategy === "WB_MAXIMUM_CLICKS" && c.kind !== "retargeting") {
      const cpa = Math.round((target || cost30 / conv30) / 100);
      push({ level: "approve", campaign: c.name, title: `Перевести на оплату за конверсии (${cpa.toLocaleString("ru-RU")} ₽ за заказ)`, why: `${conv30} конверсий за 30 дней: Директу хватает данных, чтобы платить только за заказы.`, action: { type: "switchToCpa", campaignId: id, cpaRub: cpa } });
    }
    // слабый CTR на поиске
    if (c.kind !== "retargeting" && impressions >= 1000 && clicks / impressions < 0.01) {
      push({ level: "info", campaign: c.name, title: "Низкий CTR на поиске", why: `${impressions} показов, CTR ${(100 * clicks / impressions).toFixed(2)} %. Проверьте тексты объявлений и фразы: оптимизатор ждёт итогов A/B-теста.` });
    }
  }

  // A/B-тесты текстов
  const activeIds = active.map((c) => Number(c.externalId));
  if (activeIds.length) {
    try {
      const [rows, ads] = await Promise.all([adStats(cfg, from, to, goal), (async () => { const out = []; for (let i = 0; i < activeIds.length; i += 10) out.push(...(await listAds(cfg, activeIds.slice(i, i + 10)))); return out; })()]);
      const adById = new Map(ads.map((a) => [a.Id, a]));
      const nameById = new Map(campaigns.map((c) => [c.externalId, c.name]));
      const groups = new Map<number, typeof rows>();
      for (const r of rows) groups.set(r.adGroupId, [...(groups.get(r.adGroupId) ?? []), r]);
      for (const [adGroupId, list] of groups) {
        const variants: AbVariant[] = list
          .map((r) => ({ adId: r.adId, title: adById.get(r.adId)?.TextAd?.Title ?? String(r.adId), impressions: r.impressions, clicks: r.clicks, ctr: r.impressions ? r.clicks / r.impressions : 0, conversions: r.conversions, state: adById.get(r.adId)?.State ?? "—" }))
          .sort((a, b) => b.ctr - a.ctr);
        if (variants.length < 2) continue;
        const campaign = nameById.get(list[0].campaignId) ?? list[0].campaignId;
        const [winner, ...rest] = variants;
        let verdict = "идёт: мало данных";
        for (const loser of rest) {
          if (loser.state !== "ON") continue;
          const enough = winner.impressions >= 500 && loser.impressions >= 500 && winner.clicks >= 15;
          if (!enough) continue;
          if (loser.conversions > winner.conversions) {
            verdict = "расходятся: у варианта с меньшим CTR больше конверсий, ждём";
            continue;
          }
          if (loser.ctr < 0.6 * winner.ctr) {
            verdict = `победил «${winner.title}»`;
            push({ level: "auto", campaign, title: `Остановить проигравший вариант «${loser.title}»`, why: `CTR ${(100 * loser.ctr).toFixed(2)} % против ${(100 * winner.ctr).toFixed(2)} % у «${winner.title}» при ${loser.impressions}+${winner.impressions} показах.`, action: { type: "pauseAd", campaignId: Number(list[0].campaignId), adId: loser.adId } });
          } else verdict = "идёт: разница CTR пока в пределах шума";
        }
        if (rest.every((v) => v.state !== "ON")) verdict = `завершён: показывается «${winner.title}»`;
        state.tests.push({ campaign, adGroupId, variants, verdict });
      }
    } catch (e) {
      state.errors.push(`A/B-тесты: ${e instanceof Error ? e.message : e}`);
    }
    // минус-слова по поисковым запросам
    try {
      const queries = await searchQueries(cfg, from, to, goal);
      const auto = new Map<string, string[]>();
      const nameById = new Map(campaigns.map((c) => [c.externalId, c.name]));
      for (const q of queries) {
        if (q.conversions > 0 || q.clicks < 2 || alreadyNegative(q.campaignId ? Number(q.campaignId) : 0, q.query)) continue;
        if (STOP.test(q.query)) auto.set(q.campaignId, [...(auto.get(q.campaignId) ?? []), q.query]);
        else if (q.clicks >= 5 && q.cost >= (cfg.targetCpa || 300_000) * 0.5) {
          push({ level: "approve", campaign: nameById.get(q.campaignId) ?? q.campaignId, title: `Добавить минус-фразу «${q.query}»`, why: `${q.clicks} кликов на ${rub(q.cost)} без конверсий.`, action: { type: "addNegatives", campaignId: Number(q.campaignId), words: [q.query] } });
        }
      }
      for (const [campaignId, words] of auto) {
        const uniq = [...new Set(words)].slice(0, 50);
        push({ level: "auto", campaign: nameById.get(campaignId) ?? campaignId, title: `Минус-фразы: ${uniq.slice(0, 3).join(", ")}${uniq.length > 3 ? ` и ещё ${uniq.length - 3}` : ""}`, why: "Нецелевые запросы с кликами без конверсий: выкройки, детское, маркетплейсы, б/у и подобные.", action: { type: "addNegatives", campaignId: Number(campaignId), words: uniq } });
      }
    } catch (e) {
      state.errors.push(`Поисковые запросы: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (opts.apply) {
    for (const r of recs) {
      if (r.level !== "auto" || !r.action || r.appliedAt) continue;
      try {
        r.result = await applyAction(cfg, r.action);
        r.appliedAt = new Date().toISOString();
        remember(state, r.action);
      } catch (e) {
        r.result = `не применено: ${e instanceof Error ? e.message : e}`;
      }
    }
  }
  await saveState(state);
  return state;
}
