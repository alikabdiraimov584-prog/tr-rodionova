import "server-only";
import { db } from "@/lib/db";
import { PRESETS } from "@/lib/campaigns";

export async function campaignOptions() {
  const [tiers, sources, tags, products, categories] = await Promise.all([
    db.loyaltyTier.findMany({ orderBy: { threshold: "asc" }, select: { code: true, name: true } }),
    db.user.findMany({ where: { role: "CUSTOMER", source: { not: null } }, distinct: ["source"], select: { source: true } }),
    db.user.findMany({ where: { role: "CUSTOMER" }, select: { tags: true } }),
    db.product.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);
  return { tiers, sources: sources.map((s) => s.source!).sort(), tags: [...new Set(tags.flatMap((t) => t.tags))].sort(), products, categories, presets: PRESETS };
}
