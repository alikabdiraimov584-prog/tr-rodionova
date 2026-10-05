// Стендовая проверка «разъезда версий»: вкладка CRM открывается на текущей сборке и ждёт файл-флаг;
// за это время стенд пересобирают и перезапускают (другой GIT_SHA и/или другой NEXT_SERVER_ACTIONS_ENCRYPTION_KEY),
// затем создают флаг — вкладка жмёт «Создать задачу» и печатает, что увидела: задача создана / страница ошибки / код.
// Запуск: CHROME_PATH=… FLAG=/tmp/go SHOT=/tmp/stale.png node scripts/tests/stale-tab-stand-test.mjs; потом touch /tmp/go.
import { chromium } from "playwright-core";
import { existsSync, unlinkSync } from "node:fs";
const base = "http://127.0.0.1:3100";
const flag = process.env.FLAG;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 400)); });
p.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url().slice(0, 120)}`); });
await p.goto(`${base}/login`); await p.fill('input[name="email"]', "admin@tr-rodionova.ru"); await p.fill('input[name="password"]', "admin12345"); await p.click("form button.btn-primary"); await p.waitForURL(/crm/);
await p.goto(`${base}/crm/tasks`);
console.log("страница задач открыта, жду флаг", new Date().toISOString());
while (!existsSync(flag)) await new Promise((r) => setTimeout(r, 2000));
unlinkSync(flag);
console.log("флаг получен, жму кнопку из старой вкладки", new Date().toISOString());
const t0 = Date.now();
await p.fill('input[name="title"]', `Старая вкладка ${t0}`);
await p.click("text=Создать задачу");
await p.waitForTimeout(4000);
const t = await p.textContent("body");
console.log("результат:", /Задача создана/.test(t) ? "создана" : "НЕТ сообщения", /Раздел не открылся/.test(t) ? "ОШИБКА-страница" : "без страницы ошибки", "код:", (t.match(/Код: ([\w-]+)/) ?? ["", "нет"])[1]);
console.log("errors:", errors.length ? errors.join("\n") : "нет");
await p.screenshot({ path: process.env.SHOT });
await b.close();
