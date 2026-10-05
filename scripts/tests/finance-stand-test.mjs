// Стенд: страница финансов в CRM — вкладки, ввод расхода, правка, остаток на начало, экспорт, удаление.
// Запуск: node scripts/tests/finance-stand-test.mjs (стенд на 3100 со STAFF_2FA_REQUIRED=0)
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const fails = [];
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails.push(name); };
const body = async () => (await p.textContent("body")).replace(/\s+/g, " ");

await p.goto(`${base}/login`); await p.fill('input[name="email"]', "admin@tr-rodionova.ru"); await p.fill('input[name="password"]', "admin12345"); await p.click("form button.btn-primary");
await p.waitForURL(/\/crm/, { timeout: 20000 });

for (const [tab, marker] of [["overview", "Юнит-экономика"], ["cashflow", "Движение денежных средств"], ["pnl", "Отчёт о прибылях"], ["expenses", "Проводки"], ["stock", "Остатки по вещам"]]) {
  const r = await p.goto(`${base}/crm/finance?tab=${tab}`);
  const t = await body();
  check(`вкладка ${tab}`, r.status() === 200 && t.includes(marker) && !/Произошла ошибка|Application error/.test(t), `HTTP ${r.status()}`);
}

// добавить расход
await p.goto(`${base}/crm/finance?tab=expenses`);
const form = p.locator('form:has(select[name="type"])');
await form.locator('select[name="type"]').selectOption("EXPENSE_RENT");
await form.locator('input[name="amount"]').fill("50000");
const today = new Date().toISOString().slice(0, 10);
await form.locator('input[name="date"]').fill(today);
await form.locator('input[name="category"]').fill("Аренда шоурума (тест)");
await form.locator('input[name="counterparty"]').fill("ООО Тест-Арендодатель");
await form.locator('input[name="comment"]').fill("тестовая проводка");
await form.locator("button.btn-primary").click();
await p.waitForTimeout(1500);
let t = await body();
check("расход добавлен", /Проводка добавлена/.test(t) && t.includes("ООО Тест-Арендодатель"));

// виден в ДДС и P&L текущего месяца
const monthLabel = new Date().toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }).replace(" г.", "");
await p.goto(`${base}/crm/finance?tab=cashflow`);
t = await body();
check("ДДС показывает аренду", /Аренда/.test(t) && t.includes(monthLabel));
await p.goto(`${base}/crm/finance?tab=pnl`);
t = await body();
check("P&L и разбивка расходов", /Аренда шоурума \(тест\)/.test(t));

// правка
await p.goto(`${base}/crm/finance?tab=expenses`);
const row = p.locator("tr", { hasText: "ООО Тест-Арендодатель" }).first();
await row.locator("a", { hasText: "изменить" }).click();
await p.waitForURL(/edit=/);
const editForm = p.locator('form:has(input[name="id"])');
await editForm.locator('input[name="amount"]').fill("55000");
await editForm.locator("button.btn-primary").click();
await p.waitForTimeout(1500);
t = await body();
check("расход изменён", /Проводка изменена/.test(t) && t.includes("55 000 ₽"));

// остаток на начало учёта → остаток на конец месяца появляется
await p.goto(`${base}/crm/finance?tab=cashflow`);
const sf = p.locator('form:has(input[name="openingBalance"])');
await sf.locator('input[name="openingBalance"]').fill("100000");
await sf.locator('input[name="openingDate"]').fill(`${new Date().getFullYear()}-01-01`);
await sf.locator("button").last().click();
await sf.getByText("Сохранено").waitFor({ timeout: 15000 }).catch(() => {});
await p.goto(`${base}/crm/finance?tab=cashflow`);
t = await body();
check("остаток на конец месяца считается", /Остаток на конец месяца/.test(t) && !/остаток не считается/.test(t));
// ссылки с опечатками не роняют страницу
for (const q of ["tab=expenses&type=EXPENSE", "tab=expenses&page=abc", "tab=expenses&page=99", "tab=pnl&month=2026-13"]) {
  const r = await p.goto(`${base}/crm/finance?${q}`);
  t = await body();
  check(`адрес ?${q} открывается`, r.status() === 200 && !/Раздел не открылся|Произошла ошибка/.test(t), `HTTP ${r.status()}`);
}

// экспорт
for (const rep of ["ledger", "cashflow", "pnl"]) {
  // запрос из страницы: cookie сессии уходит как в браузере
  const r = await p.evaluate(async (u) => { const res = await fetch(u, { credentials: "include" }); return { status: res.status, type: res.headers.get("content-type") ?? "", text: await res.text() }; }, `${base}/crm/finance/export?months=6&report=${rep}`);
  check(`экспорт ${rep}`, r.status === 200 && r.text.split("\n").length > 1 && /text\/csv/.test(r.type), `${r.status} ${r.text.split("\n")[0].slice(0, 60)}`);
}

// удаление и сброс настроек
await p.goto(`${base}/crm/finance?tab=expenses`);
p.once("dialog", (d) => d.accept());
await p.locator("tr", { hasText: "ООО Тест-Арендодатель" }).first().locator("button", { hasText: "удалить" }).click();
let gone = false;
for (let i = 0; i < 10 && !gone; i++) { await p.waitForTimeout(1000); await p.goto(`${base}/crm/finance?tab=expenses`); gone = (await p.locator("tr", { hasText: "ООО Тест-Арендодатель" }).count()) === 0; }
check("расход удалён", gone);
await p.goto(`${base}/crm/finance?tab=cashflow`);
await sf.locator('input[name="openingBalance"]').fill(""); await sf.locator('input[name="openingDate"]').fill(""); await sf.locator("button").last().click(); await p.waitForTimeout(800);
await p.screenshot({ path: "/tmp/claude-0/-home-user/47d9bdc7-3d40-50f3-8f07-a9b3eaf7f2d7/scratchpad/finance-cashflow.png", fullPage: true });
await b.close();
console.log(fails.length ? `FAILED: ${fails.join(", ")}` : "finance: все проверки PASS");
process.exit(fails.length ? 1 : 0);
