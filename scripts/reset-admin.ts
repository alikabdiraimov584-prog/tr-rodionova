// Сброс пароля администратора из ADMIN_EMAIL / ADMIN_PASSWORD в .env (когда пароль забыт).
// Запуск на сервере: docker compose exec -T web npx tsx scripts/reset-admin.ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error("Задайте ADMIN_EMAIL и ADMIN_PASSWORD (12+ символов) в .env");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  await db.user.upsert({
    where: { email },
    // новый пароль, роль администратора, сброс 2FA и всех сессий
    update: { role: "ADMIN", isActive: true, passwordHash: await bcrypt.hash(password, 12), totpSecret: null, totpEnabledAt: null, sessionVersion: { increment: 1 } },
    create: { email, firstName: "Администратор", role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Пароль администратора ${email} обновлён, 2FA и сессии сброшены`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
