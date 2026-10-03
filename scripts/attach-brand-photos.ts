// Привязывает фото из public/images/brand/<sku>/ к товарам (файлы по алфавиту = порядок галереи).
// Использование: положите фото в public/images/brand/TR-SK-101/01.jpg, 02.jpg … и выполните `npx tsx scripts/attach-brand-photos.ts`.
import "dotenv/config";
import { readdirSync, existsSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const root = "public/images/brand";

async function main() {
  if (!existsSync(root)) return console.log("Нет папки", root);
  for (const sku of readdirSync(root)) {
    const files = readdirSync(`${root}/${sku}`).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f)).sort();
    const product = await db.product.findUnique({ where: { sku } });
    if (!product || files.length === 0) { console.log("пропуск", sku); continue; }
    await db.productImage.deleteMany({ where: { productId: product.id } });
    await db.productImage.createMany({ data: files.map((f, i) => ({ productId: product.id, url: `/images/brand/${sku}/${f}`, alt: product.name, order: i })) });
    console.log(sku, "→", files.length, "фото");
  }
}
main().finally(() => db.$disconnect());
