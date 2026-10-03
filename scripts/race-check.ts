// Проверка гонок: 20 параллельных резервов одного варианта с остатком 5 и 20 параллельных списаний баллов.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const variant = await db.productVariant.findFirstOrThrow({ where: { stock: { gte: 1 } } });
  await db.productVariant.update({ where: { id: variant.id }, data: { stock: 5, reserved: 0 } });
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () =>
      db.$transaction(async (tx) => {
        const n = await tx.$executeRaw`UPDATE "ProductVariant" SET "reserved" = "reserved" + 1 WHERE "id" = ${variant.id} AND "stock" - "reserved" >= 1`;
        if (n === 0) throw new Error("нет остатка");
      }),
    ),
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const after = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
  console.log(`резерв: успешных ${ok} из 20, reserved=${after.reserved}, stock=${after.stock}`, ok === 5 && after.reserved === 5 ? "OK" : "FAIL");
  await db.productVariant.update({ where: { id: variant.id }, data: { stock: variant.stock, reserved: variant.reserved } });

  const user = await db.user.findFirstOrThrow({ where: { role: "CUSTOMER" } });
  await db.user.update({ where: { id: user.id }, data: { pointsBalance: 500 } });
  const spends = await Promise.allSettled(
    Array.from({ length: 20 }, () =>
      db.user.updateMany({ where: { id: user.id, pointsBalance: { gte: 100 } }, data: { pointsBalance: { decrement: 100 } } }).then((r) => {
        if (r.count === 0) throw new Error("недостаточно");
      }),
    ),
  );
  const okSpend = spends.filter((r) => r.status === "fulfilled").length;
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  console.log(`баллы: успешных ${okSpend} из 20, balance=${u.pointsBalance}`, okSpend === 5 && u.pointsBalance === 0 ? "OK" : "FAIL");
  await db.user.update({ where: { id: user.id }, data: { pointsBalance: user.pointsBalance } });
}

main().finally(() => db.$disconnect());
