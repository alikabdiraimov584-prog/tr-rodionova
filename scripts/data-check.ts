// Проверка боевой базы только на чтение: есть ли в ней демо-данные первых стендов и откуда берутся цифры CRM.
// Запуск на сервере: cd /opt/tr-rodionova && sudo -u deploy bash deploy/data-check.sh
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// адреса из prisma/seed*.ts (демо-клиентки и сотрудники стенда)
const DEMO_STAFF = ["manager@tr-rodionova.ru", "support@tr-rodionova.ru"];
const demoUser = { OR: [{ email: { endsWith: "@example.com" } }, { email: { in: DEMO_STAFF } }] };

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [demoUsers, demoOrders, demoReviews, demoConvs, customers, orders, paid, reviews, visits30, lastVisit, events30, staff] = await Promise.all([
    db.user.findMany({ where: demoUser, select: { email: true, role: true, isActive: true } }),
    db.order.count({ where: { user: demoUser } }),
    db.review.count({ where: { user: demoUser } }),
    db.conversation.count({ where: { customer: demoUser } }),
    db.user.count({ where: { role: "CUSTOMER", NOT: demoUser } }),
    db.order.count({ where: { NOT: { user: demoUser } } }),
    db.order.count({ where: { NOT: { user: demoUser }, status: { in: ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] } } }),
    db.review.count({ where: { NOT: { user: demoUser } } }),
    db.visitorSession.count({ where: { startedAt: { gte: since } } }),
    db.visitorSession.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    db.analyticsEvent.groupBy({ by: ["type"], where: { createdAt: { gte: since } }, _count: true }),
    db.user.findMany({ where: { role: { not: "CUSTOMER" } }, select: { email: true, role: true, isActive: true, totpEnabledAt: true } }),
  ]);
  await db.$disconnect();

  console.log("== Демо-данные первых стендов");
  if (demoUsers.length === 0) console.log("нет: демо-аккаунтов, их заказов и отзывов в базе нет");
  else {
    console.log(`ЕСТЬ: аккаунтов ${demoUsers.length}, заказов ${demoOrders}, отзывов ${demoReviews}, переписок ${demoConvs}`);
    for (const u of demoUsers.slice(0, 10)) console.log(`  ${u.email} (${u.role}${u.isActive ? "" : ", отключён"})`);
    if (demoUsers.length > 10) console.log(`  … и ещё ${demoUsers.length - 10}`);
  }
  console.log("== Настоящие данные (без демо)");
  console.log(`клиенток ${customers}, заказов ${orders} (оплачено ${paid}), отзывов ${reviews}`);
  console.log(`визитов за 30 дней: ${visits30}; последний визит: ${lastVisit ? lastVisit.startedAt.toLocaleString("ru-RU") : "не было"}`);
  console.log(`действия за 30 дней: ${events30.map((e) => `${e.type} ${e._count}`).join(", ") || "нет"}`);
  console.log("== Сотрудники");
  for (const s of staff) console.log(`  ${s.email} (${s.role}${s.isActive ? "" : ", отключён"}${s.totpEnabledAt ? ", 2FA" : ", без 2FA"})`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
