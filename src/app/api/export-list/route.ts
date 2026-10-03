import { db } from "@/lib/db";

/** Список адресов для статического экспорта (только в разработке). */
export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response("not found", { status: 404 });
  const [products, looks, articles] = await Promise.all([
    db.product.findMany({ where: { status: "ACTIVE" }, select: { slug: true } }),
    db.look.findMany({ where: { isPublished: true }, select: { slug: true } }),
    db.article.findMany({ where: { publishedAt: { lte: new Date() } }, select: { slug: true } }),
  ]);
  return Response.json({ products: products.map((p) => p.slug), looks: looks.map((l) => l.slug), articles: articles.map((a) => a.slug) });
}
