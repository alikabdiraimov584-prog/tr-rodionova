// Загружает вещи бренда (prisma/seed-brand.ts) без остальных демо-данных: npx tsx scripts/seed-brand.ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedBrand } from "../prisma/seed-brand";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
seedBrand(db)
  .then(async () => console.log("brand products:", await db.product.count({ where: { sku: { startsWith: "TR-" } } })))
  .finally(() => db.$disconnect());
