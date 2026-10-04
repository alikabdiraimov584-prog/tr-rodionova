// Черновики первых рассылок (prisma/seed-campaigns.ts): создаёт недостающие по названию. npx tsx scripts/seed-campaigns.ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedCampaigns } from "../prisma/seed-campaigns";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
seedCampaigns(db)
  .then(async (n) => console.log(`campaigns: добавлено ${n}, всего ${await db.campaign.count()}`))
  .finally(() => db.$disconnect());
