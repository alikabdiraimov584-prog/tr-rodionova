import "server-only";
import { db } from "@/lib/db";

export async function brandHeroImage(): Promise<string | null> {
  const product = await db.product.findFirst({ where: { status: "ACTIVE", isFeatured: true }, orderBy: { createdAt: "desc" }, select: { images: { orderBy: { order: "asc" }, take: 1, select: { url: true } } } });
  return product?.images[0]?.url ?? null;
}
