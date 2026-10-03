// Продакшен без демо-сида: базовые справочники (уровни Circle, настройки, категории) и первый администратор
// из переменных ADMIN_EMAIL / ADMIN_PASSWORD. Идемпотентно: существующего администратора не трогает.
import "dotenv/config";
import { execSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const tiers = await db.loyaltyTier.count();
  if (tiers === 0) {
    console.log("Справочники пусты — сид без демо-данных");
    execSync("npx prisma db seed", { stdio: "inherit", env: { ...process.env, SEED_DEMO: "0" } });
  }
  const admins = await db.user.count({ where: { role: "ADMIN", isActive: true } });
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (admins === 0 && email && password && password.length >= 12) {
    await db.user.upsert({
      where: { email },
      update: { role: "ADMIN", isActive: true, passwordHash: await bcrypt.hash(password, 12) },
      create: { email, firstName: "Администратор", role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`Администратор ${email} создан`);
  } else if (admins === 0) {
    console.warn("Нет администратора: задайте ADMIN_EMAIL и ADMIN_PASSWORD (12+ символов)");
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
