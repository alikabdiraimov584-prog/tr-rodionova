// Привязывает фото из public/images/brand/<sku>/ к товарам (файлы по алфавиту = порядок галереи).
// Использование: положите фото в public/images/brand/TR-SK-101/01.jpg, 02.jpg … и выполните `npx tsx scripts/attach-brand-photos.ts`.
// Запускается при каждом старте контейнера. Фото, загруженные через CRM (/uploads/…), не трогает: добавляет только
// недостающие файлы из папки и убирает ссылки на файлы, которых в папке больше нет.
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
    const product = await db.product.findUnique({ where: { sku }, include: { images: { orderBy: { order: "asc" } } } });
    if (!product || files.length === 0) { console.log("пропуск", sku); continue; }
    const prefix = `/images/brand/${sku}/`;
    const wanted = files.map((f) => prefix + f);
    const stale = product.images.filter((i) => i.url.startsWith(prefix) && !wanted.includes(i.url));
    if (stale.length) await db.productImage.deleteMany({ where: { id: { in: stale.map((i) => i.id) } } });
    const have = new Set(product.images.map((i) => i.url));
    // владелица уже загрузила свои фото через CRM: папка больше ничего не добавляет (удалённое в CRM не возвращается), только убирает исчезнувшие файлы
    const curated = product.images.some((i) => i.url.startsWith("/uploads/"));
    const missing = curated ? [] : wanted.filter((u) => !have.has(u));
    let order = product.images.filter((i) => !stale.includes(i)).reduce((m, i) => Math.max(m, i.order + 1), 0);
    if (missing.length) await db.productImage.createMany({ data: missing.map((url) => ({ productId: product.id, url, alt: product.name, order: order++ })) });
    const crm = product.images.filter((i) => !i.url.startsWith(prefix)).length;
    console.log(sku, "→ из папки", wanted.length, "добавлено", missing.length, "убрано", stale.length, crm ? `(из CRM: ${crm}, папка только убирает исчезнувшее)` : "");
  }
}
main().finally(() => db.$disconnect());
