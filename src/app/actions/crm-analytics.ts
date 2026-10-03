"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/action-result";

const LinkSchema = z.object({
  name: z.string().trim().min(1, "Название"),
  slug: z.string().trim().min(2, "Короткий адрес").max(40).regex(/^[a-z0-9-]+$/, "Адрес: латиница, цифры и дефис"),
  targetPath: z.string().trim().min(1, "Куда ведёт").regex(/^\//, "Путь должен начинаться с /"),
  source: z.string().trim().min(1, "Источник"),
  medium: z.string().trim().min(1, "Тип"),
  campaign: z.string().trim().optional(),
  content: z.string().trim().optional(),
});

export async function createTrackingLinkAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("analytics");
  const parsed = LinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    const l = await db.trackingLink.create({ data: { ...d, slug: d.slug.toLowerCase(), source: d.source.toLowerCase(), medium: d.medium.toLowerCase(), campaign: d.campaign || null, content: d.content || null, createdBy: me.id } });
    await audit(me.id, "tracking.create", "TrackingLink", l.id, { slug: l.slug });
  } catch {
    return { error: "Такой короткий адрес уже занят" };
  }
  revalidatePath("/crm/analytics");
  return { ok: true, message: "Ссылка создана" };
}

export async function toggleTrackingLinkAction(formData: FormData) {
  await requireSection("analytics");
  const id = String(formData.get("id"));
  const l = await db.trackingLink.findUniqueOrThrow({ where: { id } });
  await db.trackingLink.update({ where: { id }, data: { isActive: !l.isActive } });
  revalidatePath("/crm/analytics");
}
