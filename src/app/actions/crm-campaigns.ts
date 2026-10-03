"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { buildAudience, runCampaign, sendOne, personalize, type Segment } from "@/lib/campaigns";
import { audit } from "@/lib/audit";
import { errorMessage, type ActionState } from "@/lib/action-result";
import type { Channel } from "@/generated/prisma/enums";

async function baseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

function parseSegment(formData: FormData): Segment {
  const list = (k: string) => formData.getAll(k).map(String).filter(Boolean);
  const num = (k: string) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const str = (k: string) => String(formData.get(k) ?? "").trim() || undefined;
  return {
    tiers: list("tiers"),
    rfm: list("rfm") as Segment["rfm"],
    tags: str("tags")?.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    sources: list("sources"),
    sizes: list("sizes"),
    minLifetime: num("minLifetime"),
    maxLifetime: num("maxLifetime"),
    lastOrderMinDays: num("lastOrderMinDays"),
    lastOrderMaxDays: num("lastOrderMaxDays"),
    registeredDays: num("registeredDays"),
    birthdayMonth: num("birthdayMonth"),
    hasPoints: num("hasPoints"),
    pointsExpiringDays: num("pointsExpiringDays"),
    waitlist: formData.get("waitlist") === "on" || undefined,
    wishlist: formData.get("wishlist") === "on" || undefined,
    cartAbandoned: formData.get("cartAbandoned") === "on" || undefined,
    viewedProductId: str("viewedProductId"),
    productBought: str("productBought"),
    categoryBought: str("categoryBought"),
    marketing: formData.get("transactional") === "on" ? false : undefined,
  };
}

export async function previewAudienceAction(segment: Segment, channel: Channel) {
  await requireSection("campaigns");
  const { rows, total, noAddress } = await buildAudience(segment, channel, { limit: 8 });
  return { total, noAddress, sample: rows.map((r) => `${r.firstName} ${r.lastName ?? ""} · ${r.tier ?? ""}${r.address ? "" : " · нет адреса"}`) };
}

const Schema = z.object({
  name: z.string().trim().min(1, "Название"),
  channel: z.enum(["EMAIL", "TELEGRAM", "WHATSAPP", "SMS", "WEBSITE"]),
  subject: z.string().trim().optional(),
  text: z.string().trim().min(1, "Текст"),
  scheduledAt: z.string().optional(),
  withLink: z.string().optional(),
  linkTarget: z.string().optional(),
});

export async function saveCampaignAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("campaigns");
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Заполните поле «${parsed.error.issues[0].message}»` };
  const d = parsed.data;
  if (d.channel === "EMAIL" && !d.subject) return { error: "Для email нужна тема письма" };
  if (d.channel === "SMS" && d.text.length > 300) return { error: "SMS: до 300 символов" };
  const segment = parseSegment(formData);
  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "draft"); // draft | schedule | send
  const { total } = await buildAudience(segment, d.channel as Channel);
  let trackingLinkId: string | null = (String(formData.get("trackingLinkId") ?? "") || null);
  if (d.withLink === "on" && !trackingLinkId) {
    const slug = `c-${Date.now().toString(36)}`;
    const link = await db.trackingLink.create({
      data: { slug, name: `Рассылка: ${d.name}`, targetPath: d.linkTarget?.startsWith("/") ? d.linkTarget : "/catalog", source: d.channel.toLowerCase(), medium: "campaign", campaign: d.name.slice(0, 60), createdBy: me.id },
    });
    trackingLinkId = link.id;
  }
  const data = {
    name: d.name,
    channel: d.channel as Channel,
    subject: d.subject || null,
    text: d.text,
    segment,
    audienceCount: total,
    trackingLinkId,
    scheduledAt: mode === "schedule" && d.scheduledAt ? new Date(d.scheduledAt) : null,
    status: (mode === "schedule" && d.scheduledAt ? "SCHEDULED" : "DRAFT") as "SCHEDULED" | "DRAFT",
    createdBy: me.id,
  };
  let campaignId = id;
  try {
    if (id) {
      const existing = await db.campaign.findUniqueOrThrow({ where: { id } });
      if (existing.status === "SENT" || existing.status === "SENDING") return { error: "Отправленную рассылку нельзя менять" };
      await db.campaign.update({ where: { id }, data });
    } else {
      campaignId = (await db.campaign.create({ data })).id;
    }
    await audit(me.id, id ? "campaign.update" : "campaign.create", "Campaign", campaignId, { name: d.name, channel: d.channel, audience: total, mode });
    if (mode === "send") {
      if (total === 0) return { error: "Аудитория пуста" };
      await runCampaign(campaignId, await baseUrl());
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/crm/campaigns");
  redirect(`/crm/campaigns/${campaignId}`);
}

export async function sendTestAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("campaigns");
  const channel = String(formData.get("channel")) as Channel;
  const text = String(formData.get("text") ?? "");
  const subject = String(formData.get("subject") ?? "") || null;
  if (!text.trim()) return { error: "Введите текст" };
  const link = await baseUrl();
  const body = personalize(text, { firstName: me.firstName, tier: "Privé", points: 12_500 }, `${link}/go/test`, channel === "EMAIL" ? `Отписаться: ${link}/unsubscribe/…` : channel === "WEBSITE" ? null : "Чтобы отписаться, ответьте СТОП.");
  let address: string | null = null;
  if (channel === "EMAIL") address = me.email;
  else if (channel === "WEBSITE") address = me.id;
  else if (channel === "SMS" || channel === "WHATSAPP") address = (me.phone ?? "").replace(/\D/g, "") || null;
  else {
    const c = await db.contact.findFirst({ where: { channel, userId: me.id } });
    address = c?.externalId ?? null;
  }
  if (!address) return { error: `У вас нет адреса в канале ${channel}: укажите телефон в профиле или напишите боту с вашего аккаунта` };
  const r = await sendOne(channel, address, body, subject, me.id);
  return r.ok ? { ok: true, message: `Тест отправлен: ${address}` } : { error: r.error };
}

export async function sendCampaignNowAction(formData: FormData) {
  const me = await requireSection("campaigns");
  const id = String(formData.get("id"));
  await audit(me.id, "campaign.send", "Campaign", id);
  await runCampaign(id, await baseUrl());
  revalidatePath(`/crm/campaigns/${id}`);
}

export async function cancelCampaignAction(formData: FormData) {
  const me = await requireSection("campaigns");
  const id = String(formData.get("id"));
  await db.campaign.updateMany({ where: { id, status: { in: ["DRAFT", "SCHEDULED"] } }, data: { status: "CANCELLED" } });
  await audit(me.id, "campaign.cancel", "Campaign", id);
  revalidatePath("/crm/campaigns");
}

export async function duplicateCampaignAction(formData: FormData) {
  const me = await requireSection("campaigns");
  const c = await db.campaign.findUniqueOrThrow({ where: { id: String(formData.get("id")) } });
  const n = await db.campaign.create({ data: { name: `${c.name} (копия)`, channel: c.channel, subject: c.subject, text: c.text, segment: c.segment ?? {}, createdBy: me.id } });
  redirect(`/crm/campaigns/${n.id}/edit`);
}
