import { db } from "@/lib/db";

/** Список адресов для статического экспорта (только в разработке). */
export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response("not found", { status: 404 });
  const products = await db.product.findMany({ where: { status: "ACTIVE" }, select: { slug: true } });
  return Response.json({ products: products.map((p) => p.slug) });
}
