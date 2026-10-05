import "server-only";
import { db } from "@/lib/db";

/**
 * Обложка образа: заданная в CRM, иначе первое фото первой вещи образа. Так новые фото, загруженные
 * в карточку вещи, сами попадают в лукбук и на главную, без отдельной правки образа.
 */
export async function withLookCovers<T extends { id: string; coverUrl: string | null }>(looks: T[]): Promise<T[]> {
  const missing = looks.filter((l) => !l.coverUrl).map((l) => l.id);
  if (missing.length === 0) return looks;
  const items = await db.lookItem.findMany({
    where: { lookId: { in: missing } },
    orderBy: { order: "asc" },
    include: { product: { select: { images: { orderBy: { order: "asc" }, take: 1, select: { url: true } } } } },
  });
  const cover = new Map<string, string>();
  for (const it of items) {
    const url = it.product.images[0]?.url;
    if (url && !cover.has(it.lookId)) cover.set(it.lookId, url);
  }
  return looks.map((l) => (l.coverUrl ? l : { ...l, coverUrl: cover.get(l.id) ?? null }));
}

/** Фото для «О бренде»: обложка первого образа (обычно свежая съёмка), иначе первое фото первой вещи из избранного. */
export async function brandHeroImage(): Promise<string | null> {
  const look = await db.look.findFirst({ where: { isPublished: true }, orderBy: { order: "asc" }, select: { id: true, coverUrl: true } });
  if (look) {
    const [withCover] = await withLookCovers([look]);
    if (withCover.coverUrl) return withCover.coverUrl;
  }
  const product = await db.product.findFirst({ where: { status: "ACTIVE", isFeatured: true }, orderBy: { createdAt: "desc" }, select: { images: { orderBy: { order: "asc" }, take: 1, select: { url: true } } } });
  return product?.images[0]?.url ?? null;
}
