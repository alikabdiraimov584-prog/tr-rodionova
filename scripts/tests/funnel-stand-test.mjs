// Воронка писем покупательнице на стенде: подставной SMTP принимает всё, что сайт отправляет, подставной Telegram —
// оповещения владельцу. Проходит регистрацию, заказы с тремя способами оплаты, сборку, доставку, отзыв, баллы,
// напоминания об оплате и автоотмену, сертификат с получателем, ответ поддержки, выкуп и «сообщить о поступлении».
// Все письма сохраняются в FUNNEL_OUT (по умолчанию funnel-mail.txt) для чтения глазами.
// Стенд: next start с CRON_SECRET=funnel-cron, TELEGRAM_API_URL=http://127.0.0.1:2626, APP_URL=http://127.0.0.1:3100.
// Запуск: DATABASE_URL=… AUTH_SECRET=<как у стенда> BASE_URL=http://127.0.0.1:3100 CHROME_PATH=… node scripts/tests/funnel-stand-test.mjs
import http from "node:http";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const cron = (job) => fetch(`${base}/api/cron${job ? `?job=${job}` : ""}`, { headers: { authorization: "Bearer funnel-cron" } }).then((r) => r.json());
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
await sql.connect();
const q = async (text, params = []) => (await sql.query(text, params)).rows;

const mails = [];
const smtp = new SMTPServer({
  secure: false, disabledCommands: ["STARTTLS"], authOptional: true,
  onAuth(_a, _s, cb) { cb(null, { user: "care" }); },
  onData(stream, _s, cb) { let buf = ""; stream.on("data", (d) => (buf += d)); stream.on("end", async () => { const m = await simpleParser(buf); mails.push({ to: m.to?.text ?? "", subject: m.subject ?? "", text: (m.text ?? "").trim() }); cb(); }); },
});
await new Promise((r) => smtp.listen(2525, "127.0.0.1", r));
const tg = [];
const tgServer = http.createServer((req, res) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => { tg.push(JSON.parse(b || "{}").text ?? ""); res.setHeader("content-type", "application/json"); res.end('{"ok":true}'); }); });
await new Promise((r) => tgServer.listen(2626, "127.0.0.1", r));

let fails = 0;
const check = (name, ok, info = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); if (!ok) fails++; };
const wait = async (pred, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return true; await new Promise((r) => setTimeout(r, 200)); } return pred(); };
const mailTo = (to, re) => mails.find((m) => m.to.includes(to) && re.test(m.subject));

// настройка: канал Email на подставной SMTP и Telegram владельцу (через код, как кнопка «Сохранить» в CRM)
// код действий сайта выполняется отдельным процессом tsx из временного файла рядом с тестом (пути @/ из tsconfig);
// асинхронно: пока он работает, этот процесс принимает его письма подставным SMTP
let helperN = 0;
const helper = async (code) => {
  const imports = code.split("\n").filter((l) => l.startsWith("import ")).join("\n");
  const body = code.split("\n").filter((l) => !l.startsWith("import ")).join("\n");
  const file = path.join(process.cwd(), "scripts", "tests", `.funnel-helper-${process.pid}-${helperN++}.ts`);
  writeFileSync(file, `${imports}\n(async () => {\n${body}\n})().catch((e) => { console.error(e); process.exit(1); });\n`);
  try {
    return (await promisify(execFile)("node", ["--conditions=react-server", "--import", "tsx", file], { env: process.env, encoding: "utf8", cwd: process.cwd(), timeout: 120_000 })).stdout;
  } finally {
    rmSync(file, { force: true });
  }
};
await helper(`
import { db } from "@/lib/db";
import { encodeChannelConfig } from "@/lib/support/channel-config";
import { saveIntegration } from "@/lib/integrations/store";
const config = encodeChannelConfig("EMAIL", { from: "care@tr-rodionova.ru", fromName: "T.Rodionova", smtpHost: "127.0.0.1", smtpPort: "2525", smtpUser: "care@tr-rodionova.ru", smtpPassword: "x" });
await db.channelIntegration.upsert({ where: { channel: "EMAIL" }, update: { enabled: true, config }, create: { channel: "EMAIL", name: "Почта", enabled: true, config } });
await saveIntegration("telegram_alerts", { botToken: "123:abc", chatId: "42" }, [], true);
await db.$disconnect();
`);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext()).newPage();
const email = `funnel${Date.now()}@example.com`;

// 1. регистрация → приветствие
await page.goto(`${base}/register`);
await page.fill('input[name="firstName"]', "Вера");
await page.fill('input[name="email"]', email);
await page.fill('input[name="phone"]', "+79990002233");
await page.fill('input[name="password"]', "funnel12345678");
for (const cb of await page.locator('input[type="checkbox"]').all()) await cb.check().catch(() => {});
await page.click("form button.btn-primary");
await page.waitForURL(/\/account/, { timeout: 20000 });
check("регистрация: приветственное письмо", await wait(() => !!mailTo(email, /Добро пожаловать/)), mailTo(email, /Добро пожаловать/)?.subject);
const [user] = await q('SELECT id FROM "User" WHERE email=$1', [email]);

async function addToCart() {
  await page.goto(`${base}/catalog`);
  const links = await page.locator('a[href^="/product/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  for (const href of links.slice(0, 8)) {
    await page.goto(base + href);
    const sizes = page.locator("button.min-w-12:not(.line-through)");
    if ((await sizes.count()) === 0) continue;
    await sizes.first().click();
    const btn = page.locator("form button.btn-primary", { hasText: /в корзину/i }).first();
    if (!(await btn.count())) continue;
    await btn.click();
    await page.waitForTimeout(1200);
    const [{ n }] = await q('SELECT count(*)::int AS n FROM "CartItem" WHERE "userId"=$1', [user.id]);
    if (n > 0) return;
  }
  throw new Error("не удалось положить вещь в корзину");
}

async function checkout(method) {
  await addToCart();
  await page.goto(`${base}/checkout`);
  await page.locator('label:has(input[name="deliveryMethod"][value="CDEK"])').click();
  await page.waitForTimeout(400);
  await page.fill('textarea[name="addressText"]', "Москва, ул. Тверская, д. 1, кв. 1, 125009");
  await page.locator('button:has-text("Далее")').first().click();
  await page.waitForTimeout(400);
  await page.locator(`label:has(input[name="paymentMethod"][value="${method}"])`).click();
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Далее")').first().click();
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Подтвердить заказ")').first().click({ noWaitAfter: true });
  await page.waitForURL(/\/account\/orders\/[^/?]+/, { timeout: 30000 });
  const id = page.url().match(/orders\/([^/?]+)/)[1];
  const [o] = await q('SELECT number FROM "Order" WHERE id=$1', [id]);
  return { id, number: o.number };
}

// 2. заказ картой: принят → оплачен, владельцу — «оплачен»
const o1 = await checkout("CARD");
check("карта: письмо «принят» без требования оплаты", await wait(() => !!mailTo(email, new RegExp(`Заказ №${o1.number} принят`))) && /пришлём подтверждение/.test(mailTo(email, new RegExp(`№${o1.number} принят`))?.text ?? ""));
await page.click('button:has-text("Оплатить")');
check("карта: письмо «оплачен»", await wait(() => !!mailTo(email, new RegExp(`№${o1.number} оплачен`))));
check("владелец: Telegram «Оплачен заказ»", await wait(() => tg.some((t) => t.includes(`Оплачен заказ №${o1.number}`) && t.includes("/crm/orders/"))), tg.at(-1)?.split("\n")[0]);

// 3. при получении и переводом: тексты и оповещение владельцу сразу
const o2 = await checkout("CASH_ON_DELIVERY");
check("при получении: «оплата при получении» в письме", await wait(() => /Оплата при получении/.test(mailTo(email, new RegExp(`№${o2.number} принят`))?.text ?? "")));
check("при получении: Telegram «Новый заказ»", await wait(() => tg.some((t) => t.includes(`Новый заказ №${o2.number}`) && t.includes("оплата при получении"))));
const o3 = await checkout("MANUAL");
check("перевод: реквизиты в письме", await wait(() => /Расчётный счёт|реквизиты/i.test(mailTo(email, new RegExp(`№${o3.number} принят`))?.text ?? "")));
check("перевод: Telegram «ждёт перевода»", await wait(() => tg.some((t) => t.includes(`Новый заказ №${o3.number}`) && t.includes("перевода"))));

// 4. CRM: сборка, отправка, курьер, доставка; заказ «при получении» — подтверждение без «спасибо за оплату» и сумма к оплате
const crm = await (await browser.newContext()).newPage();
await crm.goto(`${base}/login`);
await crm.fill('form:has(input[name="password"]) input[name="email"]', "admin@tr-rodionova.ru");
await crm.fill('input[name="password"]', "admin12345");
await crm.click('form:has(input[name="password"]) button.btn-primary');
await crm.waitForURL(/\/crm/, { timeout: 20000 });
for (const status of ["CONFIRMED", "PACKING", "SHIPPED", "DELIVERED"]) {
  await crm.goto(`${base}/crm/orders/${o1.id}`);
  if (status === "DELIVERED") {
    // кнопка «курьер в течение часа» — только у курьерской доставки
    await q(`UPDATE "Order" SET "deliveryMethod"='COURIER' WHERE id=$1`, [o1.id]);
    await crm.reload();
    await crm.click('button:has-text("Сообщить: курьер будет в течение часа")');
    await crm.waitForTimeout(1500);
  }
  await crm.selectOption('select[name="status"]', status);
  if (status === "SHIPPED") await crm.locator('form:has(select[name="status"]) input[name="trackingNumber"]').fill("CDEK0000000001");
  await crm.locator('select[name="status"]').locator("xpath=ancestor::form").locator("button.btn-primary").click();
  await crm.waitForTimeout(1800);
}
for (const status of ["PAID", "CONFIRMED", "PACKING", "SHIPPED"]) {
  await crm.goto(`${base}/crm/orders/${o2.id}`);
  await crm.selectOption('select[name="status"]', status);
  if (status === "SHIPPED") await crm.locator('form:has(select[name="status"]) input[name="trackingNumber"]').fill("CDEK0000000002");
  await crm.locator('select[name="status"]').locator("xpath=ancestor::form").locator("button.btn-primary").click();
  await crm.waitForTimeout(1500);
}
const codPaid = () => mails.find((m) => m.to.includes(email) && new RegExp(`№${o2.number} (оплачен|подтверждён)`).test(m.subject));
check("при получении: «подтверждён», без «оплата получена»", (await wait(() => !!codPaid())) && /подтверждён/.test(codPaid().subject) && !/Оплата .* получена/.test(codPaid().text) && /К оплате при получении/.test(codPaid().text), codPaid()?.subject);
check("при получении: сумма к оплате в письме об отправке", await wait(() => /К оплате при получении/.test(mails.find((m) => m.to.includes(email) && m.subject.includes(`№${o2.number} передан`))?.text ?? "")));
check("при получении: нет второго оповещения «Оплачен» владельцу", !tg.some((t) => t.includes(`Оплачен заказ №${o2.number}`)));
check("отправка: письмо с треком", await wait(() => /CDEK0000000001/.test(mailTo(email, /передан в доставку/)?.text ?? "")));
check("курьер: письмо «в течение часа»", await wait(() => !!mailTo(email, /в течение часа/)));
check("доставка: письмо «доставлен»", await wait(() => !!mailTo(email, new RegExp(`№${o1.number} доставлен`))));

// печать: три отдельных документа
const cookie = (await crm.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
for (const [doc, h1] of [["picking", "Сборочный лист"], ["invoice", "Товарная накладная"], ["return", "Заявление на возврат"]]) {
  const html = await (await fetch(`${base}/crm/orders/${o1.id}/print?doc=${doc}`, { headers: { cookie } })).text();
  const count = (html.match(/<h1>/g) ?? []).length;
  check(`печать ${doc}: один документ «${h1}»`, count === 1 && html.includes(`<h1>${h1}`) && html.includes(`<title>${h1}`), `h1: ${count}`);
}

// 5. ночные задачи: просьба об отзыве (10 дней), баллы после срока возврата
await q(`UPDATE "Order" SET "deliveredAt"=now()-interval '11 days' WHERE id=$1`, [o1.id]);
await cron();
check("10 дней после доставки: просьба об отзыве", await wait(() => !!mailTo(email, /Как вам вещи/)));
await q(`UPDATE "Order" SET "deliveredAt"=now()-interval '15 days' WHERE id=$1`, [o1.id]);
await cron();
const [st1] = await q('SELECT status, "pointsEarned" FROM "Order" WHERE id=$1', [o1.id]);
check("после срока возврата: заказ завершён, письмо о баллах", st1.status === "COMPLETED" && (await wait(() => !!mailTo(email, /Баллы за заказ/))), `${st1.status}, ${st1.pointsEarned} баллов`);

// 6. неоплаченный заказ картой: напоминание через 2 ч, последний звонок, автоотмена
const o4 = await checkout("CARD");
await q(`UPDATE "Order" SET "createdAt"=now()-interval '3 hours' WHERE id=$1`, [o4.id]);
await cron("hourly");
check("2 часа без оплаты: напоминание", await wait(() => !!mailTo(email, new RegExp(`№${o4.number} ждёт оплаты`))));
await q(`UPDATE "Order" SET "createdAt"=now()-interval '23 hours 30 minutes' WHERE id=$1`, [o4.id]);
await cron("hourly");
check("за час до снятия резерва: последнее напоминание", await wait(() => !!mailTo(email, /снимается через час/)));
await q(`UPDATE "Order" SET "createdAt"=now()-interval '25 hours' WHERE id=$1`, [o4.id]);
await cron("hourly");
check("через сутки: отмена и письмо с причиной", (await wait(() => !!mailTo(email, new RegExp(`№${o4.number} отменён`)))) && /оплата не поступила/.test(mailTo(email, new RegExp(`№${o4.number} отменён`)).text));
const health = await (await fetch(`${base}/api/health`)).json();
check("планировщик отмечен в /api/health", !!health.jobs?.dailyAt && !!health.jobs?.hourlyAt, JSON.stringify(health.jobs));

// 7. сертификат получателю с пожеланием
await page.goto(`${base}/gift`);
await page.locator('input[name="amount"]').first().check({ force: true });
await page.fill('input[name="recipientName"]', "Мария");
await page.fill('input[name="recipientEmail"]', "maria-gift@example.com");
await page.fill('textarea[name="message"]', "С днём рождения!");
await page.click('button:has-text("Перейти к оплате")');
await page.waitForURL(/\/account\/giftcards\/[^/?]+/, { timeout: 20000 });
await page.locator('button:has-text("Оплатить")').first().click();
const giftMail = () => mails.find((m) => m.to.includes("maria-gift@example.com"));
check("сертификат: письмо получателю с кодом и пожеланием", await wait(() => !!giftMail()) && /Код сертификата/.test(giftMail().text) && /С днём рождения!/.test(giftMail().text));
check("сертификат: подтверждение покупателю", await wait(() => !!mailTo(email, /Сертификат на .* оплачен/)));
check("сертификат: без «г..» в дате", !mails.some((m) => /г\.\./.test(m.text)));

// 8. ответ поддержки в чате сайта → копия на почту
await page.goto(`${base}/account/support`);
await page.fill('textarea[name="text"]', "Подскажите, как ухаживать за шерстью?");
await page.click('button:has-text("Отправить")');
await page.waitForTimeout(1500);
const [conv] = await q('SELECT id FROM "Conversation" WHERE "customerId"=$1 ORDER BY "lastMessageAt" DESC LIMIT 1', [user.id]);
await crm.goto(`${base}/crm/support?c=${conv.id}`);
await crm.locator("textarea").first().fill("Добрый день! Шерсть стираем вручную при 30 °C.");
await crm.locator('form:has(textarea[name="text"]) button[type="submit"], form:has(textarea[name="text"]) button.btn-primary').first().click();
check("ответ поддержки: письмо клиентке", await wait(() => /при 30 °C/.test(mailTo(email, /Новое сообщение/)?.text ?? "")));

// 9. выкуп и «сообщить о поступлении» — через код действий
const out = await helper(`
import { db } from "@/lib/db";
import { notifyResale } from "@/lib/notifications";
import { notifyWaitlist } from "@/lib/waitlist";
const user = await db.user.findUniqueOrThrow({ where: { email: "${email}" } });
const item = await db.orderItem.findFirstOrThrow({ where: { orderId: "${o1.id}" } });
const r = await db.resaleRequest.create({ data: { userId: user.id, orderItemId: item.id, description: "носила два раза", status: "OFFERED", offerPoints: 3500, managerNote: "Состояние отличное" } });
await notifyResale(r.id, "RESALE_OFFERED");
const v = await db.productVariant.findFirstOrThrow({ where: { stock: { gte: 2 } } });
await db.stockSubscription.deleteMany({ where: { userId: user.id, variantId: v.id } });
await db.stockSubscription.create({ data: { userId: user.id, variantId: v.id } });
console.log("waitlist", await notifyWaitlist(v.id));
await db.$disconnect();
`);
check("выкуп: письмо с предложением", await wait(() => /3\s500 баллов/.test(mailTo(email, /Предложение по выкупу/)?.text ?? "")));
check("поступление: письмо «снова в наличии»", await wait(() => !!mailTo(email, /снова в наличии/)), out.trim());

writeFileSync(process.env.FUNNEL_OUT ?? "funnel-mail.txt", [...mails.map((m) => `=== ${m.to} | ${m.subject}\n${m.text}\n`), ...tg.map((t) => `=== Telegram\n${t}\n`)].join("\n"));
console.log(`\nПисем: ${mails.length}, сообщений в Telegram: ${tg.length}`);
console.log(fails ? `Провалено: ${fails}` : "Все проверки прошли");
await browser.close(); await sql.end(); smtp.close(); tgServer.close();
process.exit(fails ? 1 : 0);
