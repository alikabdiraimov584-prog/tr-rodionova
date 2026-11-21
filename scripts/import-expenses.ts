// Загрузка расходов запуска (таблица владельца, 05.10–12.11.2026) в CRM → Финансы → Расходы.
// Запуск на сервере: cd /opt/tr-rodionova && sudo -u deploy bash deploy/import-expenses.sh
// Повторный запуск ничего не дублирует: проводка с той же датой, статьёй, суммой и комментарием пропускается.
// После загрузки проводки — обычные ручные расходы: их можно исправить или удалить в CRM.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import type { LedgerType } from "../src/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";

type Row = [date: string, type: LedgerType, category: string, comment: string, rub: number];

const SOURCE = "таблица расходов запуска";
// Решения владельца по спорным строкам (21.11.2026): партия — 78 800 ₽ (в ячейке лишний ноль), ткань 12.11 — 97 812 ₽
// по итогу блока, 6% сверху к лекалам и образцам не учитываются, строки без сумм (токен ЭП, Claude, домен, сервер) не заносятся.
const ROWS: Row[] = [
  ["2026-10-05", "EXPENSE_PRODUCTION", "Лекала и образцы", "Платье мини: разработка лекала", 8000],
  ["2026-10-05", "EXPENSE_PRODUCTION", "Лекала и образцы", "Платье мини: пошив образца", 6500],
  ["2026-10-05", "EXPENSE_PRODUCTION", "Лекала и образцы", "Подбор ткани и фурнитуры", 3500],
  ["2026-10-12", "EXPENSE_PRODUCTION", "Ткани", "Ткань подкладочная молочная", 568.4],
  ["2026-10-12", "EXPENSE_PRODUCTION", "Ткани", "Ткань костюмная молочная", 2102.1],
  ["2026-10-12", "EXPENSE_PRODUCTION", "Ткани", "Услуга резки", 999.99],
  ["2026-10-12", "EXPENSE_PRODUCTION", "Лекала и образцы", "Жакет с открытой спиной: разработка лекала", 14000],
  ["2026-10-12", "EXPENSE_PRODUCTION", "Лекала и образцы", "Жакет с открытой спиной: пошив образца", 11000],
  ["2026-10-12", "EXPENSE_PRODUCTION", "Лекала и образцы", "Брюки со стрелками: разработка лекала", 7000],
  ["2026-10-12", "EXPENSE_PRODUCTION", "Лекала и образцы", "Брюки со стрелками: пошив образца", 7000],
  ["2026-10-12", "EXPENSE_PRODUCTION", "Лекала и образцы", "Подбор ткани и фурнитуры: жакет", 3500],
  ["2026-10-12", "EXPENSE_PRODUCTION", "Лекала и образцы", "Подбор ткани и фурнитуры: брюки", 3500],
  ["2026-10-21", "EXPENSE_PRODUCTION", "Этикетки и бирки", "Сатин классическая 30×70, 100 шт.", 2500],
  ["2026-10-21", "EXPENSE_PRODUCTION", "Этикетки и бирки", "Жаккард 20×55, 500 шт.", 10800],
  ["2026-10-21", "EXPENSE_PRODUCTION", "Этикетки и бирки", "Жаккард 20×50, 1500 шт.", 26700],
  ["2026-10-21", "EXPENSE_PRODUCTION", "Этикетки и бирки", "Макет", 1000],
  ["2026-10-21", "EXPENSE_PRODUCTION", "Этикетки и бирки", "Составники и лента", 7900],
  ["2026-10-26", "EXPENSE_PRODUCTION", "Ткани", "Ткань костюмная чёрная", 4440.3],
  ["2026-10-26", "EXPENSE_PRODUCTION", "Ткани", "Ткань подкладочная чёрная", 551],
  ["2026-10-26", "EXPENSE_PRODUCTION", "Ткани", "Ткань костюмная молочная", 1494.35],
  ["2026-10-26", "EXPENSE_PRODUCTION", "Ткани", "Услуги резки", 499.99],
  ["2026-10-29", "EXPENSE_PRODUCTION", "Лекала и образцы", "Печать лекал", 2000],
  ["2026-11-03", "EXPENSE_PRODUCTION", "Лекала и образцы", "Топ: разработка лекала", 7000],
  ["2026-11-03", "EXPENSE_PRODUCTION", "Лекала и образцы", "Топ: пошив образца", 6500],
  ["2026-11-03", "EXPENSE_PRODUCTION", "Лекала и образцы", "Рубашка-боди: разработка лекала", 8000],
  ["2026-11-03", "EXPENSE_PRODUCTION", "Лекала и образцы", "Рубашка-боди: пошив образца", 7000],
  ["2026-11-06", "EXPENSE_PRODUCTION", "Лекала и образцы", "Жакет: пошив образца", 11000],
  ["2026-11-06", "EXPENSE_PRODUCTION", "Лекала и образцы", "Брюки: пошив образца", 7000],
  ["2026-11-06", "EXPENSE_PRODUCTION", "Лекала и образцы", "Подбор ткани на боди", 3500],
  ["2026-11-06", "EXPENSE_PRODUCTION", "Лекала и образцы", "Градация размеров: платье, S и M", 3200],
  ["2026-11-09", "EXPENSE_PRODUCTION", "Фурнитура", "Предоплата фурнитуры", 36000],
  ["2026-11-10", "EXPENSE_PRODUCTION", "Пошив партии", "Партия 45 ед. × 2 800 ₽, предоплата", 78800],
  ["2026-11-10", "EXPENSE_PRODUCTION", "Упаковка", "Тишью, 300 листов", 12000],
  ["2026-11-12", "EXPENSE_PRODUCTION", "Ткани", "Ткань костюмная молочная (5 оплат, по итогу блока)", 97812],
  ["2026-11-12", "EXPENSE_PRODUCTION", "Ткани", "Ткань подкладочная", 8701.39],
  ["2026-11-12", "EXPENSE_PRODUCTION", "Этикетки и бирки", "Изготовление бирок", 22002],
  ["2026-11-12", "EXPENSE_PRODUCTION", "Упаковка", "Печать для сургуча", 1048],
  ["2026-11-12", "EXPENSE_PRODUCTION", "Упаковка", "Набор для сургуча", 580],
  ["2026-11-12", "EXPENSE_PRODUCTION", "Упаковка", "Конверты", 680],
  ["2026-11-12", "EXPENSE_MARKETING", "Фотосъёмка", "Предоплата фотографу", 5000],
  ["2026-11-12", "EXPENSE_MARKETING", "Дизайн", "Дизайнер", 11600],
  ["2026-11-12", "EXPENSE_MARKETING", "Фотосъёмка", "Эскиз фото", 7000],
  ["2026-11-12", "EXPENSE_TAX", "Налоги", "Налоговая ФНС", 14347.5],
  ["2026-11-12", "EXPENSE_SERVICES", "Бухгалтерия", "Бухгалтерия", 15000],
  ["2026-11-12", "EXPENSE_SERVICES", "ИИ-сервисы", "ChatGPT", 10000],
  ["2026-11-12", "EXPENSE_SERVICES", "ИИ-сервисы", "Runway", 4056],
  ["2026-11-12", "EXPENSE_OTHER", "Документы", "Печать ИП", 1500],
];

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let added = 0;
  let skipped = 0;
  const totals = new Map<string, number>();
  for (const [day, type, category, text, rub] of ROWS) {
    const amount = Math.round(rub * 100);
    const date = new Date(`${day}T12:00:00+03:00`); // полдень по Москве: проводка не уезжает в соседний день
    const comment = `${text} (${SOURCE})`;
    const exists = await db.ledgerEntry.findFirst({ where: { type, amount, date, category, comment }, select: { id: true } });
    if (exists) skipped++;
    else {
      await db.ledgerEntry.create({ data: { type, amount, date, category, comment } });
      added++;
    }
    totals.set(category, (totals.get(category) ?? 0) + amount);
  }
  await db.$disconnect();
  const rub = (k: number) => `${(k / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
  console.log(`Добавлено проводок: ${added}, уже были: ${skipped}`);
  for (const [c, k] of [...totals].sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${rub(k)}`);
  console.log(`Итого: ${rub([...totals.values()].reduce((a, b) => a + b, 0))}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
