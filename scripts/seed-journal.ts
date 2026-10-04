// Статьи журнала (prisma/seed-journal.ts): создаёт недостающие, существующие не трогает. npx tsx scripts/seed-journal.ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedJournal } from "../prisma/seed-journal";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
seedJournal(db)
  .then(async (n) => console.log(`journal: добавлено ${n}, всего статей ${await db.article.count()}`))
  .finally(() => db.$disconnect());
