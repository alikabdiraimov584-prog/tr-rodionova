"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { errorMessage, type ActionState } from "@/lib/action-result";
import { MIN_WEEKLY_RUB, PROVIDER, directConfig } from "@/lib/ads/direct";
import { createStarterCampaigns, REGIONS, type Region } from "@/lib/ads/starter";
import { applyAction, applyRecommendation, rememberManualAction } from "@/lib/ads/optimizer";
import { syncAds } from "@/lib/ads/sync";

/** Действия раздела «Реклама». Всё, что тратит деньги (создание, запуск, бюджеты), требует права adsEdit (администратор). */

async function cfgOrError() {
  const cfg = await directConfig();
  if (!cfg) throw new Error("Интеграция «Яндекс Директ» выключена или без токена: CRM → Интеграции → Реклама");
  return cfg;
}

const StarterSchema = z.object({
  monthlyBudget: z.coerce.number().min(3000, "Месячный бюджет не меньше 3 000 ₽").max(10_000_000),
  targetCpa: z.coerce.number().min(100, "Целевая стоимость заказа не меньше 100 ₽").max(1_000_000),
});

export async function createStarterCampaignsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("adsEdit");
  const parsed = StarterSchema.safeParse({ monthlyBudget: formData.get("monthlyBudget"), targetCpa: formData.get("targetCpa") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const regions = formData.getAll("regions").map(String).filter((r): r is Region => r in REGIONS);
  const categories = formData.getAll("categories").map(String).filter(Boolean);
  const brand = formData.get("brand") === "on";
  const retargeting = formData.get("retargeting") === "on";
  if (!regions.length) return { error: "Выберите регион показа" };
  if (!brand && !categories.length && !retargeting) return { error: "Выберите хотя бы одну кампанию" };
  try {
    const cfg = await cfgOrError();
    const r = await createStarterCampaigns(cfg, { monthlyBudgetRub: parsed.data.monthlyBudget, targetCpaRub: parsed.data.targetCpa, regions, categories, brand, retargeting, actorId: me.id });
    await audit(me.id, "ads.starter", "AdCampaign", null, { created: r.created, errors: r.errors, warnings: r.warnings, input: { ...parsed.data, regions, categories, brand, retargeting } });
    revalidatePath("/crm/ads");
    const parts = [r.created.length ? `Создано кампаний: ${r.created.length} (${r.created.map((c) => c.name).join(", ")}) — все на паузе.` : "Кампании не созданы.", ...r.errors.map((e) => `Ошибка: ${e}`), ...r.warnings.map((w) => `Внимание: ${w}`)];
    return r.created.length ? { ok: true, message: parts.join(" ") } : { error: parts.join(" ") };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function campaignToggleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("adsEdit");
  const campaignId = Number(formData.get("campaignId"));
  const op = String(formData.get("op"));
  if (!campaignId || (op !== "suspend" && op !== "resume")) return { error: "Неверный запрос" };
  try {
    const cfg = await cfgOrError();
    const action = { type: op === "suspend" ? "pauseCampaign" : "resumeCampaign", campaignId } as const;
    const result = await applyAction(cfg, action);
    await rememberManualAction(action);
    await audit(me.id, `ads.${op}`, "AdCampaign", String(campaignId), { result });
    revalidatePath("/crm/ads");
    return { ok: true, message: result };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function setBudgetAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("adsEdit");
  const campaignId = Number(formData.get("campaignId"));
  const weeklyRub = Math.round(Number(String(formData.get("weeklyRub") ?? "").replace(/[^\d.,]/g, "").replace(",", ".")));
  if (!campaignId) return { error: "Неверный запрос" };
  if (!weeklyRub || weeklyRub < MIN_WEEKLY_RUB) return { error: `Недельный бюджет не меньше ${MIN_WEEKLY_RUB} ₽` };
  try {
    const cfg = await cfgOrError();
    const result = await applyAction(cfg, { type: "setBudget", campaignId, weeklyRub });
    await rememberManualAction({ type: "setBudget", campaignId, weeklyRub });
    // новый план: автопилот масштабирует не выше ×1,5 от него
    await db.adCampaign.updateMany({ where: { provider: PROVIDER, externalId: String(campaignId) }, data: { plannedWeekly: weeklyRub * 100 } });
    await audit(me.id, "ads.budget", "AdCampaign", String(campaignId), { weeklyRub });
    revalidatePath("/crm/ads");
    return { ok: true, message: result };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function launchAllAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("adsEdit");
  void formData;
  try {
    const cfg = await cfgOrError();
    // OFF — кампания не остановлена вручную (модерация, нет средств): «запустить» её Директ не даст
    const paused = await db.adCampaign.findMany({ where: { provider: PROVIDER, managed: true, state: "SUSPENDED" } });
    if (!paused.length) return { error: "Нет кампаний на паузе" };
    const done: string[] = [], failed: string[] = [];
    for (const c of paused) {
      try {
        await applyAction(cfg, { type: "resumeCampaign", campaignId: Number(c.externalId) });
        done.push(c.name);
      } catch (e) {
        failed.push(`${c.name}: ${errorMessage(e)}`);
      }
    }
    await audit(me.id, "ads.launchAll", "AdCampaign", null, { done, failed });
    revalidatePath("/crm/ads");
    const msg = `Запущено: ${done.length}${failed.length ? `. Не удалось: ${failed.join("; ")}` : ""}`;
    return done.length ? { ok: true, message: msg } : { error: msg };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function syncAdsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("ads");
  void formData;
  try {
    const r = await syncAds({ days: 30 });
    await audit(me.id, "ads.sync", "AdCampaign", null, r);
    revalidatePath("/crm/ads");
    if ("skipped" in r) return { error: `Пропущено: ${r.skipped}` };
    return { ok: true, message: `Кампаний в кабинете: ${r.campaigns}, строк статистики: ${r.statRows}, рекомендаций: ${r.recommendations}, применено автопилотом: ${r.applied}${r.errors ? `. Ошибки: ${r.errors.join("; ")}` : ""}` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function applyRecommendationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("adsEdit");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Неверный запрос" };
  try {
    const cfg = await cfgOrError();
    const result = await applyRecommendation(cfg, id);
    await audit(me.id, "ads.apply", "AdCampaign", id, { result });
    revalidatePath("/crm/ads");
    return { ok: true, message: result };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
