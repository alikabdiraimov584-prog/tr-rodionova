// Браузерный аудит сайта и CRM: обход всех страниц, клики по безопасным кнопкам, формы, гостевой путь до оплаты.
// Запуск: BASE_URL=https://tr-rodionova.ru [CRM_EMAIL=... CRM_PASSWORD=... CRM_TOTP_SECRET=...] [CUSTOMER_EMAIL=... CUSTOMER_PASSWORD=...] [CHROME_PATH=...] node scripts/browser-audit.mjs
// На боевом сайте ничего не создаёт и не удаляет: заказ не подтверждается, в CRM только чтение и фильтры.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createHmac } from "node:crypto";

const base = (process.env.BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const crmEmail = process.env.CRM_EMAIL;
const crmPassword = process.env.CRM_PASSWORD;
const crmTotp = process.env.CRM_TOTP_SECRET;
const customerEmail = process.env.CUSTOMER_EMAIL; // клиентка для обхода витрины под её ролью
const customerPassword = process.env.CUSTOMER_PASSWORD; // base32-ключ 2FA тестового сотрудника (CRM требует второй фактор)

/** Код TOTP (RFC 6238, SHA-1, 30 с, 6 цифр) из base32-секрета — как в приложении-аутентификаторе. */
function totpCode(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

/** Вход сотрудника: пароль и, если спросили, код из приложения. */
async function staffLogin(page, email, password) {
  await page.goto(`${base}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click("form button.btn-primary");
  await page.waitForURL((u) => !/^\/login\/?$/.test(u.pathname), { timeout: 20000 });
  if (page.url().includes("/login/2fa")) {
    if (!crmTotp) throw new Error("CRM требует код 2FA: задайте CRM_TOTP_SECRET");
    await page.fill('input[name="code"]', totpCode(crmTotp));
    await page.click("form button.btn-primary");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  }
}
const maxPages = Number(process.env.MAX_PAGES ?? 120);
const perTemplate = Number(process.env.PER_TEMPLATE ?? 4); // сколько страниц одного шаблона (/product/*, /journal/*) обходить
const budgetMs = Number(process.env.TIME_BUDGET_MIN ?? 20) * 60_000;
let startedAt = Date.now();
const overBudget = () => Date.now() - startedAt > budgetMs;
const resetBudget = () => { startedAt = Date.now(); };
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
// шаблон маршрута: /product/abc → /product/*, /crm/orders/123 → /crm/orders/*
const template = (path) => path.replace(/\/(product|journal|lookbook|orders|customers|products|returns|tickets|collections|staff|promos|reviews|stock|notifications)\/[^/?]+/g, "/$1/*");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

const problems = [];
const stats = { pages: 0, buttonsClicked: 0, forms: 0, links: 0 };
const note = (kind, where, detail) => problems.push({ kind, where, detail: String(detail).slice(0, 400) });

// Доступность: axe-core (WCAG 2.1 A/AA) на каждой загруженной странице. Источник подаётся через page.evaluate строкой —
// это выполняется через протокол браузера и не упирается в CSP сайта. Нарушения копятся по правилам, чтобы одна
// проблема шапки не превращалась в сотню строк. critical и serious считаются ошибками, остальные — замечаниями.
const A11Y = process.env.A11Y !== "0";
let axeSource = null;
try { axeSource = A11Y ? readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8") : null; } catch { axeSource = null; }
const a11y = new Map(); // id → { impact, help, pages: Set, example }
async function checkA11y(page, role, path) {
  if (!axeSource) return;
  try {
    await page.evaluate(axeSource);
    const r = await page.evaluate(() => window.axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    for (const v of r.violations) {
      const key = `${v.id}|${v.impact}`;
      const cur = a11y.get(key) ?? { id: v.id, impact: v.impact, help: v.help, pages: new Set(), example: `${role} ${path} → ${v.nodes[0]?.target?.[0] ?? ""}`.slice(0, 160) };
      cur.pages.add(`${role} ${path}`);
      a11y.set(key, cur);
    }
  } catch (e) {
    note("a11y-skip", `${role} ${path}`, e.message.split("\n")[0]);
  }
}

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
const noisy = /[?&](page|sort|size|color|material|price|q|new|period|dim|from|to|status|tab|next)=/;

async function crawl(role, viewport, startPaths, login) {
  resetBudget(); // лимит времени — на каждый обход отдельно
  const { ctx, page, errors } = await newPage(viewport);
  if (login) {
    try {
      await staffLogin(page, login.email, login.password);
    } catch (e) {
      note("login", role, "не удалось войти: " + (e instanceof Error ? e.message : String(e)) + " / " + (await page.locator("p.text-danger").first().textContent().catch(() => "без сообщения")));
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
    // куда реально привела ссылка: с витрины нельзя попадать в CRM, а вошедшим — на форму входа
    const landed = new URL(page.url()).pathname;
    const asked = path.split("?")[0];
    if (role.startsWith("site") && landed !== asked) {
      if (landed.startsWith("/crm")) note("redirect", `${role} ${path}`, `ссылка витрины ведёт в CRM (${landed})`);
      else if (role === "site-customer" && landed.startsWith("/login")) note("redirect", `${role} ${path}`, `вошедшую клиентку отправило на форму входа (${landed})`);
    }
    const body = (await page.textContent("body").catch(() => "")) ?? "";
    if (status >= 400) note("http", `${role} ${path}`, `HTTP ${status}`);
    // витрина — для покупателей: ни ссылок в рабочие разделы, ни слова CRM, кем бы ни был вошедший
    if (role.startsWith("site") && !landed.startsWith("/crm")) {
      const crmLinks = await page.locator('a[href^="/crm"], a[href*="//"][href*="/crm"]').count().catch(() => 0);
      if (crmLinks) note("crm-leak", `${role} ${path}`, `на витрине ссылка в CRM (${crmLinks} шт.)`);
      if (/\bCRM\b/.test(body)) note("crm-leak", `${role} ${path}`, "на витрине слово CRM");
    }
    if (/Application error|Internal Server Error|Unhandled Runtime|Произошла ошибка/i.test(body)) note("app-error", `${role} ${path}`, "текст ошибки на странице");
    for (const e of errors) note("console", `${role} ${path}`, e);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => false);
    if (overflow) note("layout", `${role} ${path}`, "горизонтальная прокрутка");
    // битые фото: <img> с src, у которого загрузка завершилась без размеров (файл или оптимизатор не ответили); ленивые ещё не грузились и не считаются
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).map((i) => i.currentSrc || i.src).slice(0, 5)).catch(() => []);
    for (const src of broken) note("image", `${role} ${path}`, `битое фото: ${src.replace(base, "")}`);
    await checkA11y(page, role, path);
    // разметка schema.org: каждый блок должен парситься, а шаблоны товара, статьи и FAQ — нести свой тип
    if (role.startsWith("site")) {
      const ld = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent || "")).catch(() => []);
      const types = [];
      for (const src of ld) {
        try { const d = JSON.parse(src); for (const it of Array.isArray(d) ? d : [d]) types.push(it["@type"]); } catch (e) { note("jsonld", `${role} ${path}`, `разметка не парсится: ${e.message.slice(0, 80)}`); }
      }
      const expect = asked.startsWith("/product/") ? "Product" : asked.startsWith("/journal/") && !asked.includes("feed") ? "Article" : asked === "/faq" ? "FAQPage" : null;
      if (expect && !types.includes(expect)) note("jsonld", `${role} ${path}`, `нет разметки ${expect} (есть: ${types.join(", ") || "ничего"})`);
      if (!types.includes("Organization")) note("jsonld", `${role} ${path}`, "нет разметки Organization в макете");
    }
    // ссылки
    const links = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
    for (const h of links) {
      if (!h || h.startsWith("http") || h.startsWith("mailto") || h.startsWith("tel") || h.startsWith("#")) continue;
      stats.links++;
      const u = h.split("#")[0];
      if (role.startsWith("site") && u.startsWith("/crm")) continue; // обход CRM — отдельный этап
      if (u && !seen.has(u)) queue.push(u);
    }
    // безопасные кнопки: type=button вне форм с данными, без «опасных» слов.
    // Свойства собираем одним вызовом: после клика по <summary> старые хэндлы устаревают и каждое обращение ждало бы таймаут.
    const SEL = 'button:visible, [role="button"]:visible, summary:visible';
    const metas = nTpl > 1 ? [] : await page.locator(SEL).evaluateAll((els) => els.map((el) => ({
      text: (el.textContent ?? "").trim(), type: el.getAttribute("type"), tag: el.tagName.toLowerCase(), inForm: !!el.closest("form"),
    }))).catch(() => []);
    for (let i = 0; i < Math.min(metas.length, 40); i++) {
      if (overBudget()) break;
      const { text, type, tag, inForm } = metas[i];
      if (!(tag === "summary" || (type === "button" && !DESTRUCTIVE.test(text)) || (tag === "button" && !inForm && !DESTRUCTIVE.test(text)))) continue;
      const before = page.url();
      try {
        // после раскрытия <details> индексы сдвигаются — ищем элемент по тексту, индекс только для безымянных
        const target = text ? page.locator(SEL).filter({ hasText: text.slice(0, 40) }).first() : page.locator(SEL).nth(i);
        await target.click({ timeout: 2000 });
        stats.buttonsClicked++;
        await page.waitForTimeout(150);
        if (page.url() !== before) await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
      } catch (e) {
        if (!/intercepts pointer|not visible|detached|outside of the viewport|resolved to|strict mode/i.test(e.message)) note("button", `${role} ${path} «${text.slice(0, 30)}»`, e.message.split("\n")[0]);
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
  // «Далее»: нажать и дождаться открытия следующего шага; при холодном старте сервера повторить один раз
  const clickNext = async (step) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.locator("button:visible:has-text('Далее')").first().click();
      const opened = await page.waitForFunction((n) => !document.querySelector(`section[data-step="${n}"]`)?.hasAttribute("hidden"), step, { timeout: 5000 }).then(() => true).catch(() => false);
      if (opened) return;
    }
    // диагностика: невалидные поля текущего шага и сообщение об ошибке
    const diag = await page.evaluate((n) => {
      const sec = document.querySelector(`section[data-step="${n - 1}"]`);
      const invalid = sec ? [...sec.querySelectorAll(":invalid")].map((el) => `${el.name || el.tagName}:${el.validationMessage}`) : ["нет секции"];
      const err = document.querySelector("p.text-danger")?.textContent?.trim() ?? "";
      const hydrated = !!document.querySelector("form[data-hydrated], form") && typeof window.__next_f !== "undefined";
      return { invalid, err, hydrated, steps: [...document.querySelectorAll("section[data-step]")].map((s) => `${s.dataset.step}:${s.hasAttribute("hidden") ? "hidden" : "shown"}`) };
    }, step).catch((e) => ({ invalid: [e.message] }));
    throw new Error(`шаг ${step + 1} не открылся: ${JSON.stringify(diag)}`);
  };
  await step("главная", () => page.goto(base + "/", { waitUntil: "domcontentloaded" }));
  await step("cookie-баннер: только необходимые", () => page.locator("button:has-text('Только необходимые')").click({ timeout: 5000 }));
  await step("каталог", () => page.goto(base + "/catalog", { waitUntil: "domcontentloaded" }));
  const hrefs = await page.locator("a[href^='/product/']").evaluateAll((a) => [...new Set(a.map((x) => x.getAttribute("href")))]).catch(() => []);
  let added = false;
  for (const href of hrefs.slice(0, 10)) {
    await page.goto(base + href, { waitUntil: "domcontentloaded" }).catch(() => null);
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
    await page.goto(base + "/cart", { waitUntil: "domcontentloaded" });
    if ((await page.locator("select[name='quantity']").count()) === 0) throw new Error("корзина пуста после добавления");
  });
  await step("корзина: изменить количество", async () => {
    await page.locator("select[name='quantity']").first().selectOption("1");
    await page.locator("button:has-text('Обновить')").first().click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState("networkidle");
  });
  await step("оформление: шаг 1", async () => {
    await page.goto(base + "/checkout", { waitUntil: "domcontentloaded" });
    await page.locator('input[name="firstName"]').waitFor({ timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null); // как живой покупатель: заполняем после загрузки скриптов
    await page.fill('input[name="firstName"]', "Тест");
    await page.fill('input[name="email"]', "audit@example.com");
    await page.fill('input[name="phone"]', "+79990000000");
    await page.locator('label:has(input[name="deliveryMethod"][value="COURIER"])').click();
    await page.fill('textarea[name="addressText"]', "Москва, Тверская, 1");
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null); // дождаться гидратации формы
    await clickNext(1);
  });
  await step("оформление: шаг 2 (промокод, оплата)", async () => {
    await page.locator("summary:visible:has-text('Промокод')").first().click();
    await page.fill('input[placeholder="WELCOME10"]', "WELCOME10");
    await page.locator("button:visible:has-text('Применить')").first().click();
    await page.waitForTimeout(1200);
    await page.locator('label:has(input[name="paymentMethod"][value="SBP"])').click();
    await clickNext(2);
    if ((await page.locator("button:has-text('Подтвердить')").count()) === 0) throw new Error("нет кнопки подтверждения");
  });
  await step("корзина: удалить товар", async () => {
    await page.goto(base + "/cart", { waitUntil: "domcontentloaded" });
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
    await page.goto(base + "/catalog?q=платье", { waitUntil: "domcontentloaded" });
    await page.goto(base + "/catalog?sort=price_asc&size=S", { waitUntil: "domcontentloaded" });
  });
  await step("мобильное меню", async () => {
    if (viewport.width > 700) return;
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
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
  await staffLogin(page, crmEmail, crmPassword).catch((e) => note("login", "crm checks", e instanceof Error ? e.message : String(e)));
  const check = async (name, fn) => { try { await fn(); } catch (e) { note("crm", name, e.message.split("\n")[0]); } };
  await check("поиск по заказам", async () => { await page.goto(`${base}/crm/orders?q=1`, { waitUntil: "domcontentloaded" }); });
  await check("фильтр заказов по статусу", async () => { await page.goto(`${base}/crm/orders?status=PAID`, { waitUntil: "domcontentloaded" }); });
  await check("карточка заказа и печать", async () => {
    await page.goto(`${base}/crm/orders`, { waitUntil: "domcontentloaded" });
    const link = page.locator("a[href^='/crm/orders/']:not([href$='/new'])").first();
    if (!(await link.count())) return;
    const href = await link.getAttribute("href");
    await page.goto(base + href, { waitUntil: "domcontentloaded" });
    const r = await page.request.get(base + href + "/print");
    if (r.status() !== 200) throw new Error("печать: HTTP " + r.status());
  });
  await check("карточка клиентки", async () => {
    await page.goto(`${base}/crm/customers`, { waitUntil: "domcontentloaded" });
    const link = page.locator("a[href^='/crm/customers/']:not([href*='export'])").first();
    if (await link.count()) await page.goto(base + (await link.getAttribute("href")), { waitUntil: "domcontentloaded" });
  });
  await check("карточка товара", async () => {
    await page.goto(`${base}/crm/products`, { waitUntil: "domcontentloaded" });
    const link = page.locator("a[href^='/crm/products/']:not([href*='export']):not([href$='/new'])").first();
    if (await link.count()) await page.goto(base + (await link.getAttribute("href")), { waitUntil: "domcontentloaded" });
  });
  await check("аналитика за 90 дней", async () => { await page.goto(`${base}/crm/analytics?period=90`, { waitUntil: "domcontentloaded" }); });
  await check("выход", async () => {
    await page.goto(`${base}/crm`, { waitUntil: "domcontentloaded" });
    await page.locator("summary").first().click();
    await page.locator("button:has-text('Выйти')").click();
    await page.waitForURL((u) => !u.pathname.startsWith("/crm"), { timeout: 15000 });
  });
  for (const e of errors) note("console", "crm checks", e);
  await ctx.close();
  console.log(`CRM: пройдено страниц ${n ?? 0}`);
}

console.log("Аудит:", base, `(лимит ${maxPages} страниц, ${budgetMs / 60000} мин)`);
const only = process.env.ONLY ?? ""; // ONLY=journey|crm — запустить одну часть
const siteDesktop = only && only !== "site" ? 0 : await crawl("site-desktop", { width: 1366, height: 900 }, ["/"]);
const siteMobile = only && only !== "site" ? 0 : await crawl("site-mobile", { width: 390, height: 844 }, ["/", "/catalog", "/cart", "/login", "/register", "/journal", "/lookbook", "/gift", "/circle"]);
// витрина глазами вошедшей клиентки и сотрудника: те же страницы, но ссылки «Кабинет», «Вступить», избранное зависят от роли
const SITE_START = ["/", "/circle", "/catalog", "/cart", "/journal", "/lookbook", "/gift", "/sizes", "/preloved", "/showroom", "/account"];
if ((!only || only === "site") && customerEmail && customerPassword) await crawl("site-customer", { width: 1366, height: 900 }, SITE_START, { email: customerEmail, password: customerPassword });
if ((!only || only === "site") && crmEmail && crmPassword) await crawl("site-staff", { width: 1366, height: 900 }, SITE_START, { email: crmEmail, password: crmPassword });
log("гостевой путь");
if (!only || only === "journey") {
  await guestJourney({ width: 1366, height: 900 }, "desktop");
  await guestJourney({ width: 390, height: 844 }, "mobile");
}
log("CRM");
if (!only || only === "crm") await crmAudit();
await browser.close();

console.log(`Страниц: сайт ${siteDesktop ?? 0} (десктоп) + ${siteMobile ?? 0} (телефон); всего загрузок ${stats.pages}; ссылок ${stats.links}; безопасных кнопок нажато ${stats.buttonsClicked}; форм на страницах ${stats.forms}`);
for (const v of [...a11y.values()].sort((a, b) => b.pages.size - a.pages.size)) {
  note(["critical", "serious"].includes(v.impact) ? "a11y" : "a11y-minor", `${v.id} (${v.impact}, ${v.pages.size} стр.)`, `${v.help}; напр. ${v.example}`);
}
const grouped = problems.reduce((m, p) => { (m[p.kind] ??= []).push(p); return m; }, {});
for (const [kind, list] of Object.entries(grouped)) {
  console.log(`\n== ${kind}: ${list.length}`);
  for (const p of list.slice(0, 40)) console.log(`  ${p.where} — ${p.detail}`);
}
const blocking = problems.filter((p) => ["http", "app-error", "navigation", "journey", "login", "crm", "redirect", "image", "crm-leak", "a11y", "jsonld"].includes(p.kind));
console.log(`\nИТОГ: ${blocking.length === 0 ? "ОШИБОК НЕТ" : `${blocking.length} ошибок`} (замечаний всего ${problems.length})`);
process.exit(blocking.length === 0 ? 0 : 1);
