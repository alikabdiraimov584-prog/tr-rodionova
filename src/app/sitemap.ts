import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/seo";

// база недоступна при сборке — карта сайта строится на запрос
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const [products, articles, looks, collections, categories] = await Promise.all([
    db.product.findMany({ where: { status: "ACTIVE" }, select: { slug: true, updatedAt: true } }),
    db.article.findMany({ where: { publishedAt: { not: null, lte: now } }, select: { slug: true, updatedAt: true } }),
    db.look.findMany({ where: { isPublished: true }, select: { slug: true, createdAt: true } }),
    db.collection.findMany({ where: { isActive: true }, select: { slug: true } }),
    // только категории, которые видны в меню: показанные и с вещами в продаже
    db.category.findMany({ where: { isActive: true, products: { some: { status: "ACTIVE" } } }, select: { slug: true } }),
  ]);
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"], lastModified?: Date): MetadataRoute.Sitemap[number] => ({
    url: `${base}${path}`,
    lastModified: lastModified ?? now,
    changeFrequency,
    priority,
  });
  return [
    page("/", 1, "daily"),
    page("/catalog", 0.9, "daily"),
    page("/journal", 0.8, "daily"),
    page("/lookbook", 0.7, "weekly"),
    page("/collections", 0.6, "weekly"),
    page("/circle", 0.6, "monthly"),
    page("/about", 0.5, "monthly"),
    page("/faq", 0.6, "monthly"),
    page("/delivery", 0.5, "monthly"),
    page("/sizes", 0.5, "monthly"),
    page("/care", 0.4, "monthly"),
    page("/gift", 0.5, "monthly"),
    page("/preloved", 0.5, "weekly"),
    page("/showroom", 0.4, "monthly"),
    page("/press", 0.4, "monthly"),
    ...categories.map((c) => page(`/catalog?category=${c.slug}`, 0.7, "weekly")),
    ...collections.map((c) => page(`/collections?slug=${c.slug}`, 0.5, "weekly")),
    ...products.map((p) => page(`/product/${p.slug}`, 0.8, "weekly", p.updatedAt)),
    ...articles.map((a) => page(`/journal/${a.slug}`, 0.7, "monthly", a.updatedAt)),
    ...looks.map((l) => page(`/lookbook/${l.slug}`, 0.6, "monthly", l.createdAt)),
  ];
}
