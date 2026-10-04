// Запуск: DATABASE_URL=... E2E_BASE_URL=http://localhost:3000 CHROME_PATH=... node scripts/e2e.mjs (нужен playwright-core: npm i -D playwright-core)
// Требует ALLOW_DEMO_PAYMENTS=1 у сервера. Создаёт тестовую клиентку, заказ, возврат, диалог и сертификат.
// Сквозная проверка сценариев на локальной сборке: регистрация → заказ → оплата → CRM → возврат → поддержка → задачи.
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
await sql.connect();
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const results = [];
const step = async (name, fn) => {
  try {
    const info = await fn();
    results.push(`PASS ${name}${info ? ` — ${info}` : ""}`);
  } catch (e) {
    const lines = String(e.message ?? e).split("\n"); results.push(`FAIL ${name} — ${lines[0]} ${(lines.find((l) => l.includes("waiting for")) ?? "").trim()}`);
  }
};
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
const shot = (n) => page.screenshot({ path: `e2e-${n}.png`, fullPage: false });
const stamp = Date.now();
const email = `test${stamp}@example.com`;
let orderId = "";
let orderNumber = 0;

await step("Регистрация и 2 000 приветственных баллов", async () => {
  await page.goto(`${base}/register`);
  await page.fill('input[name="firstName"]', "Тест");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', "+79990001122");
  await page.fill('input[name="password"]', "test12345678");
  for (const cb of await page.locator('input[type="checkbox"]').all()) await cb.check().catch(() => {});
  await page.click("form button.btn-primary");
  await page.waitForURL(/\/account/, { timeout: 20000 });
  const r = await sql.query('SELECT "pointsBalance" FROM "User" WHERE email=$1', [email]);
  if (r.rows[0]?.pointsBalance !== 2000) throw new Error(`баланс ${r.rows[0]?.pointsBalance}`);
  await shot("01-account-new");
  return "баланс 2000";
});

await step("Товар в корзину", async () => {
  await page.goto(`${base}/catalog`);
  const links = await page.locator('a[href^="/product/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  let added = false;
  for (const href of links.slice(0, 6)) {
    await page.goto(base + href);
    const sizes = page.locator('button.min-w-12:not(.line-through)');
    if ((await sizes.count()) === 0) continue;
    await sizes.first().click();
    const btn = page.locator("form button.btn-primary", { hasText: /в корзину/i }).first();
    if (!(await btn.count())) continue;
    await btn.click();
    await page.waitForTimeout(1500);
    const cart = await sql.query('SELECT count(*)::int AS n FROM "CartItem" c JOIN "User" u ON u.id=c."userId" WHERE u.email=$1', [email]);
    if (cart.rows[0].n > 0) { added = true; break; }
  }
  if (!added) throw new Error("не удалось добавить товар");
  await shot("02-product");
  return "в корзине 1 позиция";
});

await step("Оформление заказа: промокод WELCOME10 + баллы", async () => {
  await page.goto(`${base}/checkout`);
  // шаг 1: доставка СДЭК с адресом
  await page.locator('label:has(input[name="deliveryMethod"][value="CDEK"])').click();
  await page.waitForTimeout(500);
  await page.fill('textarea[name="addressText"]', "Москва, ул. Тверская, д. 1, кв. 1, 125009");
  await page.locator('button:has-text("Далее")').first().click();
  await page.waitForTimeout(500);
  // шаг 2: промокод, оплата картой, баллы
  await page.locator("summary:has-text('Промокод')").click();
  await page.locator('input[placeholder="WELCOME10"]').fill("WELCOME10");
  await page.locator('button:has-text("Применить")').first().click();
  await page.waitForTimeout(1500);
  await page.locator('label:has(input[name="paymentMethod"][value="CARD"])').click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Макс.")').click();
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("Далее")').first().click();
  await page.waitForTimeout(500);
  await shot("03-checkout");
  // редирект из server action: не ждём завершения навигации внутри click, ждём URL отдельно
  await page.locator('button:has-text("Подтвердить заказ")').first().click({ noWaitAfter: true });
  await page.waitForURL(/\/account\/orders\/[^/?]+/, { timeout: 30000 });
  orderId = page.url().match(/orders\/([^/?]+)/)[1];
  const o = await sql.query('SELECT number, status, subtotal, discount, "pointsUsed", total, "promoCodeId" FROM "Order" WHERE id=$1', [orderId]);
  const r = o.rows[0];
  orderNumber = r.number;
  if (!r.promoCodeId) throw new Error("промокод не применился");
  if (r.pointsUsed <= 0) throw new Error("баллы не списались");
  const n = await sql.query('SELECT count(*)::int AS n FROM "Notification" WHERE "orderId"=$1 AND event=$2', [orderId, "ORDER_CREATED"]);
  return `№${r.number}: subtotal ${r.subtotal / 100} ₽, скидка ${r.discount / 100} ₽, баллов ${r.pointsUsed}, к оплате ${r.total / 100} ₽; уведомлений ORDER_CREATED: ${n.rows[0].n}`;
});

await step("Демо-оплата заказа", async () => {
  await page.goto(`${base}/account/orders/${orderId}`);
  await page.click('button:has-text("Оплатить")');
  await page.waitForTimeout(2500);
  const o = await sql.query('SELECT status FROM "Order" WHERE id=$1', [orderId]);
  if (o.rows[0].status !== "PAID") throw new Error(`статус ${o.rows[0].status}`);
  const led = await sql.query('SELECT type, amount FROM "LedgerEntry" WHERE "orderId"=$1 ORDER BY type', [orderId]);
  await shot("04-order-paid");
  return `проводки: ${led.rows.map((x) => `${x.type} ${x.amount / 100}`).join(", ")}`;
});

const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const crm = await admin.newPage();
crm.on("dialog", (d) => d.accept());
await step("Вход администратора в CRM", async () => {
  await crm.goto(`${base}/login`);
  await crm.fill('input[name="email"]', "admin@tr-rodionova.ru");
  await crm.fill('input[name="password"]', "admin12345");
  await crm.click("form button.btn-primary");
  await crm.waitForURL(/\/crm/, { timeout: 20000 });
});

for (const [status, label] of [["CONFIRMED", "подтверждён"], ["PACKING", "комплектуется"], ["SHIPPED", "отправлен"], ["DELIVERED", "доставлен"]]) {
  await step(`CRM: заказ №${orderNumber} → ${label}`, async () => {
    await crm.goto(`${base}/crm/orders/${orderId}`);
    await crm.selectOption('select[name="status"]', status);
    if (status === "SHIPPED") await crm.locator('form:has(select[name="status"]) input[name="trackingNumber"]').fill("CDEK1234567890");
    await crm.locator('select[name="status"]').locator("xpath=ancestor::form").locator("button.btn-primary").click();
    await crm.waitForTimeout(2000);
    const o = await sql.query('SELECT status, "trackingNumber" FROM "Order" WHERE id=$1', [orderId]);
    if (o.rows[0].status !== status) throw new Error(`статус ${o.rows[0].status}`);
    if (status === "SHIPPED") await crm.screenshot({ path: "e2e-05-crm-order.png" });
    return status === "SHIPPED" ? `трек ${o.rows[0].trackingNumber}` : "";
  });
}

await step("Кабинет: статус «Доставлен» и уведомления", async () => {
  await page.goto(`${base}/account/orders/${orderId}`);
  const txt = await page.textContent("body");
  if (!/доставлен/i.test(txt)) throw new Error("статус не показан");
  const n = await sql.query('SELECT event, channel, status FROM "Notification" WHERE "orderId"=$1 ORDER BY "createdAt"', [orderId]);
  await shot("06-order-delivered");
  return n.rows.map((x) => `${x.event}/${x.channel}:${x.status}`).join(", ");
});

await step("CRM: частичный возврат, деньги и сторно себестоимости", async () => {
  await crm.goto(`${base}/crm/orders/${orderId}`);
  const sel = crm.locator('select[name^="ret_"]').first();
  await sel.selectOption("1");
  await crm.click('button:has-text("Оформить возврат")');
  await crm.waitForTimeout(2500);
  const led = await sql.query('SELECT type, amount FROM "LedgerEntry" WHERE "orderId"=$1 AND type IN ($2,$3) ORDER BY type', [orderId, "REFUND", "COGS_REVERSAL"]);
  const types = led.rows.map((x) => x.type);
  if (!types.includes("REFUND") || !types.includes("COGS_REVERSAL")) throw new Error(`проводки: ${types.join(",") || "нет"}`);
  const o = await sql.query('SELECT status FROM "Order" WHERE id=$1', [orderId]);
  const items = await sql.query('SELECT quantity, "returnedQty" FROM "OrderItem" WHERE "orderId"=$1', [orderId]);
  const mv = await sql.query('SELECT type, quantity FROM "StockMovement" WHERE "orderId"=$1 ORDER BY "createdAt"', [orderId]);
  await crm.screenshot({ path: "e2e-07-crm-return.png" });
  return `${led.rows.map((x) => `${x.type} ${x.amount / 100} ₽`).join(", ")}; статус ${o.rows[0].status}; возвращено ${items.rows.map((i) => `${i.returnedQty}/${i.quantity}`).join(" ")}; склад: ${mv.rows.map((m) => `${m.type}${m.quantity > 0 ? "+" : ""}${m.quantity}`).join(" ")}`;
});

await step("Финансы: P&L открывается, сторно видно", async () => {
  await crm.goto(`${base}/crm/finance`);
  const txt = await crm.textContent("body");
  if (!/Себестоимость|маржа/i.test(txt)) throw new Error("страница без P&L");
  await crm.screenshot({ path: "e2e-08-finance.png", fullPage: true });
});

let convId = "";
await step("Кабинет: сообщение в службу заботы", async () => {
  await page.goto(`${base}/account/support`);
  await page.fill('textarea[name="text"]', `Здравствуйте! Вопрос по заказу №${orderNumber}: когда вернутся деньги за возврат?`);
  await page.click('button:has-text("Отправить")');
  await page.waitForTimeout(2000);
  const c = await sql.query('SELECT c.id, c.status, c.priority, c.tags, c."orderNumbers", c."assigneeId" FROM "Conversation" c JOIN "Contact" k ON k.id=c."contactId" JOIN "User" u ON u.id=k."userId" WHERE u.email=$1 ORDER BY c."lastMessageAt" DESC LIMIT 1', [email]);
  if (!c.rows[0]) throw new Error("диалог не создан");
  convId = c.rows[0].id;
  await shot("09-support-customer");
  return `диалог ${c.rows[0].status}, темы [${c.rows[0].tags.join(", ")}], заказы [${c.rows[0].orderNumbers.join(", ")}], назначен: ${c.rows[0].assigneeId ? "да" : "нет"}`;
});

await step("CRM: ответ из единого inbox", async () => {
  await crm.goto(`${base}/crm/support?c=${convId}`);
  let ta = crm.locator('textarea[name="text"]');
  if (!(await ta.count())) {
    await crm.goto(`${base}/crm/support`);
    await crm.locator(`a[href*="${convId}"]`).first().click();
    await crm.waitForTimeout(1500);
    ta = crm.locator('textarea[name="text"]');
  }
  await ta.first().fill("Добрый день! Деньги за возврат придут в течение 3–10 рабочих дней.");
  await ta.first().press("Control+Enter");
  await crm.waitForTimeout(1500);
  let m = await sql.query('SELECT count(*)::int AS n FROM "Message" WHERE "conversationId"=$1 AND direction=$2', [convId, "OUT"]);
  if (m.rows[0].n === 0) {
    await crm.locator('form:has(textarea[name="text"]) button[type="submit"], form:has(textarea[name="text"]) button.btn-primary').first().click();
    await crm.waitForTimeout(2000);
    m = await sql.query('SELECT count(*)::int AS n FROM "Message" WHERE "conversationId"=$1 AND direction=$2', [convId, "OUT"]);
  }
  if (m.rows[0].n === 0) throw new Error("ответ не сохранён");
  await crm.screenshot({ path: "e2e-10-crm-support.png" });
  await page.goto(`${base}/account/support`);
  const txt = await page.textContent("body");
  return /3–10 рабочих/.test(txt) ? "ответ виден в кабинете" : "ответ сохранён";
});

await step("Подарочный сертификат: покупка и демо-оплата", async () => {
  await page.goto(`${base}/gift`);
  await page.locator('input[name="amount"]').first().check({ force: true });
  await page.click('button:has-text("Перейти к оплате")');
  await page.waitForURL(/\/account\/giftcards\/[^/?]+/, { timeout: 20000 });
  const cardId = page.url().match(/giftcards\/([^/?]+)/)[1];
  await page.locator('button:has-text("Оплатить")').first().click();
  await page.waitForTimeout(3000);
  const g = await sql.query('SELECT status, amount, balance FROM "GiftCard" WHERE id=$1', [cardId]);
  if (g.rows[0].status !== "ACTIVE") throw new Error(`статус ${g.rows[0].status}`);
  await shot("11-giftcard");
  return `ACTIVE, ${g.rows[0].amount / 100} ₽`;
});

await step("CRM: ежедневные задачи лояльности", async () => {
  await crm.goto(`${base}/crm/loyalty`);
  await crm.click('button:has-text("Запустить ежедневные задачи")');
  await crm.waitForTimeout(15000);
  const a = await sql.query('SELECT payload FROM "AuditLog" WHERE action=$1 ORDER BY "createdAt" DESC LIMIT 1', ["jobs.daily"]);
  if (!a.rows[0]) throw new Error("задачи не выполнились");
  await crm.screenshot({ path: "e2e-12-jobs.png" });
  return JSON.stringify(a.rows[0].payload);
});

await step("CRM: дашборд, клиенты, склад, аналитика открываются", async () => {
  const out = [];
  for (const p of ["/crm", "/crm/customers", "/crm/stock", "/crm/analytics", "/crm/campaigns", "/crm/staff", "/crm/audit"]) {
    const r = await crm.goto(`${base}${p}`);
    out.push(`${p}:${r.status()}`);
    if (r.status() !== 200) throw new Error(out.join(" "));
  }
  return out.join(" ");
});

await step("Сайт: публичные страницы открываются", async () => {
  const out = [];
  for (const p of ["/", "/catalog", "/lookbook", "/journal", "/circle", "/gift", "/about", "/delivery", "/sizes", "/offer", "/privacy", "/preloved", "/nope-404"]) {
    const r = await page.goto(`${base}${p}`);
    out.push(`${p}:${r.status()}`);
  }
  return out.join(" ");
});

await browser.close();
await sql.end();
console.log(results.join("\n"));
