// Привязывает фото из public/images/brand/<sku>/ к товарам: файлы сортируются по имени, становятся галереей товара.
// Использование: положите фото в public/images/brand/TR-SK-101/01.jpg, 02.jpg … и выполните `node scripts/attach-brand-photos.mjs`.
import "dotenv/config";
import { readdirSync, existsSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const root = "public/images/brand";
if (!existsSync(root)) { console.log("Нет папки", root); process.exit(0); }
for (const sku of readdirSync(root)) {
  const files = readdirSync(`${root}/${sku}`).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f)).sort();
  const product = await db.product.findUnique({ where: { sku } });
  if (!product || files.length === 0) { console.log("пропуск", sku); continue; }
  await db.productImage.deleteMany({ where: { productId: product.id } });
  await db.productImage.createMany({ data: files.map((f, i) => ({ productId: product.id, url: `/images/brand/${sku}/${f}`, alt: product.name, order: i })) });
  console.log(sku, "→", files.length, "фото");
}
await db.$disconnect();
