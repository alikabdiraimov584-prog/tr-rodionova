// Запускает сид только если в базе ещё нет пользователей (первый деплой).
import "dotenv/config";
import { execSync } from "node:child_process";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const users = await db.user.count();
  await db.$disconnect();
  if (users === 0) {
    console.log("База пуста — запускаем сид");
    execSync("npx prisma db seed", { stdio: "inherit" });
  } else {
    console.log(`В базе ${users} пользователей — сид пропущен`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
