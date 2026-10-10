// Раздел «Задачи» CRM на стенде глазами менеджера: создать задачу коллеге и увидеть её сразу, перенести по этапам
// кнопками и перетаскиванием, страница задачи (история, чеклист, комментарий), виды «Список» и «План», форма
// задачи в карточках заказа и клиентки, телефон без горизонтальной прокрутки.
// Запуск: E2E_BASE_URL=http://127.0.0.1:3100 node scripts/tests/tasks-stand-test.mjs
import { chromium } from "playwright-core";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
let fails = 0;
const check = (name, ok, info = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) fails++;
};
// CRM стримит заготовку раздела (loading.tsx): после перехода ждём, пока она сменится содержимым, иначе innerText пустой
const settled = (p) => p.waitForFunction(() => !document.body.innerText.includes("Загружаем раздел"), null, { timeout: 20_000 }).catch(() => null);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
async function login(viewport = { width: 1366, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()} :: ${m.text().slice(0, 160)}`); });
  // «network error» без текста — запрос действия, оборванный переходом на следующую страницу в самом тесте, не ошибка CRM
  page.on("pageerror", (e) => { if (!/^network error$/i.test(e.message.trim())) errors.push(`${page.url()} :: pageerror ${e.message.slice(0, 160)}`); });
  await page.goto(`${base}/login?next=/crm/tasks`); await settled(page);
  await page.fill('form:has(input[name="password"]) input[name="email"]', "admin@tr-rodionova.ru");
  await page.fill('input[name="password"]', "admin12345");
  await page.click('form:has(input[name="password"]) button.btn-primary');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}
const column = (page, label) => page.locator(`section[aria-label^="${label}"]`);

const page = await login();
await page.goto(`${base}/crm/tasks`); await settled(page);
check("доска: четыре колонки этапов", (await Promise.all(["Новая", "В работе", "На проверке", "Выполнена"].map((l) => column(page, l).count()))).every((n) => n === 1));
check("сводка: карточки Просрочено / Сегодня / На неделе / В работе / Готово", (await page.locator("text=Просрочено").count()) >= 1 && (await page.locator("text=Готово за 7 дней").count()) === 1);

// создать задачу коллеге — она должна появиться сразу, с подсветкой
const title = `Стенд: позвонить клиентке ${Date.now()}`;
const form = page.locator("form").filter({ has: page.locator('input[name="title"]') }).first();
await form.locator('input[name="title"]').fill(title);
const tomorrow = new Date(Date.now() + 86_400_000);
await form.locator('input[name="dueAt"]').fill(`${tomorrow.toISOString().slice(0, 10)}T15:30`);
const options = await form.locator('select[name="assigneeId"] option').allTextContents();
const other = options.find((o) => o !== "Мне" && !/Админ/i.test(o)) ?? options[1];
await form.locator('select[name="assigneeId"]').selectOption({ label: other });
await form.locator('select[name="priority"]').selectOption("HIGH");
await form.locator('select[name="kind"]').selectOption("CALL");
await form.locator('button:has-text("Создать")').click();
await page.waitForSelector(`text=${title}`, { timeout: 30_000 });
// сообщение рендерит сервер по ?new=<id> — ждём его отдельно
await page.waitForSelector('p[role="status"]:has-text("создана")', { timeout: 15_000 }).catch(() => null);
const msg = await page.locator('p[role="status"]', { hasText: "создана" }).first().innerText().catch(() => "");
check("после создания: сообщение с именем ответственного и ссылкой «открыть задачу»", msg.includes("создана") && msg.includes(other.split(" ")[0].slice(0, 4)) && msg.includes("открыть задачу"), msg);
check("форма очистилась", (await form.locator('input[name="title"]').inputValue()) === "");
await page.waitForURL(/new=/, { timeout: 10_000 }).catch(() => null);
check("адрес получил ?new=<id>, карточка в колонке «Новая»", /new=/.test(page.url()) && (await column(page, "Новая").locator(`text=${title}`).count()) === 1, page.url().slice(-40));
const card = column(page, "Новая").locator("article, div.card, [data-task]").filter({ hasText: title }).first();
check("карточка: срок завтра со временем, тип «звонок», ответственная", /завтра, 15:30/.test(await card.innerText()) && (await card.innerText()).length > 0, (await card.innerText()).replace(/\s+/g, " ").slice(0, 160));

// кнопка «В работу» — карточка переезжает без перезагрузки и остаётся после неё
await card.locator('button:has-text("В работу")').click();
await page.waitForFunction((t) => document.querySelector('section[aria-label^="В работе"]')?.textContent?.includes(t), title, { timeout: 15_000 });
await page.reload(); await settled(page);
check("«В работу»: карточка в колонке «В работе» и после перезагрузки", (await column(page, "В работе").locator(`text=${title}`).count()) === 1 && (await column(page, "Новая").locator(`text=${title}`).count()) === 0);

// перетаскивание мышью в «На проверке»
const dragCard = column(page, "В работе").locator("[draggable]").filter({ hasText: title }).first();
// перетаскивание мышью как у человека: нажать, провести в колонку, отпустить (dragTo у Playwright не доводит HTML5-drop);
// до этого ждём гидратацию доски — обработчики drag навешивает React, серверная разметка их не содержит
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
await dragCard.hover();
await page.mouse.down();
const target = await column(page, "На проверке").boundingBox();
await page.mouse.move(target.x + target.width / 2, target.y + 60, { steps: 12 });
await page.mouse.move(target.x + target.width / 2, target.y + 90, { steps: 6 });
await page.mouse.up();
await page.waitForFunction((t) => document.querySelector('section[aria-label^="На проверке"]')?.textContent?.includes(t), title, { timeout: 15_000 }).catch(() => null);
await page.reload(); await settled(page);
check("перетаскивание: карточка в «На проверке» после перезагрузки", (await column(page, "На проверке").locator(`text=${title}`).count()) === 1);

// страница задачи: история, чеклист, комментарий
await column(page, "На проверке").locator(`a:has-text("${title}")`).first().click();
await page.waitForURL(/\/crm\/tasks\/[a-z0-9]+/);
const taskText = await page.locator("body").innerText();
check("история этапов на странице задачи", /Новая → В работе/.test(taskText) && /В работе → На проверке/.test(taskText));
await page.fill('input[aria-label="Новый пункт чеклиста"]', "Уточнить размер");
await page.click('form:has(input[aria-label="Новый пункт чеклиста"]) button');
await page.waitForSelector("text=Уточнить размер", { timeout: 15_000 });
await page.fill('input[aria-label="Новый пункт чеклиста"]', "Предложить примерку");
await page.click('form:has(input[aria-label="Новый пункт чеклиста"]) button');
await page.waitForFunction(() => document.body.innerText.includes("Предложить примерку"), null, { timeout: 15_000 });
const firstItem = page.locator("text=Уточнить размер").first();
const toggle = page.locator('form:has(input[name="itemId"]) button, input[type="checkbox"]').first();
if (await toggle.count()) await toggle.click();
await page.waitForTimeout(1500);
await page.fill('textarea[aria-label="Комментарий"]', "Клиентка просила перезвонить после 18:00");
await page.click('form:has(textarea[aria-label="Комментарий"]) button');
await page.waitForFunction(() => document.body.innerText.includes("перезвонить после 18:00"), null, { timeout: 15_000 });
check("чеклист из двух пунктов и комментарий сохранены", (await page.locator("text=Предложить примерку").count()) >= 1 && (await page.locator("text=перезвонить после 18:00").count()) >= 1 && (await firstItem.count()) >= 1);
check("поле комментария очистилось", (await page.locator('textarea[aria-label="Комментарий"]').inputValue()) === "");
const taskUrl = page.url();

// виды «Список» и «План»
await page.goto(`${base}/crm/tasks?view=list`); await settled(page);
check("список: таблица с задачей, этапом и ответственной", (await page.locator(`table >> text=${title}`).count()) === 1 && (await page.locator("th:has-text('Ответственная')").count()) === 1);
await page.goto(`${base}/crm/tasks?view=list&status=all&q=${encodeURIComponent("клиентке")}`); await settled(page);
check("поиск в списке находит задачу", (await page.locator(`text=${title}`).count()) >= 1);
await page.goto(`${base}/crm/tasks?view=plan`); await settled(page);
check("план: группа «Завтра» с задачей", (await page.locator('section[aria-label="Завтра"]').locator(`text=${title}`).count()) === 1);

// завершение через меню «→ этап» на доске
await page.goto(`${base}/crm/tasks`); await settled(page);
const reviewCard = column(page, "На проверке").locator("[draggable]").filter({ hasText: title }).first();
await reviewCard.locator('button:has-text("Готово")').click();
await page.waitForFunction((t) => document.querySelector('section[aria-label^="Выполнена"]')?.textContent?.includes(t), title, { timeout: 15_000 });
await page.reload(); await settled(page);
check("«Готово»: карточка в колонке «Выполнена»", (await column(page, "Выполнена").locator(`text=${title}`).count()) === 1);
check("счётчик «Готово за 7 дней» не ноль", !/Готово за 7 дней\s*0\b/.test(await page.locator("body").innerText()));

// форма задачи в карточке заказа и клиентки
await page.goto(`${base}/crm/orders`); await settled(page);
await page.locator('table a[href^="/crm/orders/"]').first().click();
await page.waitForURL(/\/crm\/orders\/[a-z0-9]+/);
check("карточка заказа: блок «Задача по заказу» с формой", (await page.locator("text=Задача по заказу").count()) === 1 && (await page.locator('input[name="orderId"]').count()) >= 1);
await page.goto(`${base}/crm/customers`); await settled(page);
await page.locator('table a[href^="/crm/customers/"]').first().click();
await page.waitForURL(/\/crm\/customers\/[a-z0-9]+/);
check("карточка клиентки: форма задачи с customerId", (await page.locator('input[name="customerId"]').count()) >= 1);

// главная CRM и меню
await page.goto(`${base}/crm`); await settled(page);
check("главная CRM: блок «Мои задачи» и ссылка на раздел", (await page.locator("text=Мои задачи").count()) === 1);

// телефон: без горизонтальной прокрутки, колонки друг под другом
const mobile = await login({ width: 390, height: 844 });
await mobile.goto(`${base}/crm/tasks`); await settled(mobile);
const [scrollW, innerW] = await mobile.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
check("телефон 390 px: страница без горизонтальной прокрутки", scrollW <= innerW + 1, `${scrollW} > ${innerW}`);
check("телефон: у карточек есть меню «→ этап»", (await mobile.locator('summary:has-text("этап")').count()) >= 1);
await mobile.goto(taskUrl); await settled(mobile);
const [sw2, iw2] = await mobile.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
check("телефон: страница задачи без горизонтальной прокрутки", sw2 <= iw2 + 1, `${sw2} > ${iw2}`);
await mobile.screenshot({ path: `${process.env.S ?? "/tmp"}/tasks-mobile.png`, fullPage: true });
await page.goto(`${base}/crm/tasks`); await settled(page);
await page.screenshot({ path: `${process.env.S ?? "/tmp"}/tasks-board.png`, fullPage: true });

check("ошибок в консоли браузера нет", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(fails ? `\n${fails} проверок не прошли` : "\nВсе проверки прошли");
process.exit(fails ? 1 : 0);
