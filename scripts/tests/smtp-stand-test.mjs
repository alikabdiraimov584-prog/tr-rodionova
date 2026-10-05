// Запуск на стенде: BASE_URL=http://127.0.0.1:3100 node scripts/tests/smtp-stand-test.mjs (нужны smtp-server, mailparser, playwright-core)
// Стенд: локальный SMTP-сервер принимает письма сайта; через CRM включаем канал Email на него и проверяем кнопку теста и восстановление пароля.
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { chromium } from "playwright-core";

const received = [];
const server = new SMTPServer({
  secure: false, disabledCommands: ["STARTTLS"], authOptional: false,
  onAuth(auth, session, cb) { auth.username === "care@tr-rodionova.ru" && auth.password === "app-password-1" ? cb(null, { user: auth.username }) : cb(new Error("Invalid login")); },
  onData(stream, session, cb) { let buf = ""; stream.on("data", (d) => (buf += d)); stream.on("end", async () => { received.push(await simpleParser(buf)); cb(); }); },
});
await new Promise((r) => server.listen(2525, "127.0.0.1", r));
const base = "http://127.0.0.1:3100";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(`${base}/login`); await p.fill('input[name="email"]', "admin@tr-rodionova.ru"); await p.fill('input[name="password"]', "admin12345"); await p.click("form button.btn-primary");
await p.waitForURL(/\/crm/, { timeout: 20000 });
await p.goto(`${base}/crm/settings/channels`);
const form = p.locator('form:has(input[name="channel"][value="EMAIL"])');
await form.locator('input[name="enabled"]').check();
await form.locator('input[name="from"]').fill("care@tr-rodionova.ru");
await form.locator('input[name="fromName"]').fill("T.Rodionova");
await form.locator('input[name="smtpHost"]').fill("127.0.0.1");
await form.locator('input[name="smtpPort"]').fill("2525");
await form.locator('input[name="smtpUser"]').fill("care@tr-rodionova.ru");
await form.locator('input[name="smtpPassword"]').fill("app-password-1");
await form.locator('input[name="imapHost"]').fill("127.0.0.1");
await form.locator("button.btn-outline").click();
await p.waitForTimeout(1500);
console.log("save:", (await form.locator(".text-success, .text-danger").first().textContent().catch(() => "")) || "(no message)");
// кнопка теста: письмо уйдёт на локальный SMTP, IMAP ожидаемо не ответит (сервера нет)
const test = p.locator('form:has(input[name="to"])');
await test.locator('input[name="to"]').fill("owner@example.com");
await test.locator("button").click();
await p.waitForTimeout(8000);
console.log("test:", await test.locator(".text-success, .text-danger").first().textContent().catch(() => "(no message)"));
// восстановление пароля клиентки → письмо через SMTP
const guest = await (await b.newContext()).newPage();
await guest.goto(`${base}/forgot`);
await guest.fill('input[name="email"]', "anna@example.com");
await guest.click("form button.btn-primary");
await guest.waitForTimeout(4000);
console.log("forgot:", (await guest.textContent("body")).replace(/\s+/g, " ").match(/(Если такой аккаунт.{0,80}|Почта не подключена.{0,60}|временно недоступн.{0,60})/)?.[0] ?? "(?)");
console.log("received:", received.length, received.map((m) => `${m.from?.text} -> ${m.to?.text} | ${m.subject} | ${(m.text || "").slice(0, 60).replace(/\n/g, " ")} | List-Unsubscribe: ${m.headers.get("list-unsubscribe") ?? "-"}`).join("\n  "));
// порядок на стенде: канал выключаем
await p.goto(`${base}/crm/settings/channels`);
await form.locator('input[name="enabled"]').uncheck(); await form.locator("button.btn-outline").click(); await p.waitForTimeout(1000);
await b.close(); server.close();
process.exit(received.length >= 2 ? 0 : 1);
