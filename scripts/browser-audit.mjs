// Браузерный аудит сайта и CRM: обход всех страниц, клики по безопасным кнопкам, формы, гостевой путь до оплаты.
// Запуск: BASE_URL=https://tr-rodionova.ru [CRM_EMAIL=... CRM_PASSWORD=...] [CHROME_PATH=...] node scripts/browser-audit.mjs
// На боевом сайте ничего не создаёт и не удаляет: заказ не подтверждается, в CRM только чтение и фильтры.
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const base = (process.env.BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const crmEmail = process.env.CRM_EMAIL;
const crmPassword = process.env.CRM_PASSWORD;
const maxPages = Number(process.env.MAX_PAGES ?? 120);
const perTemplate = Number(process.env.PER_TEMPLATE ?? 4); // сколько страниц одного шаблона (/product/*, /journal/*) обходить
const budgetMs = Number(process.env.TIME_BUDGET_MIN ?? 20) * 60_000;
const startedAt = Date.now();
const overBudget = () => Date.now() - startedAt > budgetMs;
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
// шаблон маршрута: /product/abc → /product/*, /crm/orders/123 → /crm/orders/*
const template = (path) => path.replace(/\/(product|journal|lookbook|orders|customers|products|returns|tickets|collections|staff|promos|reviews|stock|notifications)\/[^/?]+/g, "/$1/*");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

const problems = [];
const stats = { pages: 0, buttonsClicked: 0, forms: 0, links: 0 };
const note = (kind, where, detail) => problems.push({ kind, where, detail: String(detail).slice(0, 400) });

// кнопки, которые меняют данные — на боевом сайте не нажимаем
const DESTRUCTIVE = /удал|отмен|оплат|подтвер|отправ|сохран|создать|примен|выйти|отключ|включ|сброс|обезлич|заверш|принять|опубл|списать|начисл|возврат|перевести|заверш|обновить|добавить|загруз|импорт|экспорт|запрос|назнач|закрыть|ответ|повтор|применить|оформ|зарегистр|войти|получить код|сообщить/i;

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, locale: "ru-RU" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|net::ERR|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url().replace(base, "")}`); });
  return { ctx, page, errors };
}

const skip = /\/(unsubscribe|go|api|_next|logout|data-export|export|print|reset|feed\.xml)\b|\.(xml|txt|json|pdf)$/;
const noisy = /[?&](page|sort|size|color|material|price|q|new|period|dim|from|to|status|tab)=/;

async function crawl(role, viewport, startPaths, login) {
  const { ctx, page, errors } = await newPage(viewport);
  if (login) {
    await page.goto(`${base}/login`);
    await page.fill('input[name="email"]', login.email);
    await page.fill('input[name="password"]', login.password);
    await page.click("form button.btn-primary");
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    } catch {
      note("login", role, "не удалось войти: " + (await page.locator("p.text-danger").first().textContent().catch(() => "без сообщения")));
      await ctx.close();
      return;
    }
  }
  const seen = new Set();
  const perTpl = new Map();
  const queue = [...startPaths];
  while (queue.length && seen.size < maxPages) {
    if (overBudget()) { note("budget", role, `лимит времени исчерпан, осталось в очереди ${queue.length}`); break; }
    const path = queue.shift();
    if (seen.has(path) || skip.test(path) || noisy.test(path)) continue;
    const tpl = template(path);
    const nTpl = (perTpl.get(tpl) ?? 0) + 1;
    perTpl.set(tpl, nTpl);
    if (tpl !== path && nTpl > perTemplate) continue;
    seen.add(path);
    log(`${role} [${seen.size}] ${path}`);
    errors.length = 0;
    let status = 0;
    try {
      const r = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30000 });
      status = r?.status() ?? 0;
      await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => null);
    } catch (e) {
      note("navigation", `${role} ${path}`, e.message.split("\n")[0]);
      continue;
    }
    stats.pages++;
    const body = (await page.textContent("body").catch(() => "")) ?? "";
    if (status >= 400) note("http", `${role} ${path}`, `HTTP ${status}`);
    if (/Application error|Internal Server Error|Unhandled Runtime|Произошла ошибка/i.test(body)) note("app-error", `${role} ${path}`, "текст ошибки на странице");
    for (const e of errors) note("console", `${role} ${path}`, e);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => false);
    if (overflow) note("layout", `${role} ${path}`, "горизонтальная прокрутка");
    // ссылки
    const links = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
    for (const h of links) {
      if (!h || h.startsWith("http") || h.startsWith("mailto") || h.startsWith("tel") || h.startsWith("#")) continue;
      stats.links++;
      const u = h.split("#")[0];
      if (u && !seen.has(u)) queue.push(u);
    }
    // безопасные кнопки: type=button вне форм с данными, без «опасных» слов
    const buttons = nTpl > 1 ? [] : await page.locator('button:visible, [role="button"]:visible, summary:visible').all().catch(() => []);
    for (const b of buttons.slice(0, 40)) {
      if (overBudget()) break;
      const text = ((await b.textContent().catch(() => "")) ?? "").trim();
      const type = await b.getAttribute("type").catch(() => null);
      const tag = await b.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
      const inForm = await b.evaluate((el) => !!el.closest("form")).catch(() => true);
      if (tag === "summary" || (type === "button" && !DESTRUCTIVE.test(text)) || (tag === "button" && !inForm && !DESTRUCTIVE.test(text))) {
        const before = page.url();
        try {
          await b.click({ timeout: 3000, trial: true });
          await b.click({ timeout: 3000 });
          stats.buttonsClicked++;
          await page.waitForTimeout(150);
          if (page.url() !== before) await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
        } catch (e) {
          if (!/intercepts pointer|not visible|detached|outside of the viewport/i.test(e.message)) note("button", `${role} ${path} «${text.slice(0, 30)}»`, e.message.split("\n")[0]);
        }
      }
    }
    for (const e of errors) note("console-after-click", `${role} ${path}`, e);
    stats.forms += await page.locator("form").count().catch(() => 0);
  }
  await ctx.close();
  return seen.size;
}

/** Гостевой путь: товар → корзина → изменение количества → оформление до шага «Проверка» (без подтверждения). */
async function guestJourney(viewport, label) {
  const { ctx, page, errors } = await newPage(viewport);
  let shot = 0;
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      // диагностика: адрес, заголовок и начало текста страницы + скриншот в audit-shots/
      const where = page.url().replace(base, "");
      const text = ((await page.textContent("body").catch(() => "")) ?? "").replace(/\s+/g, " ").slice(0, 160);
      const file = `audit-shots/${label}-${++shot}.png`;
      await mkdir("audit-shots", { recursive: true }).catch(() => null);
      await page.screenshot({ path: file, fullPage: true }).catch(() => null);
      note("journey", `${label} ${name}`, `${e.message.split("\n")[0]} | url ${where} | «${text}» | ${file}`);
      return false;
    }
    return true;
  };
  await step("главная", () => page.goto(base + "/", { waitUntil: "networkidle" }));
  await step("cookie-баннер: только необходимые", () => page.locator("button:has-text('Только необходимые')").click({ timeout: 5000 }));
  await step("каталог", () => page.goto(base + "/catalog", { waitUntil: "networkidle" }));
  const hrefs = await page.locator("a[href^='/product/']").evaluateAll((a) => [...new Set(a.map((x) => x.getAttribute("href")))]).catch(() => []);
  let added = false;
  for (const href of hrefs.slice(0, 10)) {
    await page.goto(base + href, { waitUntil: "networkidle" }).catch(() => null);
    const size = page.locator("button.min-w-12:not([disabled])").first();
    if (await size.count()) await size.click().catch(() => null);
    const btn = page.locator("button:has-text('Добавить в корзину')");
    if (await btn.count()) {
      await btn.click();
      added = await page.locator("text=Добавлено в корзину").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
      if (added) break;
    }
  }
  if (!added) note("journey", `${label} добавление в корзину`, "ни у одного из первых 10 товаров нет кнопки «Добавить в корзину» или она не сработала");
  await step("корзина открывается с товаром", async () => {
    await page.goto(base + "/cart", { waitUntil: "networkidle" });
    if ((await page.locator("select[name='quantity']").count()) === 0) throw new Error("корзина пуста после добавления");
  });
  await step("корзина: изменить количество", async () => {
    await page.locator("select[name='quantity']").first().selectOption("1");
    await page.locator("button:has-text('Обновить')").first().click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState("networkidle");
  });
  await step("оформление: шаг 1", async () => {
    await page.goto(base + "/checkout", { waitUntil: "networkidle" });
    await page.locator('input[name="firstName"]').waitFor({ timeout: 15000 });
    await page.fill('input[name="firstName"]', "Тест");
    await page.fill('input[name="email"]', "audit@example.com");
    await page.fill('input[name="phone"]', "+79990000000");
    await page.locator('label:has(input[name="deliveryMethod"][value="COURIER"])').click();
    await page.fill('textarea[name="addressText"]', "Москва, Тверская, 1");
    await page.locator("button:has-text('Далее')").first().click();
    await page.waitForTimeout(400);
    if (await page.locator('section[data-step="1"]').getAttribute("hidden") !== null) throw new Error("шаг 2 не открылся");
  });
  await step("оформление: шаг 2 (промокод, оплата)", async () => {
    await page.locator("summary:has-text('Промокод')").click();
    await page.fill('input[placeholder="WELCOME10"]', "WELCOME10");
    await page.locator("button:has-text('Применить')").first().click();
    await page.waitForTimeout(1200);
    await page.locator('label:has(input[name="paymentMethod"][value="SBP"])').click();
    await page.locator("button:has-text('Далее')").first().click();
    await page.waitForTimeout(400);
    if (await page.locator('section[data-step="2"]').getAttribute("hidden") !== null) throw new Error("шаг 3 не открылся");
    if ((await page.locator("button:has-text('Подтвердить')").count()) === 0) throw new Error("нет кнопки подтверждения");
  });
  await step("корзина: удалить товар", async () => {
    await page.goto(base + "/cart", { waitUntil: "networkidle" });
    const before = await page.locator("select[name='quantity']").count();
    await page.locator("button:has-text('Удалить')").first().click();
    // ждём, пока серверное действие перерисует корзину
    await page.waitForFunction((n) => document.querySelectorAll("select[name='quantity']").length < n, before, { timeout: 15000 }).catch(() => null);
    if ((await page.locator("select[name='quantity']").count()) !== before - 1) throw new Error("товар не удалился");
  });
  await step("вход: неверный пароль показывает ошибку", async () => {
    await page.goto(base + "/login");
    await page.fill('input[name="email"]', "nobody@example.com");
    await page.fill('input[name="password"]', "wrong-password-1");
    await page.click("form button.btn-primary");
    await page.locator("p.text-danger").first().waitFor({ timeout: 15000 });
  });
  await step("восстановление пароля: форма принимает e-mail", async () => {
    await page.goto(base + "/forgot");
    await page.fill('input[name="email"]', "nobody@example.com");
    await page.click("form button.btn-primary");
    await page.waitForTimeout(1500);
    if (/Application error|Internal Server Error/.test((await page.textContent("body")) ?? "")) throw new Error("ошибка страницы");
  });
  await step("поиск и фильтры каталога", async () => {
    await page.goto(base + "/catalog?q=платье", { waitUntil: "networkidle" });
    await page.goto(base + "/catalog?sort=price_asc&size=S", { waitUntil: "networkidle" });
  });
  await step("мобильное меню", async () => {
    if (viewport.width > 700) return;
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.locator("header button").first().click();
    await page.locator("a[href='/cart']").first().waitFor({ timeout: 5000 });
  });
  for (const e of errors) note("console", `${label} journey`, e);
  await ctx.close();
}

/** CRM: вход сотрудником, обход страниц, фильтры и поиск, печатные формы. Без изменений данных. */
async function crmAudit() {
  if (!crmEmail || !crmPassword) {
    console.log("CRM: учётные данные не заданы (CRM_EMAIL/CRM_PASSWORD), раздел пропущен");
    return;
  }
  const n = await crawl("crm-desktop", { width: 1440, height: 900 }, ["/crm", "/crm/security", "/crm/settings", "/crm/integrations", "/crm/orders", "/crm/customers", "/crm/products", "/crm/stock", "/crm/support", "/crm/analytics", "/crm/finance", "/crm/campaigns", "/crm/tasks", "/crm/staff", "/crm/audit"], { email: crmEmail, password: crmPassword });
  await crawl("crm-mobile", { width: 390, height: 844 }, ["/crm", "/crm/orders", "/crm/customers", "/crm/products", "/crm/settings"], { email: crmEmail, password: crmPassword });
  const { ctx, page, errors } = await newPage({ width: 1440, height: 900 });
  await page.goto(`${base}/login`);
  await page.fill('input[name="email"]', crmEmail);
  await page.fill('input[name="password"]', crmPassword);
  await page.click("form button.btn-primary");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => null);
  const check = async (name, fn) => { try { await fn(); } catch (e) { note("crm", name, e.message.split("\n")[0]); } };
  await check("поиск по заказам", async () => { await page.goto(`${base}/crm/orders?q=1`, { waitUntil: "networkidle" }); });
  await check("фильтр заказов по статусу", async () => { await page.goto(`${base}/crm/orders?status=PAID`, { waitUntil: "networkidle" }); });
  await check("карточка заказа и печать", async () => {
    await page.goto(`${base}/crm/orders`, { waitUntil: "networkidle" });
    const link = page.locator("a[href^='/crm/orders/']").first();
    if (!(await link.count())) return;
    const href = await link.getAttribute("href");
    await page.goto(base + href, { waitUntil: "networkidle" });
    const r = await page.request.get(base + href + "/print");
    if (r.status() !== 200) throw new Error("печать: HTTP " + r.status());
  });
  await check("карточка клиентки", async () => {
    await page.goto(`${base}/crm/customers`, { waitUntil: "networkidle" });
    const link = page.locator("a[href^='/crm/customers/']").first();
    if (await link.count()) await page.goto(base + (await link.getAttribute("href")), { waitUntil: "networkidle" });
  });
  await check("карточка товара", async () => {
    await page.goto(`${base}/crm/products`, { waitUntil: "networkidle" });
    const link = page.locator("a[href^='/crm/products/']").first();
    if (await link.count()) await page.goto(base + (await link.getAttribute("href")), { waitUntil: "networkidle" });
  });
  await check("аналитика за 90 дней", async () => { await page.goto(`${base}/crm/analytics?period=90`, { waitUntil: "networkidle" }); });
  await check("выход", async () => {
    await page.goto(`${base}/crm`, { waitUntil: "networkidle" });
    await page.locator("summary").first().click();
    await page.locator("button:has-text('Выйти')").click();
    await page.waitForURL((u) => !u.pathname.startsWith("/crm"), { timeout: 15000 });
  });
  for (const e of errors) note("console", "crm checks", e);
  await ctx.close();
  console.log(`CRM: пройдено страниц ${n ?? 0}`);
}

console.log("Аудит:", base, `(лимит ${maxPages} страниц, ${budgetMs / 60000} мин)`);
const siteDesktop = await crawl("site-desktop", { width: 1366, height: 900 }, ["/"]);
const siteMobile = await crawl("site-mobile", { width: 390, height: 844 }, ["/", "/catalog", "/cart", "/login", "/register", "/journal", "/lookbook", "/gift", "/circle"]);
log("гостевой путь");
await guestJourney({ width: 1366, height: 900 }, "desktop");
await guestJourney({ width: 390, height: 844 }, "mobile");
log("CRM");
await crmAudit();
await browser.close();

console.log(`Страниц: сайт ${siteDesktop ?? 0} (десктоп) + ${siteMobile ?? 0} (телефон); всего загрузок ${stats.pages}; ссылок ${stats.links}; безопасных кнопок нажато ${stats.buttonsClicked}; форм на страницах ${stats.forms}`);
const grouped = problems.reduce((m, p) => { (m[p.kind] ??= []).push(p); return m; }, {});
for (const [kind, list] of Object.entries(grouped)) {
  console.log(`\n== ${kind}: ${list.length}`);
  for (const p of list.slice(0, 40)) console.log(`  ${p.where} — ${p.detail}`);
}
const blocking = problems.filter((p) => ["http", "app-error", "navigation", "journey", "login", "crm"].includes(p.kind));
console.log(`\nИТОГ: ${blocking.length === 0 ? "ОШИБОК НЕТ" : `${blocking.length} ошибок`} (замечаний всего ${problems.length})`);
process.exit(blocking.length === 0 ? 0 : 1);
